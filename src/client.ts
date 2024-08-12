import { path } from './deps.ts';
import { mkdir, writeFile } from './polyfill.ts';
import { fetchRetry } from './utils.ts';
import * as errors from './errors.ts';
import type { ScrapeConfig } from './scrapeconfig.ts';
import type { ScreenshotConfig } from './screenshotconfig.ts';
import type { ExtractionConfig } from './extractionconfig.ts';
import { type AccountData, ExtractionResult, ScrapeResult, ScreenshotResult } from './result.ts';
import { log } from './logger.ts';
import type { Rec } from './types.ts';

export class ScrapflyClient {
  public HOST = 'https://api.scrapfly.io';
  private key: string;
  private ua: string;
  fetch = fetchRetry;

  constructor(options: { key: string }) {
    if (typeof options.key !== 'string' || options.key.trim() === '') {
      throw new errors.BadApiKeyError('Invalid key. Key must be a non-empty string');
    }
    this.key = options.key;
    this.ua = 'Typescript Scrapfly SDK';
  }

  /**
   * Raise appropriate error for given response and scrape result
   */
  errResult(response: Response, result: ScrapeResult): errors.ScrapflyError {
    const error = result.result.error;
    const message = error?.message ?? '';
    const args = {
      code: result.result.status,
      http_status_code: result.result.status_code,
      is_retryable: error?.retryable ?? false,
      api_response: result,
      resource: result.result.status ? result.result.status.split('::')[1] : null,
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
      }
    }
    return new errors.ScrapflyError(message, args);
  }

  /**
   * Handle clob and blob large objects
   */
  async handleLargeObjects(result: any, format: "clob" | "blob"): Promise<ScrapeResult> {
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

    const content: string = await response.text();
    result.content = content
    if (format === 'clob') {
      result.format = 'text'
    }
    if (format === 'blob') {
      result.format = 'binary'
    }
    return result
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
   * Issue a single scrape command from a given scrape configuration
   */
  async scrape(config: ScrapeConfig): Promise<ScrapeResult> {
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
      e.scrapeConfig = config;
      throw e;
    }
    const data: Rec<any> = await response.json() as Rec<any>;
    if ('error_id' in data || Object.keys(data).length === 0) {
      if (data.http_code == 401 || response.status == 401) {
        throw new errors.BadApiKeyError(JSON.stringify(data));
      }
      throw new errors.ApiHttpClientError(JSON.stringify(data));
    }

    const content_format = data.result.format
    if (content_format === 'clob' || content_format === 'blob') {
      const content = await this.handleLargeObjects(data.result, content_format)
      data.result = content
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
    if (response.headers.get('content-type') === 'application/json') {
      const data: Rec<any> = (await response.json()) as Rec<any>;
      if (data.http_code == 401 || response.status == 401) {
        throw new errors.BadApiKeyError(JSON.stringify(data));
      }
      if ('error_id' in data) {
        throw new errors.ScreenshotApiError(JSON.stringify(data));
      }
    }
    if (!response.ok) {
      throw new errors.ScreenshotApiError(JSON.stringify(await response.json()));
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
    const data: Rec<any> = (await response.json()) as Rec<any>;
    if ('error_id' in data) {
      if (data.http_code == 401 || response.status == 401) {
        throw new errors.BadApiKeyError(JSON.stringify(data));
      }
      throw new errors.ExtractionApiError(JSON.stringify(data));
    }
    if (!response.ok) {
      throw new errors.ApiHttpClientError(JSON.stringify(await response.json()));
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
      const params = await config.toApiParams({ key: this.key });
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
}
