/** Proxy pool to use for the Cloud Browser session. */
export enum ProxyPool {
  /** Datacenter proxies — fast and cheap; best for non-protected targets. */
  DATACENTER = 'datacenter',
  /** Residential proxies — real ISP IPs; required by most anti-bot protections. */
  RESIDENTIAL = 'residential',
}

/** Operating system to emulate for the Cloud Browser session fingerprint. */
export enum OperatingSystem {
  /** Emulate a Linux browser fingerprint. */
  LINUX = 'linux',
  /** Emulate a Windows browser fingerprint. */
  WINDOWS = 'windows',
  /** Emulate a macOS browser fingerprint. */
  MACOS = 'macos',
}

/**
 * User-facing options accepted by {@link BrowserConfig}. All fields are
 * optional; any field left undefined falls back to the Scrapfly Cloud
 * Browser defaults.
 */
export type BrowserConfigOptions = {
  /** Proxy pool to route the session through. */
  proxy_pool?: ProxyPool | string;
  /** Operating system fingerprint to emulate. */
  os?: OperatingSystem | string;
  /** Session ID for sticky sessions (IP + cookies reused across scrapes). */
  session?: string;
  /** ISO country code for geo-targeting. */
  country?: string;
  /** Close the browser automatically when the connection drops. */
  auto_close?: boolean;
  /** Session timeout in seconds (max 1800 = 30 minutes). */
  timeout?: number;
  /** Enable debug trace for the session. */
  debug?: boolean;
  /** Browser extensions to load (by ID). */
  extensions?: string[];
  /** Block image requests to speed up navigation. */
  block_images?: boolean;
  /** Block stylesheet requests. */
  block_styles?: boolean;
  /** Block font requests. */
  block_fonts?: boolean;
  /** Block media (video/audio) requests. */
  block_media?: boolean;
  /** Capture a screenshot at session end. */
  screenshot?: boolean;
  /** Viewport resolution, formatted as "widthxheight" (e.g. "1920x1080"). */
  resolution?: string;
  /** URL to navigate to after session start. */
  target_url?: string;
  /** Reuse cached responses where possible. */
  cache?: boolean;
  /** Apply Scrapfly's abuse blacklist. */
  blacklist?: boolean;
  /** Enable anti-scraping-protection bypass. */
  unblock?: boolean;
  /** Timeout in seconds for the unblock step. */
  unblock_timeout?: number;
  /** Browser brand to emulate (e.g. "chrome", "firefox"). */
  browser_brand?: string;
  /** Enable the MCP (Model Context Protocol) bridge. */
  enable_mcp?: boolean;
  /**
   * Arm Scrapium's built-in captcha detector + solver on the first page attach.
   * Turnstile, DataDome slider, reCAPTCHA, GeeTest, PerimeterX hold, and
   * puzzle captchas are handled automatically — no extra CDP calls from the
   * client. Billed per solve; failures cost nothing.
   * See https://scrapfly.io/docs/cloud-browser-api/captcha-solver
   */
  solve_captcha?: boolean;
  /**
   * Attach a Cloud Browser Credential Vault to the session by NAME — the
   * alphanumeric name you gave it at `cloudBrowserVaultCreate`. The server
   * resolves the name to the vault scoped to your api-key's project and
   * environment. Pair with `vault_key`.
   */
  vault?: string;
  /**
   * Customer-held vault key (base64). Forwarded as a query parameter so the
   * server can decrypt vault items at injection time. Treat as a secret —
   * never log or expose in error messages.
   */
  vault_key?: string;
  /** Enable the human-in-the-loop VNC channel (operator attach via Scrapfly's VNC mux). */
  enable_vnc?: boolean;
  /** Customer-chosen VNC password. Required when `enable_vnc` is true and `hitl_allowed_networks` is empty. */
  vnc_password?: string;
  /** Enable the human-in-the-loop WebRTC channel. */
  enable_rtc?: boolean;
  /** Optional WebRTC username. Defaults to "scrapfly" server-side. */
  rtc_username?: string;
  /** Customer-chosen WebRTC password. Required when `enable_rtc` is true and `hitl_allowed_networks` is empty. */
  rtc_password?: string;
  /**
   * IP allow-list for credential-free HITL attach. Source IPs in this list
   * skip password verification for VNC/WebRTC/downloads. Pass either a
   * comma-separated string or an array of bare IPs / CIDRs.
   */
  hitl_allowed_networks?: string | string[];
};

