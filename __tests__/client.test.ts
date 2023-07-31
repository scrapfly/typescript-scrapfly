import axios from 'axios';
import { AxiosRequestConfig } from 'axios';
import { ScrapflyClient } from '../src/client.js';
import * as errors from '../src/errors.js';
import { ScrapeConfig } from '../src/scrapeconfig.js';
import { describe, it, expect, jest, beforeEach } from '@jest/globals';

jest.mock('axios');

const mockedAxios = axios as jest.Mocked<typeof axios>;

function resultFactory(params: {
    url?: string;
    status?: string;
    status_code?: number;
    response_status_code?: number;
    success?: boolean;
    error?: string;
}): Record<string, any> {
    return {
        status: params.response_status_code ?? 200,
        data: {
            result: {
                content: 'some html',
                status: params.status ?? 'DONE',
                success: params.success ?? true,
                status_code: params.status_code ?? 200,
                error: params.error ?? '',
            },
            config: { url: params.url ?? 'https://httpbin.dev/json' },
            context: { asp: false },
            uuid: '1234',
        },
    };
}

describe('concurrent scrape', () => {
    const client = new ScrapflyClient({ key: '1234' });
    // mock axios to return /account data and 2 types of results:
    // - success for /success endpoints
    // - ASP failure for /failure endpoints
    mockedAxios.request.mockImplementation(async (config: AxiosRequestConfig): Promise<any> => {
        if (config.url.includes('/account')) {
            return {
                status: 200,
                data: {
                    account: { account_id: '1234' },
                    project: { scrape_request_count: 42 },
                    subscription: { usage: { scrape: { concurrent_limit: 5 } } },
                },
            };
        }
        // sleep for 1 second
        await new Promise((resolve) => setTimeout(resolve, 1000));
        if (config.params.url.includes('/success')) {
            return resultFactory({
                url: config.url,
                status: 'DONE',
                success: true,
                status_code: 200,
            });
        }
        if (config.params.url.includes('/failure')) {
            return resultFactory({
                url: config.url,
                status: 'ERR::ASP::SHIELD_ERROR',
                success: true,
            });
        }
        return null;
    });

    beforeEach(() => {
        mockedAxios.request.mockClear(); // clear all mock meta on each test
    });

    it('success', async () => {
        const configs = [
            ...new Array(5).fill(null).map(() => new ScrapeConfig({ url: 'https://httpbin.dev/success' })),
            ...new Array(5).fill(null).map(() => new ScrapeConfig({ url: 'https://httpbin.dev/failure' })),
        ];
        const results = [];
        const errors = [];
        for await (const resultOrError of client.concurrentScrape(configs)) {
            if (resultOrError instanceof Error) {
                errors.push(resultOrError);
            } else {
                results.push(resultOrError);
            }
        }
        expect(results.length).toBe(5);
        expect(errors.length).toBe(5);
        // 10 requests and 1 account info
        expect(mockedAxios.request).toHaveBeenCalledTimes(11);
    }, 5_000);

    it('success with explicit concurrency', async () => {
        const configs = [
            ...new Array(5).fill(null).map(() => new ScrapeConfig({ url: 'https://httpbin.dev/success' })),
            ...new Array(5).fill(null).map(() => new ScrapeConfig({ url: 'https://httpbin.dev/failure' })),
        ];
        const results = [];
        const errors = [];
        for await (const resultOrError of client.concurrentScrape(configs, 10)) {
            if (resultOrError instanceof Error) {
                errors.push(resultOrError);
            } else {
                results.push(resultOrError);
            }
        }
        expect(results.length).toBe(5);
        expect(errors.length).toBe(5);
        // 10 requests and 1 account info
        expect(mockedAxios.request).toHaveBeenCalledTimes(10);
    }, 2_000);
});

