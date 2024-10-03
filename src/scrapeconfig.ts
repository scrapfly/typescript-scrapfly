import { urlsafe_b64encode } from './utils.ts';
import { log } from './logger.ts';
import type { HttpMethod, Rec } from './types.ts';
import { ScrapeConfigError } from './errors.ts';

export enum ScreenshotFlags {
  /**
    Options to customize the screenshot behavior
    Attributes:
        LOAD_IMAGES: Enable image rendering with the request, add extra usage for the bandwidth consumed.
        DARK_MODE: Enable dark mode display.
        BLOCK_BANNERS: Block cookies banners and overlay that cover the screen.
        PRINT_MEDIA_FORMAT: Render the page in the print mode.
    */
  LOAD_IMAGES = 'load_images',
  DARK_MODE = 'dark_mode',
  BLOCK_BANNERS = 'block_banners',
  PRINT_MEDIA_FORMAT = 'print_media_format',
  HIGH_QUALITY = 'high_quality',
}

export enum Format {
  /**
    Format of the scraped content.
    Attributes:
        JSON: JSON format.
        TEXT: Text format.
        MARKDOWN: Markdown format.
        CLEAN_HTML: Clean HTML format.
    */
  JSON = 'json',
  TEXT = 'text',
  MARKDOWN = 'markdown',
  CLEAN_HTML = 'clean_html',
  RAW = 'raw',
}

export enum FormatOption {
  NO_LINKS = 'no_links',
  NO_IMAGES = 'no_images',
  ONLY_CONTENT = 'only_content'
}

type ScrapeConfigOptions = {
  url: string;
  retry?: boolean;
  method?: HttpMethod;
  country?: string;
  render_js?: boolean;
  cache?: boolean;
  cache_clear?: boolean;
  cost_budget?: number;
  ssl?: boolean;
  dns?: boolean;
  asp?: boolean;
  debug?: boolean;
  raise_on_upstream_error?: boolean;
  cache_ttl?: number;
  proxy_pool?: string;
  session?: string;
  tags?: string[];
  format?: 'json' | 'text' | 'markdown' | 'clean_html' | 'raw' | Format;
  format_options?: ('no_links' | 'no_images' | 'only_content')[] | FormatOption[];
  correlation_id?: string;
  cookies?: Rec<string>;
  body?: string;
  data?: Rec<any>;
  headers?: Rec<string>;
  js?: string;
  rendering_wait?: number;
  wait_for_selector?: string;
  screenshots?: Rec<any>;
  screenshot_flags?: ('load_images' | 'dark_mode' | 'block_banners' | 'print_media_format' | 'high_quality')[] | ScreenshotFlags[];
  session_sticky_proxy?: boolean;
  webhook?: string;
  timeout?: number;
  js_scenario?: Rec<any>;
  os?: string;
  lang?: string[];
  auto_scroll?: boolean;
};

export class ScrapeConfig {
  static PUBLIC_DATACENTER_POOL = 'public_datacenter_pool';
  static PUBLIC_RESIDENTIAL_POOL = 'public_residential_pool';

  url: string;
  retry = true;
  method: HttpMethod = 'GET';
  country?: string | null = null;
  render_js = false;
  cache = false;
  cache_clear = false;
  cost_budget?: number;
  ssl = false;
  dns = false;
  asp = false;
  debug = false;
  raise_on_upstream_error = true;
  cache_ttl?: number;
  proxy_pool?: string;
  session?: string;
  tags: Set<string> = new Set<string>();
  format?: 'json' | 'text' | 'markdown' | 'clean_html' | 'raw' | Format;
  format_options?: ('no_links' | 'no_images' | 'only_content')[] | FormatOption[];
  correlation_id?: string;
  cookies?: Rec<string>;
  body?: string;
  data?: Rec<any>;
  headers?: Rec<string>;
  js?: string;
  rendering_wait?: number;
  wait_for_selector?: string;
  session_sticky_proxy = false;
  screenshots?: Rec<any>;
  screenshot_flags?: ('load_images' | 'dark_mode' | 'block_banners' | 'print_media_format' | 'high_quality')[] | ScreenshotFlags[];
  webhook?: string;
  timeout?: number; // in milliseconds
  js_scenario?: Rec<any>;
  lang?: string[];
  os?: string;
  auto_scroll?: boolean;

