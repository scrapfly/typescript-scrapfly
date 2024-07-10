import * as errors from '../../src/errors.js';
import { ScrapflyClient } from '../../src/client.js';
import { ScrapeConfig } from '../../src/scrapeconfig.js';
import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { resultFactory, responseFactory } from '../utils.js';

describe('scrape', () => {
    const KEY = '__API_KEY__';
    const client = new ScrapflyClient({ key: KEY });

    beforeEach(() => {
        jest.spyOn(client, 'fetch').mockClear(); // clear all mock meta on each test
    });

    it('GET success', async () => {
        const spy = jest.spyOn(client, 'fetch');
        const url = 'https://httpbin.dev/json';
        jest.spyOn(client, 'fetch').mockImplementation(async (config: Request): Promise<any> => {
            const configUrl = config[Object.getOwnPropertySymbols(config)[1]].url;
            // Ensure the URL matches the pattern
            expect(configUrl.origin + configUrl.pathname).toEqual(client.HOST + '/scrape');
            expect(config.method).toEqual('GET');
            expect(configUrl.searchParams.get('key')).toMatch(KEY);
            expect(configUrl.searchParams.get('url')).toMatch(url);
            expect(Array.from(configUrl.searchParams.keys())).toEqual(['key', 'url']);
            const result = resultFactory({
                url: url,
            });
            return responseFactory(result.data, {
                status: 200,
                headers: {
                    'Content-Type': 'application/json',
                },
            });
        });

        const result = await client.scrape(new ScrapeConfig({ url: url }));
        expect(result).toBeDefined();

        // a single request
        expect(spy).toHaveBeenCalledTimes(1);
    });
});

