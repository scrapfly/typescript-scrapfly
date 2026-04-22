import { ScreenshotConfigError } from './errors.ts';
import { urlsafe_b64encode } from './utils.ts';
import { log } from './logger.ts';

/** Toggles that customize how the screenshot is captured. */
export enum Options {
  /** Render images before capturing. Consumes additional bandwidth. */
  LOAD_IMAGES = 'load_images',
  /** Render the page in dark mode. */
  DARK_MODE = 'dark_mode',
  /** Block cookie banners and overlays that would otherwise occlude the page. */
  BLOCK_BANNERS = 'block_banners',
  /** Render the page using the `print` media query. */
  PRINT_MEDIA_FORMAT = 'print_media_format',
}

/** Output format of the screenshot image. */
export enum Format {
  /** JPEG encoding. */
  JPG = 'jpg',
  /** PNG encoding. */
  PNG = 'png',
  /** WebP encoding. */
  WEBP = 'webp',
  /** Animated GIF encoding. */
  GIF = 'gif',
}

/**
 * Visual impairments to simulate when capturing the screenshot.
 * Useful for WCAG accessibility testing.
 */
export enum VisionDeficiency {
  /** Difficulty distinguishing green from red; green appears beige/gray. */
  DEUTERANOPIA = 'deuteranopia',
  /** Reduced sensitivity to red light; red appears dark/black. */
  PROTANOPIA = 'protanopia',
  /** Difficulty distinguishing blue from yellow and violet from red. */
  TRITANOPIA = 'tritanopia',
  /** Complete color blindness; the image is grayscale. */
  ACHROMATOPSIA = 'achromatopsia',
  /** Reduced contrast (aging, low light). */
  REDUCED_CONTRAST = 'reducedContrast',
  /** Blurred vision (uncorrected refractive errors). */
  BLURRED_VISION = 'blurredVision',
}

/**
 * User-facing options accepted by {@link ScreenshotConfig}. See the
 * [Screenshot API reference](https://scrapfly.io/docs/screenshot-api)
 * for the authoritative list of valid values.
 */
type ScreenshotConfigOptions = {
  /** URL of the page to screenshot. Required. */
  url: string;
  /** Output image format. Defaults to JPG. */
  format?: 'jpg' | 'png' | 'webp' | 'gif' | Format;
  /** Capture area: `fullpage`, `viewport`, or a CSS selector. */
  capture?: string;
  /** Viewport resolution, formatted as "widthxheight". */
  resolution?: string;
  /** ISO country code for geo-targeting the rendering browser. */
  country?: string;
  /** Request timeout in milliseconds. */
  timeout?: number;
  /** Additional delay (ms) after load before capturing. */
  rendering_wait?: number;
  /** CSS selector to wait for before capturing. */
  wait_for_selector?: string;
  /** Behavior toggles. See {@link Options}. */
  options?: ('load_images' | 'dark_mode' | 'block_banners' | 'print_media_format' | Options)[];
  /** Scroll to the bottom of the page before capture. */
  auto_scroll?: boolean;
  /** Custom JavaScript to run on the page before capture. */
  js?: string;
  /** Serve from Scrapfly's cache when possible. */
  cache?: boolean;
  /** TTL in seconds for the cached entry. Ignored if cache is disabled. */
  cache_ttl?: number;
  /** Invalidate the existing cache entry before capturing. */
  cache_clear?: boolean;
  /** Vision deficiency to simulate. See {@link VisionDeficiency}. */
  vision_deficiency?: 'deuteranopia' | 'protanopia' | 'tritanopia' | 'achromatopsia' | 'blurredVision' | 'reducedContrast' | VisionDeficiency;
  /** Webhook name to notify when the screenshot completes. */
  webhook?: string;
};

/**
 * Configuration for a single screenshot request. Instances are passed
 * to {@link ScrapflyClient.screenshot}; this class is responsible for
 * validating options and encoding them into Scrapfly's query string
 * format.
 */
export class ScreenshotConfig {
  /** URL of the page to screenshot. */
  url: string;
  /** Output image format. */
  format?: 'jpg' | 'png' | 'webp' | 'gif' | Format;
  /** Capture area (`fullpage`, `viewport`, or a CSS selector). */
  capture?: string;
  /** Viewport resolution (`widthxheight`). */
  resolution?: string;
  /** Geo-targeting country (ISO code). */
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
  vision_deficiency?: 'deuteranopia' | 'protanopia' | 'tritanopia' | 'achromatopsia' | 'blurredVision' | 'reducedContrast' | VisionDeficiency;
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
    this.vision_deficiency = options.vision_deficiency ?? this.vision_deficiency;
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

  /**
   * Encode this config as the query-string parameters sent to the
   * Screenshot API.
   *
   * @param options.key Scrapfly API key.
   * @returns A record suitable for `URLSearchParams` construction.
   */
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

    if (this.vision_deficiency) {
      params.vision_deficiency = this.vision_deficiency;
    }

    if (this.webhook) {
      params.webhook_name = this.webhook;
    }

    return params;
  }
}