  constructor(options: ScrapeConfigOptions) {
    this.validateOptions(options);
    if (options.format && !Object.values(Format).includes(options.format as Format)) {
      throw new ScrapeConfigError(`Invalid Format param value: ${options.format}`);
    }
    this.format = options.format ?? this.format;
    if (options.format_options) {
      options.format_options.forEach((flag) => {
        if (!Object.values(FormatOption).includes(flag as FormatOption)) {
          throw new ScrapeConfigError(`Invalid FormatOption param value: ${flag}`);
        }
      });
    }
    if (options.screenshot_flags) {
      options.screenshot_flags.forEach((flag) => {
        if (!Object.values(ScreenshotFlags).includes(flag as ScreenshotFlags)) {
          throw new ScrapeConfigError(`Invalid ScreenshotFlags param value: ${flag}`);
        }
      });
    }
    this.url = options.url;
    this.retry = options.retry ?? this.retry;
    this.method = options.method ?? this.method;
    this.country = options.country ?? this.country;
    this.session_sticky_proxy = options.session_sticky_proxy ?? this.session_sticky_proxy;
    this.render_js = options.render_js ?? this.render_js;
    this.cache = options.cache ?? this.cache;
    this.cache_clear = options.cache_clear ?? this.cache_clear;
    this.cost_budget = options.cost_budget ?? this.cost_budget;
    this.asp = options.asp ?? this.asp;
    this.headers = options.headers
      ? Object.fromEntries(Object.entries(options.headers).map(([k, v]) => [k.toLowerCase(), v]))
      : {};
    this.raise_on_upstream_error = options.raise_on_upstream_error ?? this.raise_on_upstream_error;
    this.cache_ttl = options.cache_ttl ?? this.cache_ttl;
    this.proxy_pool = options.proxy_pool ?? this.proxy_pool;
    this.session = options.session ?? this.session;
    this.tags = new Set(options.tags) ?? this.tags;
    this.format = options.format ?? this.format;
    this.format_options = options.format_options ?? this.format_options;
    this.correlation_id = options.correlation_id ?? this.correlation_id;
    this.cookies = options.cookies
      ? Object.fromEntries(Object.entries(options.cookies).map(([k, v]) => [k.toLowerCase(), v]))
      : {};
    this.body = options.body ?? this.body;
    this.data = options.data ?? this.data;
    this.js = options.js ?? this.js;
    this.rendering_wait = options.rendering_wait ?? this.rendering_wait;
    this.wait_for_selector = options.wait_for_selector ?? this.wait_for_selector;
    this.screenshots = options.screenshots ?? this.screenshots;
    this.screenshot_flags = options.screenshot_flags ?? this.screenshot_flags;
    this.webhook = options.webhook ?? this.webhook;
    this.timeout = options.timeout ?? this.timeout;
    this.js_scenario = options.js_scenario ?? this.js_scenario;
    this.os = options.os ?? this.os;
    this.lang = options.lang ?? this.lang;
    this.auto_scroll = options.auto_scroll ?? this.auto_scroll;
    this.dns = options.dns ?? this.dns;
    this.ssl = options.ssl ?? this.ssl;
    this.debug = options.debug ?? this.debug;
    if (this.body && this.data) {
      throw new ScrapeConfigError('Cannot set both body and data');
    }
    if (['POST', 'PUT', 'PATCH'].includes(this.method)) {
      if (this.data && !this.body) {
        if (!this.headers['content-type']) {
          this.headers['content-type'] = 'application/x-www-form-urlencoded';
          this.body = new URLSearchParams(this.data).toString();
        } else {
          if (this.headers['content-type']?.includes('application/json')) {
            this.body = JSON.stringify(this.data);
          } else if (this.headers['content-type']?.includes('application/x-www-form-urlencoded')) {
            this.body = new URLSearchParams(this.data).toString();
          } else {
            throw new ScrapeConfigError(
              `Content-Type "${
                this.headers['content-type']
              }" not supported, use body parameter to pass pre encoded body according to your content type`,
            );
          }
        }
      } else if (this.body && !this.data) {
        this.headers['content-type'] = 'text/plain';
      }
    }
  }

  private validateOptions(options: Partial<ScrapeConfigOptions>) {
    const validKeys = new Set(Object.keys(this) as Array<keyof ScrapeConfig>);
    for (const key in options) {
      if (!validKeys.has(key as keyof ScrapeConfig)) {
        throw new ScrapeConfigError(`Invalid option provided: ${key}`);
      }
    }
  }

