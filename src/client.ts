import * as errors from './errors.js';
import { ScrapeConfig } from './scrapeconfig.js';
import { ConfigData, ContextData, ResultData, ScrapeResult, AccountData } from './result.js';
import fetchRetry from 'fetch-retry';
import { log } from './logger.js';

function fetchTimeout(resource: Request, options: RequestInit = {}): Promise<Response> {
    const timeout = 160000; // 160 seconds

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);
    const signal = controller.signal;

    // Add the signal to the options object
    options.signal = signal;

    return fetch(resource, options)
        .then((response) => {
            clearTimeout(timeoutId);
            return response;
        })
        .catch((error) => {
            clearTimeout(timeoutId);
            throw error;
        });
}

export class ScrapflyClient {
    public HOST = 'https://api.scrapfly.io';
    private key: string;
    private ua: string;

    constructor(options: { key: string }) {
        if (typeof options.key !== 'string' || options.key.trim() === '') {
            throw new errors.BadApiKeyError('Invalid key. Key must be a non-empty string');
        }
        this.key = options.key;
        this.ua = 'Typescript Scrapfly SDK';
    }

    fetch = fetchRetry(fetchTimeout, {
        retryDelay: 1000,
        retryOn: function (attempt, error, response) {
            const maxRetries = 3;
            // retry on any network errors or 5xx status codes
            if (attempt <= maxRetries && (error !== null || (response && response.status >= 500))) {
                return true;
            }
            return false;
        },
    });

    /**
     * Raise appropriate error for given response and scrape result
     */
    errResult(response: Response, result: ScrapeResult): errors.ScrapflyError {
        const error = result.result.error;
        const message = error.message ?? '';
        const args = {
            code: result.result.status,
            http_status_code: result.result.status_code,
            is_retryable: error.retryable ?? false,
            api_response: result,
            resource: result.result.status ? result.result.status.split('::')[1] : null,
            retry_delay: error.retryable ? 5 : response.headers.get('X-Retry') ?? 5,
            retry_times: 3,
            documentation_url: error.doc_url ?? 'https://scrapfly.io/docs/scrape-api/errors#api',
        };
        const resourceErrMap = {
            SCRAPE: errors.ScrapflyScrapeError,
            WEBHOOK: errors.ScrapflyWebhookError,
            PROXY: errors.ScrapflyProxyError,
            SCHEDULE: errors.ScrapflyScheduleError,
            ASP: errors.ScrapflyAspError,
            SESSION: errors.ScrapflySessionError,
        };
        const httpStatusErrMap = {
            401: errors.BadApiKeyError,
            429: errors.TooManyRequests,
        };
        if (result.result.success === true) {
            if (args.http_status_code >= 500) {
                return new errors.ApiHttpServerError(message, args);
            }
            if (httpStatusErrMap[args.http_status_code]) {
                return new httpStatusErrMap[args.http_status_code](message, args);
            }
            if (resourceErrMap[args.resource]) {
                return new resourceErrMap[args.resource](message, args);
            }
            return new errors.ApiHttpClientError(message, args);
        } else {
            if (args.code === 'ERR::SCRAPE::BAD_UPSTREAM_RESPONSE') {
                if (args.http_status_code >= 500) {
                    return new errors.UpstreamHttpServerError(message, args);
                }
                if (args.http_status_code >= 400) {
                    return new errors.UpstreamHttpClientError(message, args);
                }
            }
            if (resourceErrMap[args.resource]) {
                return new resourceErrMap[args.resource](message, args);
            }
            throw new errors.ScrapflyError(message, args);
        }
    }

    /**
     * Turn scrapfly API response to ScrapeResult or raise one of ScrapflyError
     */
    async handleResponse(response: Response, data): Promise<ScrapeResult> {
        data = data as {
            config: ConfigData;
            context: ContextData;
            result: ResultData;
            uuid: string;
        };
        const result = new ScrapeResult(data);
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
        let response;
        try {
            const url = new URL(this.HOST + '/account');
            const params = { key: this.key };
            url.search = new URLSearchParams(params).toString();
            response = await this.fetch(
                new Request(url.toString(), {
                    method: 'GET',
                    headers: {
                        'user-agent': this.ua,
                        'accept-encoding': 'gzip, deflate, br',
                        accept: 'application/json',
                    },
                }),
            );
        } catch (e) {
            log.error('error', e);
            throw e;
        }
        const data = await response.json();
        if ('error_id' in data || Object.keys(data).length === 0) {
            if (data.http_code == 401 || response.status == 401) {
                throw new errors.BadApiKeyError(JSON.stringify(data));
            }
            throw new errors.ApiHttpClientError(JSON.stringify(data));
        }
        return data;
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
            response = await this.fetch(
                new Request(url.toString(), {
                    method: config.method,
                    headers: {
                        'user-agent': this.ua,
                        'content-type': config.method === 'POST' ? config.headers['content-type'] : 'application/json',
                        'accept-encoding': 'gzip, deflate, br',
                        accept: 'application/json',
                    },
                    body: config.body,
                }),
            );
        } catch (e) {
            log.error('error', e);
            throw e;
        }
        const data = await response.json();
        if ('error_id' in data || Object.keys(data).length === 0) {
            if (data.http_code == 401 || response.status_code == 401) {
                throw new errors.BadApiKeyError(JSON.stringify(data));
            }
            throw new errors.ApiHttpClientError(JSON.stringify(data));
        }
        const result = await this.handleResponse(response, data);
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
}
