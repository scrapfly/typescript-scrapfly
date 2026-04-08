import { CrawlerConfigError } from './errors.ts';
import type { Rec } from './types.ts';

/**
 * Content formats supported by the Crawler API.
 *
 * - `html` — original HTML
 * - `clean_html` — sanitized/cleaned HTML
 * - `markdown` — LLM-ready markdown
 * - `text` — plain-text extraction
 * - `json` — parse as JSON (for API responses)
 * - `extracted_data` — structured data from extraction rules
 * - `page_metadata` — title, description, etc.
 */
export type CrawlerContentFormat =
  | 'html'
  | 'clean_html'
  | 'markdown'
  | 'text'
  | 'json'
  | 'extracted_data'
  | 'page_metadata';

const VALID_CONTENT_FORMATS: ReadonlySet<string> = new Set([
  'html',
  'clean_html',
  'markdown',
  'text',
  'json',
  'extracted_data',
  'page_metadata',
]);

/**
 * Webhook event names emitted by the crawler.
 *
 * Source of truth: `apps/scrapfly/scrape-engine/scrape_engine/scrape_engine/crawler/webhook_manager.py`
 * lines 11-20. Verified to match the public docs and the JSON example payloads.
 */
export type CrawlerWebhookEventName =
  | 'crawler_started'
  | 'crawler_url_visited'
  | 'crawler_url_skipped'
  | 'crawler_url_discovered'
  | 'crawler_url_failed'
  | 'crawler_stopped'
  | 'crawler_cancelled'
  | 'crawler_finished';

const VALID_WEBHOOK_EVENTS: ReadonlySet<string> = new Set([
  'crawler_started',
  'crawler_url_visited',
  'crawler_url_skipped',
  'crawler_url_discovered',
  'crawler_url_failed',
  'crawler_stopped',
  'crawler_cancelled',
  'crawler_finished',
]);

/**
 * Constructor options for {@link CrawlerConfig}.
 *
 * Every field except `url` is optional. Fields left unset are NOT sent to the API,
 * which lets the server apply its documented defaults (e.g. `respect_robots_txt=true`).
 */
export type CrawlerConfigOptions = {
  url: string;

  // Crawl limits
  page_limit?: number;
  max_depth?: number;
  max_duration?: number;
  max_api_credit?: number;

  // Path filtering (mutually exclusive)
  exclude_paths?: string[];
  include_only_paths?: string[];

  // Domain / subdomain restrictions
  ignore_base_path_restriction?: boolean;
  follow_external_links?: boolean;
  allowed_external_domains?: string[];
  follow_internal_subdomains?: boolean;
  allowed_internal_subdomains?: string[];

  // Request configuration
  headers?: Rec<string>;
  delay?: number;
  user_agent?: string;
  max_concurrency?: number;
  rendering_delay?: number;

  // Crawl strategy options
  use_sitemaps?: boolean;
  respect_robots_txt?: boolean;
  ignore_no_follow?: boolean;

  // Cache options
  cache?: boolean;
  cache_ttl?: number;
  cache_clear?: boolean;

  // Content extraction
  content_formats?: CrawlerContentFormat[];
  extraction_rules?: Rec<any>;

  // Web scraping features
  asp?: boolean;
  proxy_pool?: string;
  country?: string;

  // Webhook integration
  webhook_name?: string;
  webhook_events?: CrawlerWebhookEventName[];
};

/**
 * Configuration for a Scrapfly Crawler API job.
 *
 * Mirrors the documented `POST /crawl` request body field-for-field. Fields left
 * unset are dropped from the serialized output so the server applies its own defaults.
 *
 * @example
 * ```ts
 * const config = new CrawlerConfig({
 *   url: 'https://web-scraping.dev/products',
 *   page_limit: 10,
 *   content_formats: ['markdown'],
 * });
 * ```
 */
export class CrawlerConfig {
  url: string;

  page_limit?: number;
  max_depth?: number;
  max_duration?: number;
  max_api_credit?: number;