  toApiParams(options: { key: string }): Record<string, any> {
    const params: Record<string, any> = {
      key: options.key,
    };
    params.url = this.url;
    if (this.country) {
      params.country = this.country;
    }
    if (this.headers !== undefined && Object.keys(this.headers).length > 0) {
      Object.entries(this.headers).forEach(([key, value]) => {
        params[`headers[${key}]`] = value;
      });
    }

    if (this.cookies !== undefined && Object.keys(this.cookies).length > 0) {
      const cookiesAsHeader = [...Object.entries(this.cookies)]
        .map(([key, value]) => `${key}=${value}`)
        .join('; ');

      if (params['headers[cookie]']) {
        // if current cookie value doesn't have a ';' at the end, add it.
        if (params['headers[cookie]'][params['headers[cookie]'].length - 1] !== ';') {
          params['headers[cookie]'] += ';';
        }
        params['headers[cookie]'] += ` ${cookiesAsHeader}`;
      } else {
        params['headers[cookie]'] = cookiesAsHeader;
      }
    }
    if (this.webhook) {
      params.webhook_name = this.webhook;
    }
    if (this.timeout) {
      params.timeout = this.timeout;
    }
    if (this.render_js === true) {
      params.render_js = true;
      if (this.wait_for_selector !== undefined) {
        params.wait_for_selector = this.wait_for_selector;
      }
      if (this.js !== undefined) {
        params.js = urlsafe_b64encode(this.js);
      }
      if (this.js_scenario !== undefined) {
        params.js_scenario = urlsafe_b64encode(JSON.stringify(this.js_scenario));
      }
      if (this.rendering_wait !== undefined) {
        params.rendering_wait = this.rendering_wait;
      }
      if (this.screenshots !== undefined) {
        Object.keys(this.screenshots).forEach((key) => {
          params[`screenshots[${key}]`] = (this.screenshots || {})[key];
        });
        if (this.screenshot_flags) {
          params.screenshot_flags = this.screenshot_flags.join(',');
        }
      } else {
        if (this.screenshot_flags) {
          log.warn('Params "screenshot_flags" is ignored. Works only if screenshots is enabled');
        }
      }
      if (this.auto_scroll !== undefined) {
        params.auto_scroll = this.auto_scroll;
      }
    } else {
      if (this.wait_for_selector !== undefined) {
        log.warn('Params "wait_for_selector" is ignored. Works only if render_js is enabled');
      }
      if (this.screenshots !== undefined) {
        log.warn('Params "screenshots" is ignored. Works only if render_js is enabled');
      }
      if (this.js_scenario !== undefined) {
        log.warn('Params "js_scenario" is ignored. Works only if render_js is enabled');
      }
      if (this.js !== undefined) {
        log.warn('Params "js" is ignored. Works only if render_js is enabled');
      }
      if (this.rendering_wait !== undefined) {
        log.warn('Params "rendering_wait" is ignored. Works only if render_js is enabled');
      }
    }

    if (this.asp === true) {
      params.asp = true;
    }
    if (this.retry === false) {
      params.retry = false;
    }
    if (this.cache === true) {
      params.cache = true;
      if (this.cache_clear) {
        params.cache_clear = true;
      }
      if (this.cache_ttl) {
        params.cache_ttl = this.cache_ttl;
      }
    } else {
      if (this.cache_clear) {
        log.warn('Params "cache_clear" is ignored. Works only if cache is enabled');
      }
      if (this.cache_ttl) {
        log.warn('Params "cache_ttl" is ignored. Works only if cache is enabled');
      }
    }
    if (this.dns === true) {
      params.dns = true;
    }
    if (this.ssl === true) {
      params.ssl = true;
    }
    if (this.tags.size > 0) {
      params.tags = Array.from(this.tags).join(',');
    }
    if (this.format) {
      params.format = this.format.valueOf();
      if (this.format_options) {
        params.format += ':' + this.format_options.join(',');
      }
    }
    if (this.correlation_id) {
      params.correlation_id = this.correlation_id;
    }
    if (this.session) {
      params.session = this.session;
      if (this.session_sticky_proxy) {
        params.session_sticky_proxy = true;
      }
    } else {
      if (this.session_sticky_proxy) {
        log.warn('Params "session_sticky_proxy" is ignored. Works only if session is enabled');
      }
    }
    if (this.debug === true) {
      params.debug = true;
    }
    if (this.proxy_pool) {
      params.proxy_pool = this.proxy_pool;
    }
    if (this.lang !== undefined) {
      params.lang = this.lang.join(',');
    }
    if (this.os !== undefined) {
      params.os = this.os;
    }

    return params;
  }
}