describe('scrape errors', () => {
    const KEY = '__API_KEY__';
    const client = new ScrapflyClient({ key: KEY });

    beforeEach(() => {
        jest.spyOn(client, 'fetch').mockClear();
    });

    it('raises ApiHttpServerError on 500 and success', async () => {
        const url = 'https://httpbin.dev/json';
        jest.spyOn(client, 'fetch').mockImplementation(async (): Promise<any> => {
            const result = resultFactory({
                url: url,
                status_code: 500,
                status: 'ERROR',
                success: true,
                error: 'failed to connect to upstream server',
            });
            return responseFactory(result.data, {
                status: 200,
                headers: {
                    'Content-Type': 'application/json',
                },
            });
        });
        await expect(client.scrape(new ScrapeConfig({ url }))).rejects.toThrow(errors.ApiHttpServerError);
    });

    it('raises BadApiKeyError on 401', async () => {
        const url = 'https://httpbin.dev/json';
        jest.spyOn(client, 'fetch').mockImplementation(async (): Promise<any> => {
            const result = {
                status: 'error',
                http_code: 401,
                reason: 'Unauthorized',
                error_id: '301e2d9e-b4f5-4289-85ea-e452143338df',
                message: 'Invalid API key',
            };
            return responseFactory(result, {
                status: 401,
                headers: {
                    'Content-Type': 'application/json',
                },
            });
        });
        await expect(client.scrape(new ScrapeConfig({ url }))).rejects.toThrow(errors.BadApiKeyError);
    });

    it('raises TooManyRequests on 429 and success', async () => {
        const url = 'https://httpbin.dev/json';
        jest.spyOn(client, 'fetch').mockImplementation(async (): Promise<any> => {
            const result = resultFactory({
                url: url,
                status_code: 429,
                status: 'ERROR',
                success: true,
            });
            return responseFactory(result.data, {
                status: 200,
                headers: {
                    'Content-Type': 'application/json',
                },
            });
        });
        await expect(client.scrape(new ScrapeConfig({ url }))).rejects.toThrow(errors.TooManyRequests);
    });

    it('raises ScrapflyScrapeError on ::SCRAPE:: resource and success', async () => {
        jest.spyOn(client, 'fetch').mockImplementation(async (config: Request): Promise<any> => {
            const result = resultFactory({
                url: config.url,
                status: 'ERR::SCRAPE::BAD_PROTOCOL',
                success: true,
            });
            return responseFactory(result.data, {
                status: 200,
                headers: {
                    'Content-Type': 'application/json',
                },
            });
        });
        await expect(client.scrape(new ScrapeConfig({ url: 'https://httpbin.dev/json' }))).rejects.toThrow(
            errors.ScrapflyScrapeError,
        );
    });

    it('raises ScrapflyWebhookError on ::WEBHOOK:: resource and success', async () => {
        jest.spyOn(client, 'fetch').mockImplementation(async (config: Request): Promise<any> => {
            const result = resultFactory({
                url: config.url,
                status: 'ERR::WEBHOOK::DISABLED ',
                success: true,
            });
            return responseFactory(result.data, {
                status: 200,
                headers: {
                    'Content-Type': 'application/json',
                },
            });
        });
        await expect(client.scrape(new ScrapeConfig({ url: 'https://httpbin.dev/json' }))).rejects.toThrow(
            errors.ScrapflyWebhookError,
        );
    });

    it('raises ScrapflyProxyError on ERR::PROXY::POOL_NOT_FOUND  resource and success', async () => {
        jest.spyOn(client, 'fetch').mockImplementation(async (config: Request): Promise<any> => {
            const result = resultFactory({
                url: config.url,
                status: 'ERR::PROXY::POOL_NOT_FOUND ',
                success: true,
            });
            return responseFactory(result.data, {
                status: 200,
                headers: {
                    'Content-Type': 'application/json',
                },
            });
        });
        await expect(client.scrape(new ScrapeConfig({ url: 'https://httpbin.dev/json' }))).rejects.toThrow(
            errors.ScrapflyProxyError,
        );
    });

    it('raises ScrapflyScheduleError on ERR::SCHEDULE::DISABLED resource and success', async () => {
        jest.spyOn(client, 'fetch').mockImplementation(async (config: Request): Promise<any> => {
            const result = resultFactory({
                url: config.url,
                status: 'ERR::SCHEDULE::DISABLED',
                success: true,
            });
            return responseFactory(result.data, {
                status: 200,
                headers: {
                    'Content-Type': 'application/json',
                },
            });
        });
        await expect(client.scrape(new ScrapeConfig({ url: 'https://httpbin.dev/json' }))).rejects.toThrow(
            errors.ScrapflyScheduleError,
        );
    });

    it('raises ScrapflyAspError on ERR::ASP::SHIELD_ERROR resource and success', async () => {
        jest.spyOn(client, 'fetch').mockImplementation(async (config: Request): Promise<any> => {
            const result = resultFactory({
                url: config.url,
                status: 'ERR::ASP::SHIELD_ERROR',
                success: true,
            });
            return responseFactory(result.data, {
                status: 200,
                headers: {
                    'Content-Type': 'application/json',
                },
            });
        });
        await expect(client.scrape(new ScrapeConfig({ url: 'https://httpbin.dev/json' }))).rejects.toThrow(
            errors.ScrapflyAspError,
        );
    });

    it('raises ScrapflySessionError on ERR::SESSION::CONCURRENT_ACCESS resource and success', async () => {
        jest.spyOn(client, 'fetch').mockImplementation(async (config: Request): Promise<any> => {
            const result = resultFactory({
                url: config.url,
                status: 'ERR::SESSION::CONCURRENT_ACCESS',
                success: true,
            });
            return responseFactory(result.data, {
                status: 200,
                headers: {
                    'Content-Type': 'application/json',
                },
            });
        });
        await expect(client.scrape(new ScrapeConfig({ url: 'https://httpbin.dev/json' }))).rejects.toThrow(
            errors.ScrapflySessionError,
        );
    });

    it('raises ApiHttpClientError on success and unknown status', async () => {
        jest.spyOn(client, 'fetch').mockImplementation(async (config: Request): Promise<any> => {
            const result = resultFactory({
                url: config.url,
                status: 'ERR::NEW',
                success: true,
            });
            return responseFactory(result.data, {
                status: 200,
                headers: {
                    'Content-Type': 'application/json',
                },
            });
        });
        await expect(client.scrape(new ScrapeConfig({ url: 'https://httpbin.dev/json' }))).rejects.toThrow(
            errors.ApiHttpClientError,
        );
    });

    it('raises UpstreamHttpServerError on failure, ERR::SCRAPE::BAD_UPSTREAM_RESPONSE and >=500', async () => {
        jest.spyOn(client, 'fetch').mockImplementation(async (config: Request): Promise<any> => {
            const result = resultFactory({
                url: config.url,
                success: false,
                status_code: 500,
                status: 'ERR::SCRAPE::BAD_UPSTREAM_RESPONSE',
            });
            return responseFactory(result.data, {
                status: 200,
                headers: {
                    'Content-Type': 'application/json',
                },
            });
        });
        await expect(client.scrape(new ScrapeConfig({ url: 'https://httpbin.dev/json' }))).rejects.toThrow(
            errors.UpstreamHttpServerError,
        );
    });

    it('raises UpstreamHttpClientError on failure, ERR::SCRAPE::BAD_UPSTREAM_RESPONSE and 4xx status', async () => {
        jest.spyOn(client, 'fetch').mockImplementation(async (config: Request): Promise<any> => {
            const result = resultFactory({
                url: config.url,
                success: false,
                status_code: 404,
                status: 'ERR::SCRAPE::BAD_UPSTREAM_RESPONSE',
            });
            return responseFactory(result.data, {
                status: 200,
                headers: {
                    'Content-Type': 'application/json',
                },
            });
        });
        await expect(client.scrape(new ScrapeConfig({ url: 'https://httpbin.dev/json' }))).rejects.toThrow(
            errors.UpstreamHttpClientError,
        );
    });

    it('raises resource exceptions on failure', async () => {
        const resourceErrMap = {
            SCRAPE: errors.ScrapflyScrapeError,
            WEBHOOK: errors.ScrapflyWebhookError,
            PROXY: errors.ScrapflyProxyError,
            SCHEDULE: errors.ScrapflyScheduleError,
            ASP: errors.ScrapflyAspError,
            SESSION: errors.ScrapflySessionError,
        };
        for (const [resource, err] of Object.entries(resourceErrMap)) {
            jest.spyOn(client, 'fetch').mockImplementation(async (config: Request): Promise<any> => {
                const result = resultFactory({
                    url: config.url,
                    success: false,
                    status: `ERR::${resource}::MISSING`,
                });
                return responseFactory(result.data, {
                    status: 200,
                    headers: {
                        'Content-Type': 'application/json',
                    },
                });
            });
            await expect(client.scrape(new ScrapeConfig({ url: 'https://httpbin.dev/json' }))).rejects.toThrow(err);
        }
    });

    it('raises ScrapflyError on unhandled failure', async () => {
        jest.spyOn(client, 'fetch').mockImplementation(async (config: Request): Promise<any> => {
            const result = resultFactory({
                url: config.url,
                success: false,
                status_code: 404,
                status: 'ERR',
            });
            return responseFactory(result.data, {
                status: 200,
                headers: {
                    'Content-Type': 'application/json',
                },
            });
        });
        await expect(client.scrape(new ScrapeConfig({ url: 'https://httpbin.dev/json' }))).rejects.toThrow(
            errors.ScrapflyError,
        );
    });

    it('account retrieval status unhandled code (e.g. 404)', async () => {
        jest.spyOn(client, 'fetch').mockImplementation(async (): Promise<any> => {
            return responseFactory(
                {},
                {
                    status: 404,
                },
            );
        });
        await expect(client.account()).rejects.toThrow(errors.HttpError);
    });

    it('account retrieval bad api key (status 401)', async () => {
        jest.spyOn(client, 'fetch').mockImplementation(async (): Promise<any> => {
            return responseFactory(
                {},
                {
                    status: 401,
                },
            );
        });
        await expect(client.account()).rejects.toThrow(errors.BadApiKeyError);
    });
});

