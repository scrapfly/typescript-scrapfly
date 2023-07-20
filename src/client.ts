import { ScrapeConfig } from "./scrapeconfig.js";
import * as errors from "./errors.js";
import { ConfigData, ContextData, ResultData, ScrapeResult, AccountData } from "./result.js";
import { Logger, ILogObj } from "tslog";
import axios, { AxiosResponse } from "axios";

export const log: Logger<ILogObj> = new Logger();



export class ScrapflyClient {
    HOST = 'https://api.scrapfly.io';
    key: string;
    ua: string;

    constructor(options: {
        key: string;
    }) {
        if (typeof options.key !== 'string' || options.key.trim() === '') {
            throw new errors.BadApiKeyError('Invalid key. Key must be a non-empty string');
        }
        this.key = options.key;
        this.ua = "Typescript Scrapfly SDK";
    }

    errResult(result: ScrapeResult): errors.ScrapflyError {
        const message = result.result.error ?? "";
        const args = {
            'code': result.result.status,
            'http_status_code': result.result.status_code,
            'is_retryable': false,
            'api_response': result,
            'resource': result.result.status ? result.result.status.split('::')[1]:null,
            'retry_delay': 5,
            'retry_times': 3,
            'documentation_url': 'https://scrapfly.io/docs/scrape-api/errors#api',
            // XXX: include request and response?
            // 'request': result.request,
            // 'response': result.response
        }
        const resourceErrMap = {
            'SCRAPE': errors.ScrapflyScrapeError,
            'WEBHOOK': errors.ScrapflyWebhookError,
            'PROXY': errors.ScrapflyProxyError,
            'SCHEDULE': errors.ScrapflyScheduleError,
            'ASP': errors.ScrapflyAspError,
            'SESSION': errors.ScrapflySessionError,
        }
        const httpStatusErrMap = {
            401: errors.BadApiKeyError,
            429: errors.TooManyRequests,
        }
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
            throw (new errors.ScrapflyError(message, args))
        }
    }

    async handleResponse(response: AxiosResponse): Promise<ScrapeResult> {
        if (response.status < 200 || response.status >= 300) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data = response.data as { config: ConfigData; context: ContextData; result: ResultData; uuid: string; };
        const result = new ScrapeResult(data);
        log.debug("scrape log url: ", result.result.log_url);
        // success
        if (result.result.status === 'DONE' && result.result.success === true) {
            return result;
        }
        // something went wrong
        throw this.errResult(result);
    }

    async account(): Promise<AccountData> {
        log.debug("retrieving account info");
        let response: AxiosResponse;
        try {
            response = await axios.request({
                "method": "GET",
                "url": this.HOST + "/account",
                "headers": {
                    "user-agent": this.ua,
                    "accept-ecoding": "gzip, deflate, br",
                    "accept": "application/json",
                },
                "params": { key: this.key },
                validateStatus: function (status) { return status >= 200 && status < 300; }
            });
        } catch (e) {
            log.error("error", e);
            if (e.response && e.response.status === 401) {
                throw new errors.BadApiKeyError(JSON.stringify(e.response.data));
            }
            throw e;
        }
        return response.data;
    }

    async scrape(config: ScrapeConfig): Promise<ScrapeResult> {
        log.debug("async scraping", { method: config.method, url: config.url });
        let response: AxiosResponse;
        try {
            response = await axios.request({
                "method": config.method,
                "url": this.HOST + "/scrape",
                "headers": {
                    "user-agent": this.ua,
                    "content-type": config.method === "POST" ? config.headers['content-type'] : "application/json",
                    "accept-ecoding": "gzip, deflate, br",
                    "accept": "application/json",
                },
                "params": config.toApiParams({ key: this.key }),
                "data": config.body,
            });
        } catch (e) {
            log.error("error", e);
            if (e.response && e.response.status === 401) {
                throw new errors.BadApiKeyError(JSON.stringify(e.response.data));
            }
            throw e;
        }
        const result = await this.handleResponse(response);
        return result;
    }
}

