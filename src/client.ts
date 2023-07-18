import { ScrapeConfig } from "./scrapeconfig.js";
import { BadApiKeyError } from "./errors.js";
import { ConfigData, ContextData, ResultData, ScrapeResult } from "./result.js";
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
            throw new BadApiKeyError('Invalid key. Key must be a non-empty string');
        }
        this.key = options.key;
        this.ua = "TS SDK TODO";
    }

    async handleResponse(response: AxiosResponse): Promise<ScrapeResult> {
        if (response.status < 200 || response.status >= 300) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data = response.data as { config: ConfigData; context: ContextData; result: ResultData; uuid: string; };
        const result = new ScrapeResult(data);
        log.debug("scrape log url: ", result.result.log_url);
        return result;
    }

    async account() {
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
                validateStatus: function (status) { return status >= 200 && status < 300;}
            });
        } catch (e) {
            log.error("error", e);
            if (e.response && e.response.status === 401) {
                throw new BadApiKeyError(JSON.stringify(e.response.data));
            }
            throw e;
        }
        return response.data;
    }

    async asyncScrape(config: ScrapeConfig): Promise<ScrapeResult> {
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
                throw new BadApiKeyError(JSON.stringify(e.response.data));
            }
            throw e;
        }
        const result = await this.handleResponse(response);
        return result;
    }
}