/**
 * Configuration for a Scrapfly Cloud Browser session. Builds the
 * WebSocket URL that clients such as Puppeteer or Playwright can
 * connect to via CDP.
 */
export class BrowserConfig {
  /** See {@link BrowserConfigOptions.proxy_pool}. */
  proxy_pool?: string;
  /** See {@link BrowserConfigOptions.os}. */
  os?: string;
  /** See {@link BrowserConfigOptions.session}. */
  session?: string;
  /** See {@link BrowserConfigOptions.country}. */
  country?: string;
  /** See {@link BrowserConfigOptions.auto_close}. */
  auto_close?: boolean;
  /** See {@link BrowserConfigOptions.timeout}. */
  timeout?: number;
  /** See {@link BrowserConfigOptions.debug}. */
  debug?: boolean;
  /** See {@link BrowserConfigOptions.extensions}. */
  extensions?: string[];
  /** See {@link BrowserConfigOptions.block_images}. */
  block_images?: boolean;
  /** See {@link BrowserConfigOptions.block_styles}. */
  block_styles?: boolean;
  /** See {@link BrowserConfigOptions.block_fonts}. */
  block_fonts?: boolean;
  /** See {@link BrowserConfigOptions.block_media}. */
  block_media?: boolean;
  /** See {@link BrowserConfigOptions.screenshot}. */
  screenshot?: boolean;
  /** See {@link BrowserConfigOptions.resolution}. */
  resolution?: string;
  /** See {@link BrowserConfigOptions.target_url}. */
  target_url?: string;
  /** See {@link BrowserConfigOptions.cache}. */
  cache?: boolean;
  /** See {@link BrowserConfigOptions.blacklist}. */
  blacklist?: boolean;
  /** See {@link BrowserConfigOptions.unblock}. */
  unblock?: boolean;
  /** See {@link BrowserConfigOptions.unblock_timeout}. */
  unblock_timeout?: number;
  /** See {@link BrowserConfigOptions.browser_brand}. */
  browser_brand?: string;
  /** See {@link BrowserConfigOptions.enable_mcp}. */
  enable_mcp?: boolean;
  /** See {@link BrowserConfigOptions.solve_captcha}. */
  solve_captcha?: boolean;
  /** See {@link BrowserConfigOptions.vault}. */
  vault?: string;
  /** See {@link BrowserConfigOptions.vault_key}. */
  vault_key?: string;
  /** See {@link BrowserConfigOptions.enable_vnc}. */
  enable_vnc?: boolean;
  /** See {@link BrowserConfigOptions.vnc_password}. */
  vnc_password?: string;
  /** See {@link BrowserConfigOptions.enable_rtc}. */
  enable_rtc?: boolean;
  /** See {@link BrowserConfigOptions.rtc_username}. */
  rtc_username?: string;
  /** See {@link BrowserConfigOptions.rtc_password}. */
  rtc_password?: string;
  /** See {@link BrowserConfigOptions.hitl_allowed_networks}. */
  hitl_allowed_networks?: string;

  /**
   * @param options Session options. See {@link BrowserConfigOptions}.
   * @throws `Error` if `timeout` exceeds the upper bound of 1800 seconds.
   */
  constructor(options: BrowserConfigOptions = {}) {
    if (options.timeout !== undefined && options.timeout > 1800) {
      throw new Error('timeout cannot exceed 1800 seconds (30 minutes)');
    }
    this.proxy_pool = options.proxy_pool;
    this.os = options.os;
    this.session = options.session;
    this.country = options.country;
    this.auto_close = options.auto_close;
    this.timeout = options.timeout;
    this.debug = options.debug;
    this.extensions = options.extensions;
    this.block_images = options.block_images;
    this.block_styles = options.block_styles;
    this.block_fonts = options.block_fonts;
    this.block_media = options.block_media;
    this.screenshot = options.screenshot;
    this.resolution = options.resolution;
    this.target_url = options.target_url;
    this.cache = options.cache;
    this.blacklist = options.blacklist;
    this.unblock = options.unblock;
    this.unblock_timeout = options.unblock_timeout;
    this.browser_brand = options.browser_brand;
    this.enable_mcp = options.enable_mcp;
    this.solve_captcha = options.solve_captcha;
    this.vault = options.vault;
    this.vault_key = options.vault_key;
    this.enable_vnc = options.enable_vnc;
    this.vnc_password = options.vnc_password;
    this.enable_rtc = options.enable_rtc;
    this.rtc_username = options.rtc_username;
    this.rtc_password = options.rtc_password;
    if (Array.isArray(options.hitl_allowed_networks)) {
      const cleaned = options.hitl_allowed_networks
        .map((s) => s.trim())
        .filter((s) => s.length > 0);
      this.hitl_allowed_networks = cleaned.length > 0 ? cleaned.join(',') : undefined;
    } else {
      this.hitl_allowed_networks = options.hitl_allowed_networks || undefined;
    }
  }