describe('scrape', () => {
    const KEY = '1234';
    const client = new ScrapflyClient({ key: KEY });

    beforeEach(() => {
        mockedAxios.request.mockClear(); // clear all mock meta on each test
    });

    it('GET success', async () => {
        const url = 'https://httpbin.dev/json';
        mockedAxios.request.mockImplementation(async (config: AxiosRequestConfig): Promise<any> => {
            // Ensure the URL matches the pattern
            expect(config.url).toMatch(client.HOST + '/scrape');
            expect(config.method).toEqual('GET');
            expect(config.params.key).toMatch(KEY);
            expect(config.params.url).toMatch(url);
            expect(Object.keys(config.params)).toEqual(['key', 'url']);

            // Return the fake response
            return resultFactory({ url });
        });

        const result = await client.scrape(new ScrapeConfig({ url: url }));
        expect(result).toBeDefined();
        expect(result.result.content).toBe('some html');
        expect(result.config.url).toBe('https://httpbin.dev/json');
        expect(result.context.asp).toBe(false);
        expect(result.uuid).toBe('1234');
        // a single request:
        expect(mockedAxios.request).toHaveBeenCalledTimes(1);
    });

    it('GET complex urls', async () => {
        const url = 'https://httpbin.dev/anything/?website=https://httpbin.dev/anything';
        mockedAxios.request.mockImplementation(async (config: AxiosRequestConfig): Promise<any> => {
            // Ensure the URL matches the pattern
            expect(config.url).toMatch(client.HOST + '/scrape');
            expect(config.method).toEqual('GET');
            expect(config.params.key).toMatch(KEY);
            expect(config.params.url).toMatch(url);
            expect(Object.keys(config.params)).toEqual(['key', 'url']);

            // Return the fake response
            return resultFactory({ url });
        });

        const result = await client.scrape(new ScrapeConfig({ url: url }));
        expect(result).toBeDefined();
        expect(result.result.content).toBe('some html');
        expect(result.config.url).toBe(url);
        expect(result.context.asp).toBe(false);
        expect(result.uuid).toBe('1234');
        // a single request:
        expect(mockedAxios.request).toHaveBeenCalledTimes(1);
    });

    it('POST success', async () => {
        const url = 'https://httpbin.dev/json';
        mockedAxios.request.mockImplementation(async (config: AxiosRequestConfig): Promise<any> => {
            // Ensure the URL matches the pattern
            expect(config.url).toMatch(client.HOST + '/scrape');
            expect(config.method).toEqual('POST');
            expect(config.params.key).toMatch(KEY);
            expect(config.params.url).toMatch(url);
            expect(config.params['headers[content-type]']).toMatch('application/x-www-form-urlencoded');
            expect(Object.keys(config.params)).toEqual(['key', 'url', 'headers[content-type]']);

            // Return the fake response
            return resultFactory({ url });
        });

        const result = await client.scrape(
            new ScrapeConfig({
                url: 'https://httpbin.dev/json',
                method: 'POST',
                data: { foo: 'bar' },
            }),
        );
        expect(result).toBeDefined();
        expect(result.result.content).toBe('some html');
        expect(result.config.url).toBe('https://httpbin.dev/json');
        expect(result.context.asp).toBe(false);
        expect(result.uuid).toBe('1234');
        expect(mockedAxios.request).toHaveBeenCalledTimes(1);
    });

    it('unhandled errors propagate up', async () => {
        const url = 'https://httpbin.dev/json';
        mockedAxios.request.mockImplementation(() => Promise.reject(new Error('Network Error')));

        await expect(async () => {
            await client.scrape(new ScrapeConfig({ url }));
        }).rejects.toThrow('Network Error');
    });
    // it('handles ')
});

describe('client init', () => {
    it('success', async () => {
        const client = new ScrapflyClient({ key: '1234' });
        expect(client).toBeDefined();
    });

    it('invalid key', async () => {
        expect(() => {
            new ScrapflyClient({ key: null });
        }).toThrow(errors.BadApiKeyError);
    });
});