  exclude_paths?: string[];
  include_only_paths?: string[];

  ignore_base_path_restriction?: boolean;
  follow_external_links?: boolean;
  allowed_external_domains?: string[];
  follow_internal_subdomains?: boolean;
  allowed_internal_subdomains?: string[];

  headers?: Rec<string>;
  delay?: number;
  user_agent?: string;
  max_concurrency?: number;
  rendering_delay?: number;

  use_sitemaps?: boolean;
  respect_robots_txt?: boolean;
  ignore_no_follow?: boolean;

  cache?: boolean;
  cache_ttl?: number;
  cache_clear?: boolean;

  content_formats?: CrawlerContentFormat[];
  extraction_rules?: Rec<any>;

  asp?: boolean;
  proxy_pool?: string;
  country?: string;

  webhook_name?: string;
  webhook_events?: CrawlerWebhookEventName[];

  constructor(options: CrawlerConfigOptions) {
    this.validateOptions(options);

    if (typeof options.url !== 'string' || options.url.trim() === '') {
      throw new CrawlerConfigError('url is required and must be a non-empty string');
    }
    this.url = options.url;

    // Mutually exclusive path filters
    if (options.exclude_paths && options.include_only_paths) {
      throw new CrawlerConfigError('exclude_paths and include_only_paths are mutually exclusive');
    }

    // Bounds checks (mirroring the public docs)
    if (options.page_limit !== undefined && options.page_limit < 0) {
      throw new CrawlerConfigError('page_limit must be >= 0 (0 = unlimited)');
    }
    if (options.max_depth !== undefined && options.max_depth < 0) {
      throw new CrawlerConfigError('max_depth must be >= 0');
    }
    if (options.rendering_delay !== undefined && (options.rendering_delay < 0 || options.rendering_delay > 25000)) {
      throw new CrawlerConfigError('rendering_delay must be between 0 and 25000 (ms)');
    }
    if (options.delay !== undefined && (options.delay < 0 || options.delay > 15000)) {
      throw new CrawlerConfigError('delay must be between 0 and 15000 (ms)');
    }
    if (options.cache_ttl !== undefined && (options.cache_ttl < 0 || options.cache_ttl > 604800)) {
      throw new CrawlerConfigError('cache_ttl must be between 0 and 604800 (seconds, max 7 days)');
    }
    if (options.max_duration !== undefined && (options.max_duration < 15 || options.max_duration > 10800)) {
      throw new CrawlerConfigError('max_duration must be between 15 and 10800 (seconds)');
    }
    if (options.max_api_credit !== undefined && options.max_api_credit < 0) {
      throw new CrawlerConfigError('max_api_credit must be >= 0 (0 = no limit)');
    }
    if (options.exclude_paths && options.exclude_paths.length > 100) {
      throw new CrawlerConfigError('exclude_paths is limited to 100 entries');
    }
    if (options.include_only_paths && options.include_only_paths.length > 100) {
      throw new CrawlerConfigError('include_only_paths is limited to 100 entries');
    }
    if (options.allowed_external_domains && options.allowed_external_domains.length > 250) {
      throw new CrawlerConfigError('allowed_external_domains is limited to 250 entries');
    }
    if (options.allowed_internal_subdomains && options.allowed_internal_subdomains.length > 250) {
      throw new CrawlerConfigError('allowed_internal_subdomains is limited to 250 entries');
    }

    // Validate content_formats values
    if (options.content_formats) {
      for (const fmt of options.content_formats) {
        if (!VALID_CONTENT_FORMATS.has(fmt)) {
          throw new CrawlerConfigError(`Invalid content_formats value: ${fmt}`);
        }
      }
    }

    // Validate webhook_events values
    if (options.webhook_events) {
      for (const ev of options.webhook_events) {
        if (!VALID_WEBHOOK_EVENTS.has(ev)) {
          throw new CrawlerConfigError(`Invalid webhook_events value: ${ev}`);
        }
      }
    }

    // Assign all the optional fields by reference
    this.page_limit = options.page_limit;
    this.max_depth = options.max_depth;
    this.max_duration = options.max_duration;
    this.max_api_credit = options.max_api_credit;
    this.exclude_paths = options.exclude_paths;
    this.include_only_paths = options.include_only_paths;
    this.ignore_base_path_restriction = options.ignore_base_path_restriction;
    this.follow_external_links = options.follow_external_links;
    this.allowed_external_domains = options.allowed_external_domains;
    this.follow_internal_subdomains = options.follow_internal_subdomains;
    this.allowed_internal_subdomains = options.allowed_internal_subdomains;
    this.headers = options.headers;
    this.delay = options.delay;
    this.user_agent = options.user_agent;
    this.max_concurrency = options.max_concurrency;
    this.rendering_delay = options.rendering_delay;
    this.use_sitemaps = options.use_sitemaps;
    this.respect_robots_txt = options.respect_robots_txt;
    this.ignore_no_follow = options.ignore_no_follow;
    this.cache = options.cache;
    this.cache_ttl = options.cache_ttl;
    this.cache_clear = options.cache_clear;
    this.content_formats = options.content_formats;
    this.extraction_rules = options.extraction_rules;
    this.asp = options.asp;
    this.proxy_pool = options.proxy_pool;
    this.country = options.country;
    this.webhook_name = options.webhook_name;
    this.webhook_events = options.webhook_events;
  }