  /**
   * Return the deterministic project salt for an api_key (`sha256(api_key)[:8]`).
   * Matches the `X-Browser-Project-Salt` response header returned on a
   * successful Cloud Browser WebSocket upgrade. Useful for verifying that
   * an attach link belongs to your project before sharing it.
   *
   * Uses the Web Crypto API where available (modern Node and browsers).
   */
  static async projectSalt(apiKey: string): Promise<string> {
    const data = new TextEncoder().encode(apiKey);
    const digest = await crypto.subtle.digest('SHA-256', data);
    const bytes = new Uint8Array(digest);
    let hex = '';
    for (let i = 0; i < 4; i++) {
      hex += bytes[i].toString(16).padStart(2, '0');
    }
    return hex;
  }

  /**
   * Build the WebSocket URL clients use to connect to the Cloud Browser
   * session (compatible with Puppeteer `browserWSEndpoint` and the
   * Playwright `connectOverCDP` API).
   *
   * @param apiKey Scrapfly API key.
   * @param host Optional override for the Cloud Browser host (defaults to `wss://browser.scrapfly.io`).
   * @returns A fully-qualified `wss://…` URL with all options encoded as query parameters.
   */
  websocketUrl(apiKey: string, host?: string): string {
    const params = new URLSearchParams();
    params.set('api_key', apiKey);

    if (this.proxy_pool !== undefined) params.set('proxy_pool', this.proxy_pool);
    if (this.os !== undefined) params.set('os', this.os);
    if (this.session !== undefined) params.set('session', this.session);
    if (this.country !== undefined) params.set('country', this.country);
    if (this.auto_close !== undefined) params.set('auto_close', String(this.auto_close));
    if (this.timeout !== undefined) params.set('timeout', String(this.timeout));
    if (this.debug !== undefined) params.set('debug', String(this.debug));
    if (this.extensions && this.extensions.length > 0) params.set('extensions', this.extensions.join(','));
    if (this.block_images !== undefined) params.set('block_images', String(this.block_images));
    if (this.block_styles !== undefined) params.set('block_styles', String(this.block_styles));
    if (this.block_fonts !== undefined) params.set('block_fonts', String(this.block_fonts));
    if (this.block_media !== undefined) params.set('block_media', String(this.block_media));
    if (this.screenshot !== undefined) params.set('screenshot', String(this.screenshot));
    if (this.resolution !== undefined) params.set('resolution', this.resolution);
    if (this.target_url !== undefined) params.set('target_url', this.target_url);
    if (this.cache !== undefined) params.set('cache', String(this.cache));
    if (this.blacklist !== undefined) params.set('blacklist', String(this.blacklist));
    if (this.unblock !== undefined) params.set('unblock', String(this.unblock));
    if (this.unblock_timeout !== undefined) params.set('unblock_timeout', String(this.unblock_timeout));
    if (this.browser_brand !== undefined) params.set('browser_brand', this.browser_brand);
    if (this.enable_mcp !== undefined) params.set('enable_mcp', String(this.enable_mcp));
    if (this.solve_captcha !== undefined) params.set('solve_captcha', String(this.solve_captcha));
    if (this.vault !== undefined) params.set('vault', this.vault);
    if (this.vault_key !== undefined) params.set('vault_key', this.vault_key);
    if (this.enable_vnc !== undefined) params.set('enable_vnc', String(this.enable_vnc));
    if (this.vnc_password !== undefined) params.set('vnc_password', this.vnc_password);
    if (this.enable_rtc !== undefined) params.set('enable_rtc', String(this.enable_rtc));
    if (this.rtc_username !== undefined) params.set('rtc_username', this.rtc_username);
    if (this.rtc_password !== undefined) params.set('rtc_password', this.rtc_password);
    if (this.hitl_allowed_networks !== undefined) params.set('hitl_allowed_networks', this.hitl_allowed_networks);

    const baseHost = host || 'wss://browser.scrapfly.io';
    return `${baseHost}?${params.toString()}`;
  }
}
