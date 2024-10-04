import { ScreenshotConfigError } from './errors.ts';
import { urlsafe_b64encode } from './utils.ts';
import { log } from './logger.ts';

export enum Options {
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
}

export enum Format {
  /**
    Format of the screenshot image.
    Attributes:
        JPG: JPG format.
        PNG: PNG format.
        WEBP: WEBP format.
        GIF: GIF format.
    */
  JPG = 'jpg',
  PNG = 'png',
  WEBP = 'webp',
  GIF = 'gif',
}

type ScreenshotConfigOptions = {
  url: string;
  format?: 'jpg'| 'png' | 'webp'| 'gif' | Format;
  capture?: string;
  resolution?: string;
  country?: string;
  timeout?: number;
  rendering_wait?: number;
  wait_for_selector?: string;
  options?: ('load_images' | 'dark_mode' | 'block_banners' | 'print_media_format' | Options)[];
  auto_scroll?: boolean;
  js?: string;
  cache?: boolean;
  cache_ttl?: number;
  cache_clear?: boolean;
  webhook?: string;
};

export class ScreenshotConfig {
  url: string;
  format?: 'jpg'| 'png' | 'webp'| 'gif' | Format;
  capture?: string;
  resolution?: string;
  country?: string = undefined;
  timeout?: number;
  rendering_wait?: number;
  wait_for_selector?: string;
  options?: ('load_images' | 'dark_mode' | 'block_banners' | 'print_media_format' | Options)[];
  auto_scroll?: boolean;
  js?: string;
  cache?: boolean;
  cache_ttl?: number;
  cache_clear?: boolean;
  webhook?: string;

  constructor(options: ScreenshotConfigOptions) {
    this.validateOptions(options);
    if (options.format && !Object.values(Format).includes(options.format as Format)) {
      throw new ScreenshotConfigError(`Invalid Format param value: ${options.format}`);
    }
    this.format = options.format ?? this.format;
    if (options.options) {
      options.options.forEach((opt) => {
        if (!Object.values(Options).includes(opt as Options)) {
          throw new ScreenshotConfigError(`Invalid Options param value: ${opt}`);
        }
      });
    }    
    this.url = options.url;
    this.format = options.format ?? this.format;
    this.capture = options.capture ?? this.capture;
    this.resolution = options.resolution ?? this.resolution;
    this.country = options.country ?? this.country;
    this.timeout = options.timeout ?? this.timeout;
    this.rendering_wait = options.rendering_wait ?? this.rendering_wait;
    this.wait_for_selector = options.wait_for_selector ?? this.wait_for_selector;
    this.options = options.options ?? this.options;
    this.auto_scroll = options.auto_scroll ?? this.auto_scroll;
    this.js = options.js ?? this.js;
    this.cache = options.cache ?? this.cache;
    this.cache_ttl = options.cache_ttl ?? this.cache_ttl;
    this.cache_clear = options.cache_clear ?? this.cache_clear;
    this.webhook = options.webhook;
  }

  private validateOptions(options: Partial<ScreenshotConfigOptions>) {
    const validKeys = new Set(Object.keys(this) as Array<keyof ScreenshotConfig>);
    for (const key in options) {
      if (!validKeys.has(key as keyof ScreenshotConfig)) {
        throw new ScreenshotConfigError(`Invalid option provided: ${key}`);
      }
    }
  }

  toApiParams(options: { key: string }): Record<string, any> {
    const params: Record<string, any> = {
      key: options.key,
    };
    params.url = this.url;

    if (this.format) {
      params.format = this.format.valueOf();
    }

    if (this.capture) {
      params.capture = this.capture;
    }

    if (this.resolution) {
      params.resolution = this.resolution;
    }

    if (this.country) {
      params.country = this.country;
    }

    if (this.timeout) {
      params.timeout = this.timeout;
    }

    if (this.rendering_wait) {
      params.rendering_wait = this.rendering_wait;
    }

    if (this.wait_for_selector) {
      params.wait_for_selector = this.wait_for_selector;
    }

    if (this.options) {
      params.options = this.options.join(',');
    }

    if (this.auto_scroll === true) {
      params.auto_scroll = this.auto_scroll;
    }

    if (this.js) {
      params.js = urlsafe_b64encode(this.js);
    }

    if (this.cache === true) {
      params.cache = this.cache;
      if (this.cache_ttl) {
        params.cache_ttl = this.cache_ttl;
      }
      if (this.cache_clear === true) {
        params.cache_clear = this.cache_clear;
      }
    } else {
      if (this.cache_ttl) {
        log.warn('Params "cache_ttl" is ignored. Works only if cache is enabled');
      }
      if (this.cache_clear) {
        log.warn('Params "cache_clear" is ignored. Works only if cache is enabled');
      }
    }

    if (this.webhook) {
      params.webhook_name = this.webhook;
    }

    return params;
  }
}
