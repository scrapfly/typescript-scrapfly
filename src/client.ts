import { path } from './deps.ts';
import { mkdir, writeFile, readFileSync } from './polyfill.ts';
import { fetchRetry } from './utils.ts';
import * as errors from './errors.ts';
import type { ScrapeConfig } from './scrapeconfig.ts';
import type { ScreenshotConfig } from './screenshotconfig.ts';
import type { ExtractionConfig } from './extractionconfig.ts';
import { BrowserConfig } from './browserconfig.ts';
import { type AccountData, type ClassifyOptions, type ClassifyResult, ExtractionResult, ScrapeResult, ScreenshotResult } from './result.ts';
import { log } from './logger.ts';
import type { Rec } from './types.ts';
import type { CrawlerConfig, CrawlerContentFormat } from './crawlerconfig.ts';
import { CrawlerArtifact, type CrawlerArtifactType, CrawlerContents, CrawlerStatus, CrawlerUrls } from './crawlerresult.ts';
import {
  formatMonitoringDate,
  type CloudBrowserMonitoringOptions,
  type MonitoringMetricsOptions,
  type MonitoringTargetMetricsOptions,
} from './monitoringconfig.ts';

/**
 * Main entry point for the Scrapfly SDK.
 *
 * A single `ScrapflyClient` can be used to call every Scrapfly API
 * (scrape, screenshot, extraction, crawler, monitoring, cloud browser).
 * It is safe to share one instance across concurrent calls.
 */
export class ScrapflyClient {
  /** Base URL of the Scrapfly REST API. */
  public HOST = 'https://api.scrapfly.io';
  /** Default Cloud Browser WebSocket host. */
  public CLOUD_BROWSER_HOST = 'wss://browser.scrapfly.io';
  /** Default Cloud Browser REST host (derived from the WS host). */
  public CLOUD_BROWSER_API_HOST = 'https://browser.scrapfly.io';
  private key: string;
  private ua: string;
  private cloudBrowserHost: string;
  private cloudBrowserApiHost: string;
  /** `fetch` implementation used by the client. Override for custom retries/tracing. */
  fetch: typeof fetchRetry = fetchRetry;

  /**
   * Create a Scrapfly client.
   *
   * @param options.key Scrapfly API key.
   * @param options.host Optional override for the REST API host.
   * @param options.cloudBrowserHost Optional override for the Cloud Browser WS host.
   * @throws {@link errors.BadApiKeyError} if `options.key` is not a non-empty string.
   */
  constructor(options: { key: string; host?: string; cloudBrowserHost?: string }) {
    if (typeof options.key !== 'string' || options.key.trim() === '') {
      throw new errors.BadApiKeyError('Invalid key. Key must be a non-empty string');
    }
    this.key = options.key;
    if (options.host) {
      // Trim trailing slash so callers can pass either form
      this.HOST = options.host.replace(/\/+$/, '');
    }
    this.ua = 'Typescript Scrapfly SDK';
    this.cloudBrowserHost = options.cloudBrowserHost || this.CLOUD_BROWSER_HOST;
    this.cloudBrowserApiHost = options.cloudBrowserHost
      ? options.cloudBrowserHost.replace('wss://', 'https://')
      : this.CLOUD_BROWSER_API_HOST;
  }

  /**
   * Raise appropriate error for given response and scrape result
   */
  errResult(response: Response, result: ScrapeResult): errors.ScrapflyError {
    const error = result.result.error;
    const message = error?.message ?? '';
    // When success=false the authoritative error code lives in result.result.error.code
    // (e.g. "ERR::SCRAPE::BAD_UPSTREAM_RESPONSE"). result.result.status is only "DONE"
    // or a job-level error and does not carry the upstream-failure code.
    const effectiveCode = (result.result.success === false && error?.code)
      ? error.code
      : result.result.status;
    const args = {
      code: effectiveCode,
      http_status_code: result.result.status_code,
      is_retryable: error?.retryable ?? false,
      api_response: result,
      resource: effectiveCode ? effectiveCode.split('::')[1] : null,
      retry_delay: error?.retryable ? 5 : response.headers.get('X-Retry') ?? 5,
      retry_times: 3,
      documentation_url: error?.doc_url ?? 'https://scrapfly.io/docs/scrape-api/errors#api',
    };
    if (result.result.success === true) {
      switch (args.http_status_code) {
        case 500:
          return new errors.ApiHttpServerError(message, args);
        case 401:
          return new errors.BadApiKeyError(message, args);
        case 429:
          return new errors.TooManyRequests(message, args);
      }
      switch (args.resource) {
        case 'SCRAPE':
          return new errors.ScrapflyScrapeError(message, args);
        case 'WEBHOOK':
          return new errors.ScrapflyWebhookError(message, args);
        case 'PROXY':
          return new errors.ScrapflyProxyError(message, args);
        case 'SCHEDULE':
          return new errors.ScrapflyScheduleError(message, args);
        case 'ASP':
          return new errors.ScrapflyAspError(message, args);
        case 'SESSION':
          return new errors.ScrapflySessionError(message, args);
        case 'CRAWLER':
          return new errors.ScrapflyCrawlerError(message, args);
      }
      if (args.resource) {
        return new errors.ApiHttpClientError(message, args);
      }
    } else {
      if (args.code === 'ERR::SCRAPE::BAD_UPSTREAM_RESPONSE') {
        if (args.http_status_code >= 400 && args.http_status_code < 500) {
          return new errors.UpstreamHttpClientError(message, args);
        }
        if (args.http_status_code >= 500 && args.http_status_code < 600) {
          return new errors.UpstreamHttpServerError(message, args);
        }
      }
      switch (args.resource) {
        case 'SCRAPE':
          return new errors.ScrapflyScrapeError(message, args);
        case 'WEBHOOK':
          return new errors.ScrapflyWebhookError(message, args);
        case 'PROXY':
          return new errors.ScrapflyProxyError(message, args);
        case 'SCHEDULE':
          return new errors.ScrapflyScheduleError(message, args);
        case 'ASP':
          return new errors.ScrapflyAspError(message, args);
        case 'SESSION':
          return new errors.ScrapflySessionError(message, args);
        case 'CRAWLER':
          return new errors.ScrapflyCrawlerError(message, args);
      }
    }
    return new errors.ScrapflyError(message, args);
  }

  /**
   * Handle clob and blob large objects
   */
  async handleLargeObjects(result: any, format: 'clob' | 'blob'): Promise<ScrapeResult> {
    let response: Response;

    try {
      const url = new URL(result.content);
      const params = { key: this.key };
      url.search = new URLSearchParams(params).toString();
      response = await this.fetch({
        url: url.toString(),
        method: 'GET',
        headers: {
          'user-agent': this.ua,
          'accept-encoding': 'gzip, deflate, br',
          accept: 'application/json',
        },
      });
    } catch (e) {
      log.error('error', e);
      throw e;
    }

    let content;

    if (format === 'clob') {
      content = await response.text();
      result.format = 'text';
    }

    if (format === 'blob') {
      content = new Uint8Array(await response.arrayBuffer());
      result.format = 'binary';
    }

    result.content = content;
    return result;
  }

  /**
   * Turn scrapfly API response to ScrapeResult or raise one of ScrapflyError
   */
  handleResponse(response: Response, result: ScrapeResult): ScrapeResult {
    // success
    log.debug('scrape log url: ', result.result.log_url);
    if (result.result.status === 'DONE' && result.result.success === true) {
      return result;
    }
    // something went wrong
    throw this.errResult(response, result);
  }