describe('client errors', () => {
    const KEY = '1234';
    const client = new ScrapflyClient({ key: KEY });

    beforeEach(() => {
        mockedAxios.request.mockClear(); // clear all mock meta on each test
    });

    it('raises ApiHttpServerError on 500 and success', async () => {
        const url = 'https://httpbin.dev/json';
        mockedAxios.request.mockImplementation(async (config: AxiosRequestConfig): Promise<any> => {
            return resultFactory({
                url: config.url,
                status_code: 500,
                status: 'ERROR',
                success: true,
                error: 'failed to connect to upstream server',
            });
        });
        await expect(client.scrape(new ScrapeConfig({ url }))).rejects.toThrow(errors.ApiHttpServerError);
    });

    it('raises BadApiKeyError on 401', async () => {
        const url = 'https://httpbin.dev/json';
        mockedAxios.request.mockImplementation(async (config: AxiosRequestConfig): Promise<any> => {
            return resultFactory({
                url: config.url,
                status_code: 401,
                status: 'ERROR',
                success: true,
                error: 'failed to connect to upstream server',
            });
        });
        await expect(client.scrape(new ScrapeConfig({ url }))).rejects.toThrow(errors.BadApiKeyError);
    });
    it('raises TooManyRequests on 429 and success', async () => {
        const url = 'https://httpbin.dev/json';
        mockedAxios.request.mockImplementation(async (config: AxiosRequestConfig): Promise<any> => {
            return resultFactory({
                url: config.url,
                status_code: 429,
                status: 'ERROR',
                success: true,
            });
        });
        await expect(client.scrape(new ScrapeConfig({ url }))).rejects.toThrow(errors.TooManyRequests);
    });
    it('raises ScrapflyScrapeError on ::SCRAPE:: resource and success', async () => {
        mockedAxios.request.mockImplementation(async (config: AxiosRequestConfig): Promise<any> => {
            return resultFactory({
                url: config.url,
                status: 'ERR::SCRAPE::BAD_PROTOCOL',
                success: true,
            });
        });
        await expect(client.scrape(new ScrapeConfig({ url: 'https://httpbin.dev/json' }))).rejects.toThrow(
            errors.ScrapflyScrapeError,
        );
    });

    it('raises ScrapflyWebhookError on ::WEBHOOK:: resource and success', async () => {
        mockedAxios.request.mockImplementation(async (config: AxiosRequestConfig): Promise<any> => {
            return resultFactory({
                url: config.url,
                status: 'ERR::WEBHOOK::DISABLED ',
                success: true,
            });
        });
        await expect(client.scrape(new ScrapeConfig({ url: 'https://httpbin.dev/json' }))).rejects.toThrow(
            errors.ScrapflyWebhookError,
        );
    });
    it('raises ScrapflyProxyError on ERR::PROXY::POOL_NOT_FOUND  resource and success', async () => {
        mockedAxios.request.mockImplementation(async (config: AxiosRequestConfig): Promise<any> => {
            return resultFactory({
                url: config.url,
                status: 'ERR::PROXY::POOL_NOT_FOUND ',
                success: true,
            });
        });
        await expect(client.scrape(new ScrapeConfig({ url: 'https://httpbin.dev/json' }))).rejects.toThrow(
            errors.ScrapflyProxyError,
        );
    });

    it('raises ScrapflyScheduleError on ERR::SCHEDULE::DISABLED resource and success', async () => {
        mockedAxios.request.mockImplementation(async (config: AxiosRequestConfig): Promise<any> => {
            return resultFactory({
                url: config.url,
                status: 'ERR::SCHEDULE::DISABLED',
                success: true,
            });
        });
        await expect(client.scrape(new ScrapeConfig({ url: 'https://httpbin.dev/json' }))).rejects.toThrow(
            errors.ScrapflyScheduleError,
        );
    });

    it('raises ScrapflyAspError on ERR::ASP::SHIELD_ERROR resource and success', async () => {
        mockedAxios.request.mockImplementation(async (config: AxiosRequestConfig): Promise<any> => {
            return resultFactory({
                url: config.url,
                status: 'ERR::ASP::SHIELD_ERROR',
                success: true,
            });
        });
        await expect(client.scrape(new ScrapeConfig({ url: 'https://httpbin.dev/json' }))).rejects.toThrow(
            errors.ScrapflyAspError,
        );
    });

    it('raises ScrapflySessionError on ERR::SESSION::CONCURRENT_ACCESS resource and success', async () => {
        mockedAxios.request.mockImplementation(async (config: AxiosRequestConfig): Promise<any> => {
            return resultFactory({
                url: config.url,
                status: 'ERR::SESSION::CONCURRENT_ACCESS',
                success: true,
            });
        });
        await expect(client.scrape(new ScrapeConfig({ url: 'https://httpbin.dev/json' }))).rejects.toThrow(
            errors.ScrapflySessionError,
        );
    });

    it('raises ApiHttpClientError on success and unknown status', async () => {
        mockedAxios.request.mockImplementation(async (config: AxiosRequestConfig): Promise<any> => {
            return resultFactory({
                url: config.url,
                status: 'ERR::NEW',
                success: true,
            });
        });
        await expect(client.scrape(new ScrapeConfig({ url: 'https://httpbin.dev/json' }))).rejects.toThrow(
            errors.ApiHttpClientError,
        );
    });
    it('raises UpstreamHttpServerError on failure, ERR::SCRAPE::BAD_UPSTREAM_RESPONSE and >=500', async () => {
        mockedAxios.request.mockImplementation(async (config: AxiosRequestConfig): Promise<any> => {
            return resultFactory({
                url: config.url,
                success: false,
                status_code: 500,
                status: 'ERR::SCRAPE::BAD_UPSTREAM_RESPONSE',
            });
        });
        await expect(client.scrape(new ScrapeConfig({ url: 'https://httpbin.dev/json' }))).rejects.toThrow(
            errors.UpstreamHttpServerError,
        );
    });
    it('raises UpstreamHttpClientError on failure, ERR::SCRAPE::BAD_UPSTREAM_RESPONSE and 4xx status', async () => {
        mockedAxios.request.mockImplementation(async (config: AxiosRequestConfig): Promise<any> => {
            return resultFactory({
                url: config.url,
                success: false,
                status_code: 404,
                status: 'ERR::SCRAPE::BAD_UPSTREAM_RESPONSE',
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
            mockedAxios.request.mockImplementation(async (config: AxiosRequestConfig): Promise<any> => {
                return resultFactory({
                    url: config.url,
                    success: false,
                    status: `ERR::${resource}::MISSING`,
                });
            });
            await expect(client.scrape(new ScrapeConfig({ url: 'https://httpbin.dev/json' }))).rejects.toThrow(err);
        }
    });

    it('raises ScrapflyError on unhandled failure', async () => {
        mockedAxios.request.mockImplementation(async (config: AxiosRequestConfig): Promise<any> => {
            return resultFactory({
                url: config.url,
                success: false,
                status_code: 404,
                status: 'ERR',
            });
        });
        await expect(client.scrape(new ScrapeConfig({ url: 'https://httpbin.dev/json' }))).rejects.toThrow(
            errors.ScrapflyError,
        );
    });
    it('raises  on unhandled failure', async () => {
        mockedAxios.request.mockImplementation(async (config: AxiosRequestConfig): Promise<any> => {
            return resultFactory({
                url: config.url,
                success: false,
                status_code: 404,
                status: 'ERR',
            });
        });
        await expect(client.scrape(new ScrapeConfig({ url: 'https://httpbin.dev/json' }))).rejects.toThrow(
            errors.ScrapflyError,
        );
    });
    it('account retrieval status unhandled code (e.g. 404)', async () => {
        mockedAxios.request.mockRejectedValue({
            response: { status: 404, data: {} },
        });
        await expect(client.account()).rejects.toThrow(errors.HttpError);
    });
    it('account retrieval bad api key (status 401)', async () => {
        mockedAxios.request.mockRejectedValue({
            response: { status: 401, data: {} },
        });
        await expect(client.account()).rejects.toThrow(errors.BadApiKeyError);
    });
    it('scrape bad api key (status 401)', async () => {
        mockedAxios.request.mockRejectedValue({
            response: { status: 401, data: {} },
        });
        await expect(client.scrape(new ScrapeConfig({ url: 'https://httpbin.dev/json' }))).rejects.toThrow(
            errors.BadApiKeyError,
        );
    });
});
