export enum ProxyPool {
  DATACENTER = 'datacenter',
  RESIDENTIAL = 'residential',
}

export enum OperatingSystem {
  LINUX = 'linux',
  WINDOWS = 'windows',
  MACOS = 'macos',
}

export type BrowserConfigOptions = {
  proxy_pool?: ProxyPool | string;
  os?: OperatingSystem | string;
  session?: string;
  country?: string;
  auto_close?: boolean;
  timeout?: number;
  debug?: boolean;
  extensions?: string[];
  block_images?: boolean;
  block_styles?: boolean;
  block_fonts?: boolean;
  block_media?: boolean;
  screenshot?: boolean;
  resolution?: string;
  target_url?: string;
  cache?: boolean;
  blacklist?: boolean;
  unblock?: boolean;
  unblock_timeout?: number;
  browser_brand?: string;
};

export class BrowserConfig {
  proxy_pool?: string;
  os?: string;
  session?: string;
  country?: string;
  auto_close?: boolean;
  timeout?: number;
  debug?: boolean;
  extensions?: string[];
  block_images?: boolean;
  block_styles?: boolean;
  block_fonts?: boolean;
  block_media?: boolean;
  screenshot?: boolean;
  resolution?: string;
  target_url?: string;
  cache?: boolean;
  blacklist?: boolean;
  unblock?: boolean;
  unblock_timeout?: number;
  browser_brand?: string;

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
  }

  /**
   * Generate the WebSocket URL for a Cloud Browser session.
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

    const baseHost = host || 'wss://browser.scrapfly.io';
    return `${baseHost}?${params.toString()}`;
  }
}