  /**
   * Retrieve Scrapfly account details
   */
  async account(): Promise<AccountData> {
    log.debug('retrieving account info');
    let response: Response;
    try {
      const url = new URL(this.HOST + '/account');
      const params = { key: this.key };
      url.search = new URLSearchParams(params).toString();
      response = await this.fetch({
        url: url.toString(),
        method: 'GET',
        headers: {
          'user-agent': this.ua,
          'accept-encoding': 'gzip, deflate, br',
          accept: 'application/json',
        },
      });
    } catch (e) {
      log.error('error', e);
      throw e;
    }
    const data: Rec<any> = await response.json() as Rec<any>;
    if ('error_id' in data || Object.keys(data).length === 0) {
      if (data.http_code == 401 || response.status == 401) {
        throw new errors.BadApiKeyError(JSON.stringify(data));
      }
      throw new errors.ApiHttpClientError(JSON.stringify(data));
    }
    return data as AccountData;
  }

  /**
   * Classify an already-fetched HTTP response for anti-bot blocking.
   *
   * Runs the same anti-bot detection pipeline used by live Scrapfly
   * scrapes against a response you already have (from your own proxy,
   * cache, etc). 1 API credit per call. See
   * https://scrapfly.io/docs/scrape-api/classify for the full contract.
   */
  async classify(options: ClassifyOptions): Promise<ClassifyResult> {
    if (!options || !options.url) {
      throw new errors.ScrapflyError('classify: url is required');
    }
    if (
      typeof options.statusCode !== 'number' ||
      options.statusCode < 100 ||
      options.statusCode > 599
    ) {
      throw new errors.ScrapflyError(
        'classify: status_code must be a valid HTTP status in [100, 599]',
      );
    }

    const body: Rec<unknown> = {
      url: options.url,
      status_code: options.statusCode,
      method: options.method ?? 'GET',
    };
    if (options.headers && Object.keys(options.headers).length > 0) {
      const hdrs: Rec<string> = {};
      for (const [k, v] of Object.entries(options.headers)) {
        hdrs[String(k)] = String(v);
      }
      body.headers = hdrs;
    }
    if (options.body !== undefined && options.body !== null) {
      body.body = options.body;
    }

    const url = new URL(this.HOST + '/classify');
    url.search = new URLSearchParams({ key: this.key }).toString();

    const response = await this.fetch({
      url: url.toString(),
      method: 'POST',
      headers: {
        'user-agent': this.ua,
        'accept-encoding': 'gzip, deflate, br',
        accept: 'application/json',
        'content-type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    const data = (await response.json()) as Rec<unknown>;
    if (response.status >= 400 || 'error_id' in data) {
      if (response.status == 401) {
        throw new errors.BadApiKeyError(JSON.stringify(data));
      }
      throw new errors.ApiHttpClientError(JSON.stringify(data));
    }

    return {
      blocked: Boolean(data.blocked),
      antibot: (data.antibot ?? null) as string | null,
      cost: Number(data.cost ?? 0),
    };
  }

  // ── Monitoring API (Enterprise+ plan only) ──────────────────────
  // The Monitoring API exposes per-product aggregates and per-target
  // timeseries. Web Scraping / Screenshot / Extraction / Crawler share
  // one shape (request-based) but live under different URL prefixes;
  // Cloud Browser is session-based and exposes a distinct shape.
  // See https://scrapfly.io/docs/monitoring#api

  /** Dispatch an HTTP GET against a Monitoring API path with the given query params, parsing errors. */
  private async monitoringRequest(path: string, params: Rec<string>): Promise<Rec<any>> {
    const url = new URL(this.HOST + path);
    url.search = new URLSearchParams(params).toString();
    const response = await this.fetch({
      url: url.toString(),
      method: 'GET',
      headers: {
        'user-agent': this.ua,
        'accept-encoding': 'gzip, deflate, br',
        accept: 'application/json',
      },
    });
    const data: Rec<any> = (await response.json()) as Rec<any>;
    if ('error_id' in data) {
      if (data.http_code == 401 || response.status == 401) {
        throw new errors.BadApiKeyError(JSON.stringify(data));
      }
      throw new errors.ApiHttpClientError(JSON.stringify(data));
    }
    return data;
  }

  /** Build the query string for a request-based Monitoring API metrics endpoint. */
  private buildMetricsParams(options: MonitoringMetricsOptions): Rec<string> {
    const params: Rec<string> = {
      key: this.key,
      format: options.format ?? 'structured',
    };
    if (options.period !== undefined) params.period = options.period;
    if (options.aggregation !== undefined && options.aggregation.length > 0) {
      params.aggregation = options.aggregation.join(',');
    }
    if (options.includeWebhook) params.include_webhook = 'true';
    return params;
  }

  /** Build the query string for a per-target Monitoring API endpoint. */
  private buildTargetParams(options: MonitoringTargetMetricsOptions): Rec<string> {
    if ((options.start && !options.end) || (!options.start && options.end)) {
      throw new Error('You must provide both start and end date');
    }
    const params: Rec<string> = {
      key: this.key,
      domain: options.domain,
      group_subdomain: String(options.groupSubdomain ?? false),
    };
    if (options.start && options.end) {
      params.start = formatMonitoringDate(options.start);
      params.end = formatMonitoringDate(options.end);
    } else if (options.period !== undefined) {
      params.period = options.period;
    } else {
      params.period = 'last24h';
    }
    if (options.includeWebhook) params.include_webhook = 'true';
    return params;
  }

  /** Fetch Web Scraping API monitoring metrics (aggregate). */
  async getMonitoringMetrics(options: MonitoringMetricsOptions = {}): Promise<Rec<any>> {
    return this.monitoringRequest('/scrape/monitoring/metrics', this.buildMetricsParams(options));
  }

  /** Fetch Web Scraping API monitoring metrics for a single target domain. */
  async getMonitoringTargetMetrics(options: MonitoringTargetMetricsOptions): Promise<Rec<any>> {
    return this.monitoringRequest('/scrape/monitoring/metrics/target', this.buildTargetParams(options));
  }

  /** Fetch Screenshot API monitoring metrics (aggregate). */
  async getScreenshotMonitoringMetrics(options: MonitoringMetricsOptions = {}): Promise<Rec<any>> {
    return this.monitoringRequest('/screenshot/monitoring/metrics', this.buildMetricsParams(options));
  }

  /** Fetch Screenshot API monitoring metrics for a single target domain. */
  async getScreenshotMonitoringTargetMetrics(options: MonitoringTargetMetricsOptions): Promise<Rec<any>> {
    return this.monitoringRequest('/screenshot/monitoring/metrics/target', this.buildTargetParams(options));
  }

  /** Fetch Extraction API monitoring metrics (aggregate). */
  async getExtractionMonitoringMetrics(options: MonitoringMetricsOptions = {}): Promise<Rec<any>> {
    return this.monitoringRequest('/extraction/monitoring/metrics', this.buildMetricsParams(options));
  }

  /** Fetch Extraction API monitoring metrics for a single target domain. */
  async getExtractionMonitoringTargetMetrics(options: MonitoringTargetMetricsOptions): Promise<Rec<any>> {
    return this.monitoringRequest('/extraction/monitoring/metrics/target', this.buildTargetParams(options));
  }

  /** Fetch Crawler API monitoring metrics (aggregate). */
  async getCrawlerMonitoringMetrics(options: MonitoringMetricsOptions = {}): Promise<Rec<any>> {
    return this.monitoringRequest('/crawl/monitoring/metrics', this.buildMetricsParams(options));
  }

  /** Fetch Crawler API monitoring metrics for a single target domain. */
  async getCrawlerMonitoringTargetMetrics(options: MonitoringTargetMetricsOptions): Promise<Rec<any>> {
    return this.monitoringRequest('/crawl/monitoring/metrics/target', this.buildTargetParams(options));
  }

  /** Fetch Cloud Browser monitoring metrics (session-based aggregate). */
  async getBrowserMonitoringMetrics(
    options: CloudBrowserMonitoringOptions = {},
  ): Promise<Rec<any>> {
    return this.monitoringRequest('/browser/monitoring/metrics', this.buildBrowserParams(options));
  }

  /** Fetch Cloud Browser monitoring timeseries (per-minute session usage). */
  async getBrowserMonitoringTimeseries(
    options: CloudBrowserMonitoringOptions = {},
  ): Promise<Rec<any>> {
    return this.monitoringRequest('/browser/monitoring/metrics/timeseries', this.buildBrowserParams(options));
  }

  /** Build the query string for the session-based Cloud Browser Monitoring endpoints. */
  private buildBrowserParams(options: CloudBrowserMonitoringOptions): Rec<string> {
    if ((options.start && !options.end) || (!options.start && options.end)) {
      throw new Error('You must provide both start and end date');
    }
    const params: Rec<string> = { key: this.key };
    if (options.start && options.end) {
      params.start = formatMonitoringDate(options.start);
      params.end = formatMonitoringDate(options.end);
    } else if (options.period !== undefined) {
      params.period = options.period;
    }
    if (options.proxyPool !== undefined) params.proxy_pool = options.proxyPool;
    return params;
  }

  /**
   * Issue a single scrape command from a given scrape configuration
   */
  async scrape(config: ScrapeConfig): Promise<ScrapeResult | Response> {
    log.debug('scraping', { method: config.method, url: config.url });
    let response;
    try {
      const url = new URL(this.HOST + '/scrape');
      const params = config.toApiParams({ key: this.key });
      url.search = new URLSearchParams(params).toString();
      response = await this.fetch({
        url: url.toString(),
        method: config.method,
        headers: {
          'user-agent': this.ua,
          'content-type': config.method === 'POST'
            ? config.headers?.['content-type'] ?? 'application/json'
            : 'application/json',
          'accept-encoding': 'gzip, deflate, br',
          accept: 'application/json',
        },
        body: config.body,
      });
    } catch (e) {
      log.error('error', e);
      // Attach the scrape config to the thrown error for debuggability.
      // The error is typed as `unknown` since TypeScript 4.4 strict catch
      // clause variables, so we narrow to a mutable object before tagging.
      if (e !== null && typeof e === 'object') {
        (e as Record<string, unknown>).scrapeConfig = config;
      }
      throw e;
    }
    // Proxified mode: the API returns the raw upstream response (target's
    // status, headers, body) instead of the JSON envelope. Return the raw
    // fetch Response so callers can drive it like any HTTP response.
    //
    // DO NOT throw on non-2xx: the response status is the UPSTREAM target's
    // status, not a Scrapfly system error. A 503 from the target is a
    // legitimate proxified response, not an API failure.
    //
    // Callers inspect:
    //   response.status — the upstream status
    //   response.headers.get("x-scrapfly-reject-code") — Scrapfly error (if any)
    //   response.headers.get("x-scrapfly-api-cost") — credits charged
    if (config.proxified_response === true) {
      // Error restoration: if X-Scrapfly-Reject-Code is present, the
      // scrape failed. Reconstruct a typed error from the headers so
      // callers get the same error interface as non-proxified mode.
      const rejectCode = response.headers.get('x-scrapfly-reject-code');
      if (rejectCode) {
        const rejectDesc = response.headers.get('x-scrapfly-reject-description') ?? '';
        const rejectRetryable = response.headers.get('x-scrapfly-reject-retryable') === 'true';
        const retryAfter = rejectRetryable ? parseInt(response.headers.get('retry-after') ?? '0', 10) : 0;
        const err = new errors.ApiHttpClientError(
          `Proxified scrape error: ${rejectCode} — ${rejectDesc}`
        );
        (err as any).code = rejectCode;
        (err as any).httpStatusCode = response.status;
        (err as any).retryable = rejectRetryable;
        (err as any).retryAfter = retryAfter;
        (err as any).response = response;
        throw err;
      }
      return response;
    }
    // HEAD responses have no body per HTTP spec — the API returns headers
    // only. Build a ScrapeResult from the HTTP response headers and the
    // local config, mirroring the Python SDK's HEAD handler.
    if (config.method === 'HEAD') {
      const responseHeaders: Record<string, string> = {};
      response.headers.forEach((v, k) => { responseHeaders[k] = v; });
      return this.handleResponse(
        response,
        new ScrapeResult({
          config: config.toApiParams({ key: this.key }) as any,
          context: {} as any,
          result: {
            status_code: response.status,
            content: '',
            format: 'text',
            success: response.status >= 200 && response.status < 300,
            status: 'DONE',
            response_headers: responseHeaders,
            request_headers: {},
          } as any,
          uuid: '',
        }),
      );
    }
    const data: Rec<any> = await response.json() as Rec<any>;
    if ('error_id' in data || Object.keys(data).length === 0) {
      if (data.http_code == 401 || response.status == 401) {
        throw new errors.BadApiKeyError(JSON.stringify(data));
      }
      throw new errors.ApiHttpClientError(JSON.stringify(data));
    }

    const content_format = data.result.format;
    if (content_format === 'clob' || content_format === 'blob') {
      data.result = await this.handleLargeObjects(data.result, content_format);
    }

    const result = this.handleResponse(
      response,
      new ScrapeResult({
        config: data.config,
        context: data.context,
        result: data.result,
        uuid: data.uuid,
      }),
    );
    return result;
  }

  /**
  Concurrently scrape multiple configs
  This is a async generator call it like this:

    const results = [];
    const errors = [];
    for await (const resultOrError of client.concurrentScrape(configs)) {
        if (resultOrError instanceof Error) {
            errors.push(resultOrError);
        } else {
            results.push(resultOrError);
        }
    }

  @param concurrencyLimit: if not set it will be taken from your account info
  */
  async *concurrentScrape(
    configs: ScrapeConfig[],
    concurrencyLimit?: number,
  ): AsyncGenerator<ScrapeResult | Error | undefined, void, undefined> {
    if (concurrencyLimit === undefined) {
      const account = await this.account();
      concurrencyLimit = account.subscription.usage.scrape.concurrent_limit;
      log.info(`concurrency not provided - setting it to ${concurrencyLimit} from account info`);
    }
    const activePromises = new Set<Promise<ScrapeResult | Error>>();
    const configsIterator = configs[Symbol.iterator]();

    // Helper function to start a new scrape and add it to activePromises
    const startNewScrape = () => {
      const { value: config, done } = configsIterator.next();
      if (done) return; // No more configs

      const promise = this.scrape(config).catch((error) => error); // Catch errors and return them
      activePromises.add(promise);

      promise.finally(() => {
        activePromises.delete(promise);
        // After each scrape, start a new one if there are remaining configs
        startNewScrape();
      });
    };

    // Initially start as many scrapes as the concurrency limit
    for (let i = 0; i < concurrencyLimit; i++) {
      startNewScrape();
    }

    // As each scrape finishes, yield the result or error and start a new one if there are remaining configs
    while (activePromises.size > 0) {
      log.debug(`concurrently scraping ${activePromises.size}/${configs.length}}`);
      const resultOrError = await Promise.race(activePromises);
      yield resultOrError;
    }
  }

  /**
   * Issue a single batch request against POST /scrape/batch and
   * stream results back as each scrape completes.
   *
   * Yields `[correlation_id, resultOrError]` tuples. Results arrive
   * OUT OF ORDER — whichever scrape finishes first is yielded first.
   * Every ScrapeConfig MUST carry a unique `correlation_id`; missing
   * or duplicate values are caught client-side before the batch is
   * sent (so callers fail fast on misconfiguration).
   *
   * Usage:
   *   for await (const [id, result] of client.scrapeBatch(configs)) {
   *     if (result instanceof errors.ScrapflyError) { ... }
   *     else { ... }
   *   }
   */
  async *scrapeBatch(
    configs: ScrapeConfig[],
    options: { format?: 'json' | 'msgpack' } = {},
  ): AsyncGenerator<[string, ScrapeResult | Response | errors.ScrapflyError], void, undefined> {
    const wireFormat = options.format ?? 'json';
    const acceptHeader =
      wireFormat === 'msgpack' ? 'application/msgpack' : 'application/json';
    // Lazy-load the parser to avoid pulling Web Streams polyfills
    // into the module graph for users who never call scrapeBatch.
    const { iterBatchParts, decodePartBody, buildProxifiedResponseFromPart } = await import('./batch.ts');

    if (!configs || configs.length === 0) {
      throw new errors.ScrapflyError('scrapeBatch: configs list is empty');
    }
    if (configs.length > 100) {
      throw new errors.ScrapflyError(
        `scrapeBatch: max 100 configs per batch (got ${configs.length})`,
      );
    }

    const seen = new Map<string, number>();
    const configByCorrelation = new Map<string, ScrapeConfig>();
    const bodyConfigs: Record<string, unknown>[] = [];

    for (let i = 0; i < configs.length; i++) {
      const cfg = configs[i];
      const correlationId = (cfg as unknown as Record<string, string>).correlation_id;
      if (!correlationId) {
        throw new errors.ScrapflyError(
          `scrapeBatch: configs[${i}] is missing correlation_id (required for matching streamed parts)`,
        );
      }
      if (seen.has(correlationId)) {
        throw new errors.ScrapflyError(
          `scrapeBatch: correlation_id ${JSON.stringify(correlationId)} reused by configs[${seen.get(correlationId)}] and configs[${i}]`,
        );
      }
      seen.set(correlationId, i);
      configByCorrelation.set(correlationId, cfg);

      // Reuse toApiParams to guarantee wire parity with /scrape.
      // Drop `key` (batch key is in the URL).
      const params = cfg.toApiParams({ key: this.key }) as Record<string, unknown>;
      delete params.key;
      bodyConfigs.push(params);
    }

    const url = new URL(this.HOST + '/scrape/batch');
    url.search = new URLSearchParams({ key: this.key }).toString();

    const response = await this.fetch({
      url: url.toString(),
      method: 'POST',
      headers: {
        'user-agent': this.ua,
        'content-type': 'application/json',
        // gzip is universally supported in fetch runtimes; skip zstd
        // for streaming compatibility (Node < 22 / browsers don't
        // auto-decompress zstd yet).
        'accept-encoding': 'gzip',
        accept: acceptHeader,
      },
      body: JSON.stringify({ configs: bodyConfigs }),
    });

    if (response.status !== 200) {
      const body = await response.text();
      let parsed: Record<string, unknown>;
      try {
        parsed = JSON.parse(body);
      } catch {
        parsed = { message: body, code: 'ERR::API::INTERNAL_ERROR' };
      }
      throw new errors.ApiHttpServerError(
        `scrapeBatch: ${parsed.code ?? 'error'} (HTTP ${response.status}): ${parsed.message ?? body}`,
      );
    }

    for await (const part of iterBatchParts(response)) {
      const correlationId = part.headers['x-scrapfly-correlation-id'] ?? '';

      // Proxified-response parts: the part body is the raw upstream
      // bytes, not a JSON envelope. Surface a native fetch Response
      // so callers get the same shape as a single proxified scrape
      // (which returns Response from .scrape()).
      if (part.headers['x-scrapfly-proxified'] === 'true') {
        try {
          const proxResponse = buildProxifiedResponseFromPart(part);
          yield [correlationId, proxResponse];
        } catch (proxErr) {
          yield [
            correlationId,
            new errors.ScrapflyError(
              `scrapeBatch: failed to build proxified response for correlation_id=${JSON.stringify(correlationId)}: ${proxErr}`,
            ),
          ];
        }
        continue;
      }

      let parsed: Record<string, unknown>;
      try {
        parsed = decodePartBody(part);
      } catch (decodeErr) {
        yield [
          correlationId,
          new errors.ScrapflyError(
            `scrapeBatch: failed to decode part for correlation_id=${JSON.stringify(correlationId)}: ${decodeErr}`,
          ),
        ];
        continue;
      }

      try {
        const result = new ScrapeResult({
          config: (parsed as any).config,
          context: (parsed as any).context,
          result: (parsed as any).result,
          uuid: (parsed as any).uuid,
        });
        yield [correlationId, result];
      } catch (resultErr) {
        yield [
          correlationId,
          resultErr instanceof errors.ScrapflyError
            ? resultErr
            : new errors.ScrapflyError(`scrapeBatch: ${resultErr}`),
        ];
      }
    }
  }

  /**
   * Save screenshot response to a file
   */
  async saveScreenshot(result: ScreenshotResult, name: string, savePath?: string): Promise<any> {
    if (!result.image) {
      throw new Error('Screenshot binary does not exist');
    }

    const extension_name = result.metadata.extension_name;
    let file_path;

    if (savePath) {
      await mkdir(savePath, { recursive: true });
      file_path = path.join(savePath, `${name}.${extension_name}`);
    } else {
      file_path = `${name}.${extension_name}`;
    }

    const content = new Uint8Array(result.image);

    // Use Deno's write file method
    await writeFile(file_path, content);
  }

  /**
   * Turn scrapfly screenshot API response to ScreenshotResult or raise one of ScrapflyError
   */
  async handleScreenshotResponse(response: Response): Promise<ScreenshotResult> {
    // A Response body can only be consumed once. If the server returned
    // JSON, parse it up front and reuse it on the error path — re-reading
    // would yield "body stream already read" and mask the real error.
    const isJson = response.headers.get('content-type') === 'application/json';
    let jsonData: Rec<any> | null = null;
    if (isJson) {
      jsonData = (await response.json()) as Rec<any>;
      if (jsonData.http_code == 401 || response.status == 401) {
        throw new errors.BadApiKeyError(JSON.stringify(jsonData));
      }
      if ('error_id' in jsonData) {
        throw new errors.ScreenshotApiError(JSON.stringify(jsonData));
      }
    }
    if (!response.ok) {
      const body = jsonData ?? (await response.text());
      throw new errors.ScreenshotApiError(
        typeof body === 'string' ? body : JSON.stringify(body),
      );
    }
    const data = await response.arrayBuffer();
    const result = new ScreenshotResult(response, data);
    return result;
  }

  /**
   * Take a screenshot
   */
  async screenshot(config: ScreenshotConfig): Promise<ScreenshotResult> {
    let response;
    try {
      const url = new URL(this.HOST + '/screenshot');
      const params = config.toApiParams({ key: this.key });
      url.search = new URLSearchParams(params).toString();
      response = await this.fetch({
        url: url.toString(),
        method: 'GET',
        headers: {
          'user-agent': this.ua,
          'accept-encoding': 'gzip, deflate, br',
          accept: 'application/json',
        },
      });
    } catch (e) {
      log.error('error', e);
      throw e;
    }
    const result = await this.handleScreenshotResponse(response);
    return result;
  }

  /**
   * Turn scrapfly Extraction API response to ExtractionResult or raise one of ScrapflyError
   */
  async handleExtractionResponse(response: Response): Promise<ExtractionResult> {
    // Body can only be consumed once — reuse the parsed JSON on the
    // error path instead of re-reading, which would fail with
    // "body stream already read".
    const data: Rec<any> = (await response.json()) as Rec<any>;
    if ('error_id' in data) {
      if (data.http_code == 401 || response.status == 401) {
        throw new errors.BadApiKeyError(JSON.stringify(data));
      }
      throw new errors.ExtractionApiError(JSON.stringify(data));
    }
    if (!response.ok) {
      throw new errors.ApiHttpClientError(JSON.stringify(data));
    }
    const result = new ExtractionResult({
      data: data.data,
      content_type: data.content_type,
    });
    return result;
  }

  /**
   * Extract structured data from a web page
   */
  async extract(config: ExtractionConfig): Promise<ExtractionResult> {
    log.debug('extacting data from', { content_type: config.content_type });
    let response;
    try {
      const url = new URL(this.HOST + '/extraction');
      const params = config.toApiParams({ key: this.key });
      url.search = new URLSearchParams(params).toString();
      const headers: Record<string, string> = {
        'user-agent': this.ua,
        'accept-encoding': 'gzip, deflate, br',
        'content-type': config.content_type,
        'accept': 'application/json',
      };
      if (config.document_compression_format && config.document_compression_format) {
        headers['content-encoding'] = config.document_compression_format;
      }
      response = await this.fetch({
        url: url.toString(),
        method: 'POST',
        headers: headers,
        body: config.body,
      });
    } catch (e) {
      log.error('error', e);
      throw e;
    }
    const result = await this.handleExtractionResponse(response);
    return result;
  }

  // ---------------------------------------------------------------------------
  // Crawler API
  // ---------------------------------------------------------------------------

  /**
   * Throw a typed error for a crawler JSON error envelope.
   *
   * The crawler endpoints (status, urls, contents, artifact, cancel) return either
   * a clean JSON body on success or an error envelope `{error_id, http_code, message, ...}`.
   * Use this to map the envelope to one of `BadApiKeyError` / `ScrapflyCrawlerError` /
   * `ApiHttpClientError`.
   */
  private throwCrawlerError(response: Response, data: Rec<any>): never {
    const httpCode = data.http_code ?? response.status;
    const code = (data.code ?? '') as string;
    const message = data.message ?? JSON.stringify(data);
    if (httpCode === 401) {
      throw new errors.BadApiKeyError(message, { http_status_code: httpCode, code, api_response: data });
    }
    if (httpCode === 429) {
      throw new errors.TooManyRequests(message, { http_status_code: httpCode, code, api_response: data });
    }
    // Any ERR::CRAWLER::* code → typed crawler error
    if (typeof code === 'string' && code.includes('::CRAWLER::')) {
      throw new errors.ScrapflyCrawlerError(message, { http_status_code: httpCode, code, api_response: data });
    }
    throw new errors.ApiHttpClientError(message, { http_status_code: httpCode, code, api_response: data });
  }

  /**
   * Schedule a new crawler job.
   *
   * `POST /crawl` — returns `{crawler_uuid, status}` on success. On failure throws
   * `ScrapflyCrawlerError`, `BadApiKeyError`, or `ApiHttpClientError`.
   */
  async crawl(config: CrawlerConfig): Promise<{ crawler_uuid: string; status: string }> {
    log.debug('crawling', { url: config.url });
    let response: Response;
    try {
      const url = new URL(this.HOST + '/crawl');
      url.search = new URLSearchParams({ key: this.key }).toString();
      response = await this.fetch({
        url: url.toString(),
        method: 'POST',
        headers: {
          'user-agent': this.ua,
          'content-type': 'application/json',
          'accept-encoding': 'gzip, deflate, br',
          accept: 'application/json',
        },
        body: JSON.stringify(config.toApiParams()),
      });
    } catch (e) {
      log.error('error', e);
      throw e;
    }
    const data: Rec<any> = (await response.json()) as Rec<any>;
    if ('error_id' in data || data.http_code !== undefined) {
      this.throwCrawlerError(response, data);
    }
    if (typeof data.uuid !== 'string' && typeof data.crawler_uuid !== 'string') {
      throw new errors.ApiHttpClientError(
        `Crawler API returned no uuid: ${JSON.stringify(data).slice(0, 500)}`,
      );
    }
    return {
      crawler_uuid: (data.crawler_uuid ?? data.uuid) as string,
      status: (data.status ?? 'PENDING') as string,
    };
  }

  /**
   * Get the current status of a crawler job.
   *
   * `GET /crawl/{uuid}/status`
   */
  async crawlStatus(uuid: string): Promise<CrawlerStatus> {
    let response: Response;
    try {
      const url = new URL(`${this.HOST}/crawl/${encodeURIComponent(uuid)}/status`);
      url.search = new URLSearchParams({ key: this.key }).toString();
      response = await this.fetch({
        url: url.toString(),
        method: 'GET',
        headers: {
          'user-agent': this.ua,
          'accept-encoding': 'gzip, deflate, br',
          accept: 'application/json',
        },
      });
    } catch (e) {
      log.error('error', e);
      throw e;
    }
    const data: Rec<any> = (await response.json()) as Rec<any>;
    if ('error_id' in data || data.http_code !== undefined) {
      this.throwCrawlerError(response, data);
    }
    return new CrawlerStatus(data);
  }

  /**
   * List crawled URLs for a job, optionally filtered by status and paginated.
   *
   * `GET /crawl/{uuid}/urls?status=<filter>&page=<n>&per_page=<n>`
   *
   * The server streams the response as `text/plain` — one record per line.
   * JSON is intentionally NOT used here because this endpoint is expected to
   * scale to millions of URLs per job, and materialising that as JSON would
   * be prohibitively expensive on both the server and the client. See
   * {@link CrawlerUrls.fromText} for the exact line format.
   *
   * Pagination: the wire protocol carries no global `total`. Request further
   * pages by incrementing `page` until a response contains no records.
   */
  async crawlUrls(
    uuid: string,
    opts?: { status?: 'visited' | 'pending' | 'failed' | 'skipped'; page?: number; per_page?: number },
  ): Promise<CrawlerUrls> {
    const statusHint = opts?.status ?? 'visited';
    const page = opts?.page ?? 1;
    const perPage = opts?.per_page ?? 100;

    let response: Response;
    try {
      const url = new URL(`${this.HOST}/crawl/${encodeURIComponent(uuid)}/urls`);
      const params: Record<string, string> = { key: this.key };
      if (opts?.status) params.status = opts.status;
      if (opts?.page !== undefined) params.page = String(opts.page);
      if (opts?.per_page !== undefined) params.per_page = String(opts.per_page);
      url.search = new URLSearchParams(params).toString();
      response = await this.fetch({
        url: url.toString(),
        method: 'GET',
        headers: {
          'user-agent': this.ua,
          'accept-encoding': 'gzip, deflate, br',
          // text/plain is the canonical format; we also accept JSON because
          // error envelopes come back as JSON regardless of the success type.
          accept: 'text/plain, application/json',
        },
      });
    } catch (e) {
      log.error('error', e);
      throw e;
    }

    // Error envelopes are always JSON, even for text endpoints. Detect by
    // content-type before consuming the body as text.
    const ct = response.headers.get('content-type') ?? '';
    if (ct.includes('application/json')) {
      const data: Rec<any> = (await response.json()) as Rec<any>;
      if ('error_id' in data || data.http_code !== undefined) {
        this.throwCrawlerError(response, data);
      }
      // Unexpected: the server sent JSON on a success response for the text
      // endpoint. Surface this as a client error so users see the mismatch
      // instead of getting silent empty results.
      throw new errors.ApiHttpClientError(
        `crawlUrls expected text/plain, got JSON: ${JSON.stringify(data).slice(0, 500)}`,
      );
    }

    const body = await response.text();
    return CrawlerUrls.fromText(body, statusHint, page, perPage);
  }

  /**
   * Get crawled content from a crawler job.
   *
   * Two modes:
   *
   * 1. **JSON mode** (default, `plain` omitted or false): returns a {@link CrawlerContents}
   *    with a `contents` map (URL → format → content) and pagination links. Useful for
   *    bulk retrieval. Honors `limit` (max 50, default 10) and `offset`.
   *
   * 2. **Plain mode** (`plain: true`): returns the raw content for a single URL/format
   *    as a `string`, with content-type matching the format. Requires `url`. Useful for
   *    piping markdown/text directly. **New in this SDK** (not in Python SDK as of 0.8.27).
   *
   * `GET /crawl/{uuid}/contents`
   */
  async crawlContents(
    uuid: string,
    opts: {
      format: CrawlerContentFormat;
      url?: string;
      plain?: boolean;
      limit?: number;
      offset?: number;
    },
  ): Promise<CrawlerContents | string> {
    if (opts.plain && !opts.url) {
      throw new errors.CrawlerConfigError('plain=true requires a single `url` argument');
    }
    let response: Response;
    try {
      const url = new URL(`${this.HOST}/crawl/${encodeURIComponent(uuid)}/contents`);
      // Note: the server query param is `formats` (plural), not `format`. The
      // public docs say `format` but the actual server only accepts `formats`.
      // We expose `format` (singular) as the SDK option since that's what users
      // expect from the docs, and translate it here.
      const params: Record<string, string> = { key: this.key, formats: opts.format };
      if (opts.url) params.url = opts.url;
      if (opts.plain) params.plain = 'true';
      if (opts.limit !== undefined) params.limit = String(opts.limit);
      if (opts.offset !== undefined) params.offset = String(opts.offset);
      url.search = new URLSearchParams(params).toString();
      response = await this.fetch({
        url: url.toString(),
        method: 'GET',
        headers: {
          'user-agent': this.ua,
          'accept-encoding': 'gzip, deflate, br',
          // In plain mode the server returns the raw content with a format-matching
          // content-type (text/markdown, text/html, etc.); accept anything.
          accept: opts.plain ? '*/*' : 'application/json',
        },
      });
    } catch (e) {
      log.error('error', e);
      throw e;
    }

    if (opts.plain) {
      // Plain mode: server returns raw text. Error envelopes still come back as JSON,
      // so detect that by content-type before reading the body as text.
      const ct = response.headers.get('content-type') ?? '';
      if (ct.includes('application/json')) {
        const data: Rec<any> = (await response.json()) as Rec<any>;
        if ('error_id' in data || data.http_code !== undefined) {
          this.throwCrawlerError(response, data);
        }
        // JSON came back without an error envelope — caller asked for plain but server
        // returned JSON anyway (e.g. format=json). Stringify so the return type is stable.
        return JSON.stringify(data);
      }
      return await response.text();
    }

    const data: Rec<any> = (await response.json()) as Rec<any>;
    if ('error_id' in data || data.http_code !== undefined) {
      this.throwCrawlerError(response, data);
    }
    return new CrawlerContents(data);
  }

  /**
   * Batch-retrieve crawled content for up to 100 URLs in one round-trip.
   *
   * `POST /crawl/{uuid}/contents/batch`
   *
   * The request body is a newline-separated list of URLs (`text/plain`). The response
   * is a `multipart/related` (RFC 2387) document with one part per found URL. Each
   * part has `Content-Type` (matching the format) and `Content-Location` (the URL).
   *
   * Returns a map of `url → format → content`. Formats not requested for a given URL
   * are simply absent from its inner map.
   */
  async crawlContentsBatch(
    uuid: string,
    urls: string[],
    formats: CrawlerContentFormat[],
  ): Promise<Record<string, Record<string, string>>> {
    if (urls.length === 0) {
      throw new errors.CrawlerConfigError('crawlContentsBatch requires at least one url');
    }
    if (urls.length > 100) {
      throw new errors.CrawlerConfigError('crawlContentsBatch is limited to 100 urls per request');
    }
    if (formats.length === 0) {
      throw new errors.CrawlerConfigError('crawlContentsBatch requires at least one format');
    }
    let response: Response;
    try {
      const url = new URL(`${this.HOST}/crawl/${encodeURIComponent(uuid)}/contents/batch`);
      url.search = new URLSearchParams({ key: this.key, formats: formats.join(',') }).toString();
      response = await this.fetch({
        url: url.toString(),
        method: 'POST',
        headers: {
          'user-agent': this.ua,
          'content-type': 'text/plain',
          'accept-encoding': 'gzip, deflate, br',
          accept: 'multipart/related, application/json',
        },
        body: urls.join('\n'),
      });
    } catch (e) {
      log.error('error', e);
      throw e;
    }

    const ct = response.headers.get('content-type') ?? '';
    if (ct.includes('application/json')) {
      // Error envelope
      const data: Rec<any> = (await response.json()) as Rec<any>;
      if ('error_id' in data || data.http_code !== undefined) {
        this.throwCrawlerError(response, data);
      }
      throw new errors.ApiHttpClientError(
        `crawlContentsBatch expected multipart/related, got JSON: ${JSON.stringify(data).slice(0, 500)}`,
      );
    }

    const text = await response.text();
    return parseMultipartRelated(text, ct, formats);
  }

  /**
   * Download a crawler job's WARC or HAR artifact as raw bytes.
   *
   * `GET /crawl/{uuid}/artifact?type=warc|har`
   *
   * The SDK does NOT bundle WARC/HAR parsers — use a dedicated library (e.g. `warcio`
   * on npm) to walk the records. The returned {@link CrawlerArtifact} provides a
   * `save(path)` helper for the common case of writing the artifact to disk.
   */
  async crawlArtifact(uuid: string, type: CrawlerArtifactType = 'warc'): Promise<CrawlerArtifact> {
    let response: Response;
    try {
      const url = new URL(`${this.HOST}/crawl/${encodeURIComponent(uuid)}/artifact`);
      url.search = new URLSearchParams({ key: this.key, type }).toString();
      response = await this.fetch({
        url: url.toString(),
        method: 'GET',
        headers: {
          'user-agent': this.ua,
          // Accept the artifact's binary content type plus JSON for error envelopes
          accept: type === 'har' ? 'application/json, application/octet-stream' : 'application/gzip, application/octet-stream',
        },
      });
    } catch (e) {
      log.error('error', e);
      throw e;
    }

    // Error envelope check (server returns JSON on errors regardless of artifact type)
    const ct = response.headers.get('content-type') ?? '';
    if (ct.includes('application/json') && type !== 'har') {
      // For warc, JSON responses are always errors. For har, JSON IS the artifact —
      // we need to peek at the body to distinguish.
      const data: Rec<any> = (await response.json()) as Rec<any>;
      if ('error_id' in data || data.http_code !== undefined) {
        this.throwCrawlerError(response, data);
      }
      // Should not reach here for warc; treat as unexpected JSON.
      throw new errors.ApiHttpClientError(
        `crawlArtifact(${type}) expected binary, got JSON: ${JSON.stringify(data).slice(0, 500)}`,
      );
    }

    const buf = new Uint8Array(await response.arrayBuffer());

    // For HAR, the body IS JSON — but we still need to detect error envelopes
    // (which set http_code or error_id at the top level of the JSON object).
    if (type === 'har') {
      try {
        const text = new TextDecoder().decode(buf);
        const parsed = JSON.parse(text) as Rec<any>;
        if ('error_id' in parsed || parsed.http_code !== undefined) {
          this.throwCrawlerError(response, parsed);
        }
      } catch (e) {
        // If JSON parse fails, the body is not an error envelope — treat as raw HAR bytes.
        if (e instanceof errors.ScrapflyError) throw e;
      }
    }

    return new CrawlerArtifact(type, buf);
  }

  /**
   * Cancel a running crawler job.
   *
   * `POST /crawl/{uuid}/cancel` — returns `true` on success. The endpoint
   * is idempotent: cancelling a crawl that has already finished is a no-op
   * and still returns success.
   *
   * Note: earlier versions of this SDK called `DELETE /crawl/{uuid}`, which
   * is not a valid public route — that path silently 404'd against the
   * public API. Fixed in 0.8.0 to use the correct documented endpoint.
   */
  async crawlCancel(uuid: string): Promise<boolean> {
    let response: Response;
    try {
      const url = new URL(`${this.HOST}/crawl/${encodeURIComponent(uuid)}/cancel`);
      url.search = new URLSearchParams({ key: this.key }).toString();
      response = await this.fetch({
        url: url.toString(),
        method: 'POST',
        headers: {
          'user-agent': this.ua,
          'accept-encoding': 'gzip, deflate, br',
          accept: 'application/json',
        },
      });
    } catch (e) {
      log.error('error', e);
      throw e;
    }
    // Empty body or JSON
    const ct = response.headers.get('content-type') ?? '';
    if (ct.includes('application/json')) {
      const data: Rec<any> = (await response.json()) as Rec<any>;
      if ('error_id' in data || data.http_code !== undefined) {
        this.throwCrawlerError(response, data);
      }
    }
    return response.ok;
  }
  // --- Cloud Browser ---

  /**
   * Get the WebSocket URL for a Cloud Browser session.
   */
  cloudBrowser(config?: BrowserConfig): string {
    const browserConfig = config || new BrowserConfig();
    return browserConfig.websocketUrl(this.key, this.cloudBrowserHost);
  }

  /**
   * Call the Cloud Browser Unblock API.
   */
  async cloudBrowserUnblock(options: {
    url: string;
    proxy_pool?: string;
    country?: string;
    os?: string;
    timeout?: number;
    browser_timeout?: number;
    headers?: Record<string, string>;
    body?: string;
    method?: string;
    enable_mcp?: boolean;
    solve_captcha?: boolean;
  }): Promise<{ ws_url: string; session_id: string; run_id: string; mcp_endpoint?: string }> {
    const proxyPoolMap: Record<string, string> = {
      datacenter: 'public_datacenter_pool',
      residential: 'public_residential_pool',
    };

    const jsonBody: Record<string, unknown> = { url: options.url };
    if (options.proxy_pool) jsonBody.proxy_pool = proxyPoolMap[options.proxy_pool] || options.proxy_pool;
    if (options.country) jsonBody.country = options.country;
    if (options.os) jsonBody.os = options.os;
    if (options.timeout) jsonBody.timeout = options.timeout;
    if (options.browser_timeout) jsonBody.browser_timeout = options.browser_timeout;
    if (options.headers) jsonBody.headers = options.headers;
    if (options.body) jsonBody.body = options.body;
    if (options.method) jsonBody.method = options.method;
    if (options.enable_mcp !== undefined) jsonBody.enable_mcp = options.enable_mcp;
    if (options.solve_captcha !== undefined) jsonBody.solve_captcha = options.solve_captcha;

    const url = new URL(this.cloudBrowserApiHost + '/unblock');
    url.searchParams.set('key', this.key);

    const response = await this.fetch({
      url: url.toString(),
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'user-agent': this.ua,
      },
      body: JSON.stringify(jsonBody),
    });

    if (!response.ok) {
      throw new Error(`Unblock failed: ${response.status} ${await response.text()}`);
    }
    return await response.json() as { ws_url: string; session_id: string; run_id: string };
  }

  /**
   * Stop a Cloud Browser session.
   */
  async cloudBrowserSessionStop(sessionId: string): Promise<void> {
    const url = new URL(this.cloudBrowserApiHost + '/session/' + sessionId + '/stop');
    url.searchParams.set('key', this.key);

    const response = await this.fetch({
      url: url.toString(),
      method: 'POST',
      headers: { 'user-agent': this.ua },
    });

    if (!response.ok) {
      throw new Error(`Session stop failed: ${response.status} ${await response.text()}`);
    }
  }

  /**
   * List all browser extensions.
   */
  async cloudBrowserExtensionList(): Promise<{ extensions: any[]; quota: { used: number; limit: number } }> {
    const url = new URL(this.cloudBrowserApiHost + '/extension');
    url.searchParams.set('key', this.key);

    const response = await this.fetch({
      url: url.toString(),
      method: 'GET',
      headers: { 'user-agent': this.ua },
    });

    if (!response.ok) {
      throw new Error(`Extension list failed: ${response.status} ${await response.text()}`);
    }
    return await response.json() as { extensions: any[]; quota: { used: number; limit: number } };
  }

  /**
   * Delete a browser extension.
   */
  async cloudBrowserExtensionDelete(extensionId: string): Promise<{ success: boolean; message: string }> {
    const url = new URL(this.cloudBrowserApiHost + '/extension/' + extensionId);
    url.searchParams.set('key', this.key);

    const response = await this.fetch({
      url: url.toString(),
      method: 'DELETE',
      headers: { 'user-agent': this.ua },
    });

    if (!response.ok) {
      throw new Error(`Extension delete failed: ${response.status} ${await response.text()}`);
    }
    return await response.json() as { success: boolean; message: string };
  }

  /**
   * Get details of a specific browser extension.
   */
  async cloudBrowserExtensionGet(extensionId: string): Promise<Record<string, any>> {
    const url = new URL(this.cloudBrowserApiHost + '/extension/' + extensionId);
    url.searchParams.set('key', this.key);

    const response = await this.fetch({
      url: url.toString(),
      method: 'GET',
      headers: { 'user-agent': this.ua },
    });

    if (!response.ok) {
      throw new Error(`Extension get failed: ${response.status} ${await response.text()}`);
    }
    return await response.json() as Record<string, any>;
  }

  /**
   * Upload a browser extension from a local file (.zip or .crx).
   * Pass a file path — the file is read and sent as multipart/form-data.
   */
  async cloudBrowserExtensionUpload(filePath: string): Promise<{ extension: Record<string, any>; is_update: boolean }> {
    const fileBytes = readFileSync(filePath);
    const fileName = filePath.split('/').pop() || filePath.split('\\').pop() || 'extension.zip';
    const boundary = '----ScrapflyBoundary' + Date.now();

    const encoder = new TextEncoder();
    const header = encoder.encode(
      `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${fileName}"\r\nContent-Type: application/octet-stream\r\n\r\n`
    );
    const footer = encoder.encode(`\r\n--${boundary}--\r\n`);

    const body = new Uint8Array(header.length + fileBytes.length + footer.length);
    body.set(header, 0);
    body.set(fileBytes, header.length);
    body.set(footer, header.length + fileBytes.length);

    const url = new URL(this.cloudBrowserApiHost + '/extension');
    url.searchParams.set('key', this.key);

    const response = await this.fetch({
      url: url.toString(),
      method: 'POST',
      headers: {
        'content-type': `multipart/form-data; boundary=${boundary}`,
        'user-agent': this.ua,
      },
      body: body,
    });

    if (!response.ok) {
      throw new Error(`Extension upload failed: ${response.status} ${await response.text()}`);
    }
    return await response.json() as { extension: Record<string, any>; is_update: boolean };
  }

  /**
   * Install a browser extension from a URL (.crx file).
   * URL-based extensions auto-update on each browser session start.
   */
  async cloudBrowserExtensionUploadFromUrl(extensionUrl: string): Promise<{ extension: Record<string, any>; is_update: boolean }> {
    const url = new URL(this.cloudBrowserApiHost + '/extension');
    url.searchParams.set('key', this.key);

    const response = await this.fetch({
      url: url.toString(),
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'user-agent': this.ua,
      },
      body: JSON.stringify({ extension_url: extensionUrl }),
    });

    if (!response.ok) {
      throw new Error(`Extension upload from URL failed: ${response.status} ${await response.text()}`);
    }
    return await response.json() as { extension: Record<string, any>; is_update: boolean };
  }

  /**
   * Download a debug session recording video.
   * Returns the video as an ArrayBuffer (stream from server).
   */
  async cloudBrowserVideo(runId: string): Promise<{ data: ArrayBuffer; filename: string }> {
    const url = new URL(this.cloudBrowserApiHost + '/run/' + runId + '/video');
    url.searchParams.set('key', this.key);

    const response = await this.fetch({
      url: url.toString(),
      method: 'GET',
      headers: { 'user-agent': this.ua },
    });

    if (!response.ok) {
      throw new Error(`Video download failed: ${response.status} ${await response.text()}`);
    }

    const filename = runId + '.webm';
    return { data: await response.arrayBuffer(), filename };
  }

  /**
   * Get playback info for a debug session recording.
   */
  async cloudBrowserPlayback(runId: string): Promise<Record<string, any>> {
    const url = new URL(this.cloudBrowserApiHost + '/run/' + runId + '/playback');
    url.searchParams.set('key', this.key);

    const response = await this.fetch({
      url: url.toString(),
      method: 'GET',
      headers: { 'user-agent': this.ua },
    });

    if (!response.ok) {
      throw new Error(`Playback get failed: ${response.status} ${await response.text()}`);
    }
    return await response.json() as Record<string, any>;
  }

  /**
   * List all running Cloud Browser sessions.
   */
  async cloudBrowserSessions(): Promise<{ sessions: any[]; total: number }> {
    const url = new URL(this.cloudBrowserApiHost + '/sessions');
    url.searchParams.set('key', this.key);

    const response = await this.fetch({
      url: url.toString(),
      method: 'GET',
      headers: { 'user-agent': this.ua },
    });

    if (!response.ok) {
      throw new Error(`Sessions list failed: ${response.status} ${await response.text()}`);
    }
    return await response.json() as { sessions: any[]; total: number };
  }
}

// ---------------------------------------------------------------------------
// multipart/related parser
// ---------------------------------------------------------------------------
//
// Tiny inline parser for the response of `POST /crawl/{uuid}/contents/batch`.
// Avoids pulling in a multipart npm dep so the SDK stays dependency-free.
//
// Each part has at minimum a `Content-Location: <url>` header and a body. The
// `Content-Type` may also be set, indicating the format. We map URL → format → body
// using the `formats` argument as the inferred-format fallback when the part has
// no `Content-Type`.

function parseMultipartRelated(
  body: string,
  contentType: string,
  formats: string[],
): Record<string, Record<string, string>> {
  const boundaryMatch = contentType.match(/boundary=(?:"([^"]+)"|([^;\s]+))/);
  if (!boundaryMatch) {
    throw new errors.ApiHttpClientError(
      `crawlContentsBatch: response has no multipart boundary in content-type "${contentType}"`,
    );
  }
  const boundary = boundaryMatch[1] ?? boundaryMatch[2];
  const delimiter = `--${boundary}`;
  const result: Record<string, Record<string, string>> = {};

  // Split on the delimiter; first segment is the preamble (ignored), last is the
  // closing `--` (also ignored).
  const segments = body.split(delimiter);
  for (let i = 1; i < segments.length; i++) {
    let segment = segments[i];
    // Strip leading CRLF after the boundary
    if (segment.startsWith('\r\n')) segment = segment.slice(2);
    else if (segment.startsWith('\n')) segment = segment.slice(1);
    // The closing boundary is `--{boundary}--`; segment starts with `--` then EOL
    if (segment.startsWith('--')) break;
    // Trim trailing CRLF before the next boundary
    if (segment.endsWith('\r\n')) segment = segment.slice(0, -2);
    else if (segment.endsWith('\n')) segment = segment.slice(0, -1);

    // Header/body split: first blank line
    const headerEnd = segment.indexOf('\r\n\r\n');
    const altHeaderEnd = headerEnd === -1 ? segment.indexOf('\n\n') : headerEnd;
    if (altHeaderEnd === -1) continue;
    const headersRaw = segment.slice(0, altHeaderEnd);
    const partBody = segment.slice(altHeaderEnd + (headerEnd === -1 ? 2 : 4));

    // Parse headers
    let url: string | undefined;
    let format: string | undefined;
    for (const line of headersRaw.split(/\r?\n/)) {
      const colon = line.indexOf(':');
      if (colon === -1) continue;
      const name = line.slice(0, colon).trim().toLowerCase();
      const value = line.slice(colon + 1).trim();
      if (name === 'content-location') url = value;
      else if (name === 'content-type') format = inferFormatFromContentType(value);
    }
    if (!url) continue;
    if (!format) {
      // Fall back to the first requested format if the part has no content-type
      format = formats[0];
    }
    if (!result[url]) result[url] = {};
    result[url][format] = partBody;
  }
  return result;
}

function inferFormatFromContentType(ct: string): string | undefined {
  const lc = ct.toLowerCase().split(';')[0].trim();
  if (lc === 'text/html') return 'html';
  if (lc === 'text/markdown') return 'markdown';
  if (lc === 'text/plain') return 'text';
  if (lc === 'application/json') return 'json';
  return undefined;
}