  private validateOptions(options: Partial<CrawlerConfigOptions>) {
    const validKeys = new Set<string>([
      'url',
      'page_limit',
      'max_depth',
      'max_duration',
      'max_api_credit',
      'exclude_paths',
      'include_only_paths',
      'ignore_base_path_restriction',
      'follow_external_links',
      'allowed_external_domains',
      'follow_internal_subdomains',
      'allowed_internal_subdomains',
      'headers',
      'delay',
      'user_agent',
      'max_concurrency',
      'rendering_delay',
      'use_sitemaps',
      'respect_robots_txt',
      'ignore_no_follow',
      'cache',
      'cache_ttl',
      'cache_clear',
      'content_formats',
      'extraction_rules',
      'asp',
      'proxy_pool',
      'country',
      'webhook_name',
      'webhook_events',
    ]);
    for (const key in options) {
      if (!validKeys.has(key)) {
        throw new CrawlerConfigError(`Invalid option provided: ${key}`);
      }
    }
  }

  /**
   * Serialize to a flat object suitable for `JSON.stringify()` as a `POST /crawl` body.
   *
   * Unlike `ScrapeConfig.toApiParams()`, the crawler API takes its config as a JSON
   * **body**, not URL query parameters. The API key is therefore NOT included here —
   * it's added to the URL by the client.
   *
   * Fields left undefined are dropped so the server applies its own documented
   * defaults (e.g. `respect_robots_txt=true`).
   */
  toApiParams(): Rec<any> {
    const params: Rec<any> = { url: this.url };
    const fields: Array<keyof CrawlerConfig> = [
      'page_limit',
      'max_depth',
      'max_duration',
      'max_api_credit',
      'exclude_paths',
      'include_only_paths',
      'ignore_base_path_restriction',
      'follow_external_links',
      'allowed_external_domains',
      'follow_internal_subdomains',
      'allowed_internal_subdomains',
      'headers',
      'delay',
      'user_agent',
      'max_concurrency',
      'rendering_delay',
      'use_sitemaps',
      'respect_robots_txt',
      'ignore_no_follow',
      'cache',
      'cache_ttl',
      'cache_clear',
      'content_formats',
      'extraction_rules',
      'asp',
      'proxy_pool',
      'country',
      'webhook_name',
      'webhook_events',
    ];
    for (const key of fields) {
      const v = (this as any)[key];
      if (v !== undefined) {
        params[key] = v;
      }
    }
    return params;
  }
}