describe('concurrent scrape', () => {
    const KEY = '__API_KEY__';
    const client = new ScrapflyClient({ key: KEY });
    // mock fetch to return /account data and 2 types of results:
    // - success for /success endpoints
    // - ASP failure for /failure endpoints

    it('success with explicit concurrency', async () => {
        const spy = jest.spyOn(client, 'fetch');
        spy.mockImplementation(async (config: Request): Promise<any> => {
            const configs = [
                ...new Array(5).fill(null).map(() => new ScrapeConfig({ url: 'https://httpbin.dev/status/200' })),
                ...new Array(5).fill(null).map(() => new ScrapeConfig({ url: 'https://httpbin.dev/status/400' })),
            ];
            const results = [];
            const errors = [];
            if (config.url.includes('/200')) {
                const result = resultFactory({
                    url: config.url,
                    status: 'DONE',
                    success: true,
                    status_code: 200,
                });
                return responseFactory(result.data, {
                    status: 200,
                    headers: {
                        'Content-Type': 'application/json',
                    },
                });
            }
            if (config.url.includes('/400')) {
                const result = resultFactory({
                    url: config.url,
                    status: 'ERR::ASP::SHIELD_ERROR',
                    success: true,
                });
                return responseFactory(result.data, {
                    status: 200,
                    headers: {
                        'Content-Type': 'application/json',
                    },
                });
            }
            for await (const resultOrError of client.concurrentScrape(configs, 10)) {
                if (resultOrError instanceof Error) {
                    errors.push(resultOrError);
                } else {
                    results.push(resultOrError);
                }
            }
            expect(results.length).toBe(5);
            expect(errors.length).toBe(5);
            expect(spy).toHaveBeenCalledTimes(10);
        });
    }, 10_000);
});
