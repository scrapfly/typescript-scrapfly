/**
 * Cloud Browser Configuration
 *
 * Provides `BrowserConfig` — the high-level configuration object for the
 * Scrapfly Cloud Browser API. The actual session is allocated when you
 * connect your CDP client (Playwright, Puppeteer, Selenium, etc.) to the
 * WebSocket URL returned by `ScrapflyClient.cloudBrowser`.
 *
 * Example:
 * ```ts
 * import { ScrapflyClient, BrowserConfig } from 'scrapfly-sdk';
 * import { chromium } from 'playwright';
 *
 * const client = new ScrapflyClient({ key: 'YOUR_API_KEY' });
 * const config = new BrowserConfig({
 *   proxy_pool: 'public_datacenter_pool',
 *   os: 'linux',
 *   country: 'us',
 * });
 * const browser = await chromium.connectOverCDP(client.cloudBrowser(config));
 * ```
 *
 * The fields mirror the Cloud Browser API query parameters documented at
 * https://scrapfly.io/docs/cloud-browser-api/getting-started — see the
 * public docs for the exact behavior of each option.
 */

/** Valid values for the cloud-browser pool selector. */
export const PROXY_POOL_DATACENTER = 'public_datacenter_pool' as const;
export const PROXY_POOL_RESIDENTIAL = 'public_residential_pool' as const;

export type ProxyPool = typeof PROXY_POOL_DATACENTER | typeof PROXY_POOL_RESIDENTIAL;

export type BrowserOS = 'linux' | 'windows' | 'mac';

/**
 * Chromium-based browser brand used for fingerprint generation.
 * Default: `'chrome'` when omitted. Invalid values are silently dropped by
 * the server (validated client-side in `BrowserConfig` for fast feedback).
 */
export type BrowserBrand = 'chrome' | 'edge' | 'brave' | 'opera';

export interface BrowserConfigOptions {
  /**
   * Either `'public_datacenter_pool'` (cheaper, faster) or
   * `'public_residential_pool'` (residential IPs for tougher targets).
   * Use the {@link PROXY_POOL_DATACENTER} / {@link PROXY_POOL_RESIDENTIAL}
   * constants for type safety. Default: server picks `public_datacenter_pool`.
   */
  proxy_pool?: ProxyPool;
  /** Browser operating system fingerprint. Default: server picks randomly. */
  os?: BrowserOS;
  /**
   * Chromium-based browser brand for fingerprint generation.
   * One of `'chrome' | 'edge' | 'brave' | 'opera'`. Default: `'chrome'`.
   */
  browser_brand?: BrowserBrand;
  /**
   * ISO 3166-1 alpha-2 country code for the proxy exit IP (e.g. 'us', 'gb', 'de').
   * Default: server picks from the proxy pool's preferred countries.
   */
  country?: string;
  /**
   * Stable user-supplied session ID. Two sessions with the same ID share the
   * same underlying browser instance (browser persistence across reconnects).
   */
  session?: string;
  /**
   * When true (default), the browser is released as soon as your CDP client
   * disconnects. Set false to keep the browser alive after disconnect.
   */
  auto_close?: boolean;
  /** Maximum session duration in seconds. Default 900 (15 min), max 1800. */
  timeout?: number;

  // Resource blocking
  block_images?: boolean;
  block_styles?: boolean;
  block_fonts?: boolean;
  block_media?: boolean;
  /** Enable screenshot mode (disables blocking of styles/fonts). */
  screenshot?: boolean;

  // Scrapium features
  cache?: boolean;
  blacklist?: boolean;

  /**
   * List of Chrome extension IDs to install in the browser (must be
   * uploaded via the Cloud Browser dashboard first).
   */
  extensions?: string[];

  /**
   * Bring Your Own Proxy URL. Format:
   * `{protocol}://{user}:{pass}@{host}:{port}`. Supported protocols:
   * http, https, socks5, socks5h, socks5+udp, socks5h+udp.
   * When set, `proxy_pool` is ignored.
   */
  byop_proxy?: string;
}

export class BrowserConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BrowserConfigError';
  }
}

/**
 * Configuration for a Cloud Browser session.
 *
 * All fields are optional. When omitted, the server applies its own documented
 * defaults (proxy_pool=public_datacenter_pool, OS=random, country=random from
 * the proxy pool, auto_close=true, timeout=900s).
 */
export class BrowserConfig {
  proxy_pool?: ProxyPool;
  os?: BrowserOS;
  browser_brand?: BrowserBrand;
  country?: string;
  session?: string;
  auto_close?: boolean;
  timeout?: number;
  block_images?: boolean;
  block_styles?: boolean;
  block_fonts?: boolean;
  block_media?: boolean;
  screenshot?: boolean;
  cache?: boolean;
  blacklist?: boolean;
  extensions?: string[];
  byop_proxy?: string;

  constructor(options: BrowserConfigOptions = {}) {
    // Strict validation of enum-like fields. The engine silently drops invalid
    // values, so we validate locally to give immediate feedback.
    if (options.proxy_pool !== undefined && options.proxy_pool !== PROXY_POOL_DATACENTER && options.proxy_pool !== PROXY_POOL_RESIDENTIAL) {
      throw new BrowserConfigError(
        `BrowserConfig.proxy_pool must be '${PROXY_POOL_DATACENTER}' or '${PROXY_POOL_RESIDENTIAL}', got '${options.proxy_pool}'`,
      );
    }
    if (options.os !== undefined && options.os !== 'linux' && options.os !== 'windows' && options.os !== 'mac') {
      throw new BrowserConfigError(
        `BrowserConfig.os must be one of 'linux'/'windows'/'mac', got '${options.os}'`,
      );
    }
    if (
      options.browser_brand !== undefined &&
      options.browser_brand !== 'chrome' &&
      options.browser_brand !== 'edge' &&
      options.browser_brand !== 'brave' &&
      options.browser_brand !== 'opera'
    ) {
      throw new BrowserConfigError(
        `BrowserConfig.browser_brand must be one of 'chrome'/'edge'/'brave'/'opera', got '${options.browser_brand}'`,
      );
    }

    Object.assign(this, options);
  }

  /**
   * Serialize this config to URLSearchParams for query encoding.
   *
   * Drops unset (`undefined`) fields so the server applies its own defaults
   * for anything the caller didn't explicitly set.
   */
  toQueryParams(): URLSearchParams {
    const params = new URLSearchParams();
    const stringFields: (keyof BrowserConfigOptions)[] = [
      'proxy_pool', 'os', 'browser_brand', 'country', 'session', 'byop_proxy',
    ];
    const numberFields: (keyof BrowserConfigOptions)[] = ['timeout'];
    const boolFields: (keyof BrowserConfigOptions)[] = [
      'auto_close', 'block_images', 'block_styles', 'block_fonts',
      'block_media', 'screenshot', 'cache', 'blacklist',
    ];

    for (const f of stringFields) {
      const v = this[f as keyof this];
      if (v !== undefined) params.set(f as string, String(v));
    }
    for (const f of numberFields) {
      const v = this[f as keyof this];
      if (v !== undefined) params.set(f as string, String(v));
    }
    for (const f of boolFields) {
      const v = this[f as keyof this];
      if (v !== undefined) params.set(f as string, v ? 'true' : 'false');
    }
    if (this.extensions && this.extensions.length > 0) {
      // Engine expects extensions as a comma-separated list.
      params.set('extensions', this.extensions.join(','));
    }
    return params;
  }

  /** Serialize to a URL-ready query string (without leading `?`). */
  toQueryString(): string {
    return this.toQueryParams().toString();
  }
}
