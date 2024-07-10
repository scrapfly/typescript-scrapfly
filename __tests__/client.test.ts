import * as errors from '../src/errors.js';
import { ScrapflyClient } from '../src/client.js';
import { ScrapeConfig } from '../src/scrapeconfig.js';
import { ScreenshotConfig } from '../src/screenshotconfig.js';
import { ExtractionConfig } from '../src/extractionconfig.js';
import { describe, it, expect, beforeEach, jest } from '@jest/globals';

function mockedStream() {
    const mockStream = {
        locked: false,
        state: 'readable',
        supportsBYOB: false,
        getReader() {
            return {
                read() {
                    return Promise.resolve({ done: true, value: null });
                },
                cancel() {
                    return Promise.resolve();
                },
            };
        },
    };
    return mockStream;
}

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
                log_url: '123',
            },
            config: { url: params.url ?? 'https://httpbin.dev/json' },
            context: { asp: false },
            uuid: '1234',
        },
    };
}

function responseFactory(body: any, init?: ResponseInit): Response {
    const text = JSON.stringify(body);
    const response = new Response(text, init);
    (response as any).json = async () => JSON.parse(text);
    return response;
}

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

describe('screenshot', () => {
    const KEY = '__API_KEY__';
    const client = new ScrapflyClient({ key: KEY });

    beforeEach(() => {
        jest.spyOn(client, 'fetch').mockClear(); // clear all mock meta on each test
    });

it('succeeds', async () => {
    const spy = jest.spyOn(client, 'fetch');
    const url = 'https://web-scraping.dev/';
    jest.spyOn(client, 'fetch').mockImplementation(async (config: Request): Promise<any> => {
        const configUrl = config[Object.getOwnPropertySymbols(config)[1]].url;
        // Ensure the URL matches the pattern
        expect(configUrl.origin + configUrl.pathname).toEqual(client.HOST + '/screenshot');
        expect(config.method).toEqual('GET');
        expect(configUrl.searchParams.get('key')).toMatch(KEY);
        expect(configUrl.searchParams.get('url')).toMatch(url);
        expect(Array.from(configUrl.searchParams.keys())).toEqual(['key', 'url']);
        const body = mockedStream();
        return responseFactory(body, {
            status: 200,
            headers: {
                'content-encoding': 'gzip',
                'content-type': 'image/png',
                'x-scrapfly-upstream-http-code': '200',
                'x-scrapfly-upstream-url': url,
            },
        });
    });

        const result = await client.screenshot(new ScreenshotConfig({ url: url }));
        expect(result).toBeDefined();
        expect(result.metadata.format).toBe('png');
        expect(result.metadata.upstream_url).toEqual(url);
        expect(result.metadata.upstream_status_code).toBe(200);
        expect(spy).toHaveBeenCalledTimes(1);
    });

    it('fails due to failing upstream response', async () => {
        const spy = jest.spyOn(client, 'fetch');
        const url = 'https://domain.com/down-page/';
        jest.spyOn(client, 'fetch').mockImplementation(async (): Promise<any> => {
            const body = {
                code: 'ERR::SCREENSHOT::UNABLE_TO_TAKE_SCREENSHOT',
                error_id: '347bc6cb-1cba-467a-bd06-c932a9e7156d',
                http_code: 422,
            };
            return responseFactory(body, {
                status: 422,
                headers: {
                    'content-type': 'application/json; charset=utf-8',
                },
            });
        });
        await expect(client.screenshot(new ScreenshotConfig({ url }))).rejects.toThrow(errors.ScreenshotApiError);
        expect(spy).toHaveBeenCalledTimes(1);
    });

    it('fails to non html/text web page', async () => {
        const spy = jest.spyOn(client, 'fetch');
        const url = 'https://web-scraping.dev/assets/pdf/eula.pdf/';
        jest.spyOn(client, 'fetch').mockImplementation(async (): Promise<any> => {
            const body = {
                code: 'ERR::SCREENSHOT::INVALID_CONTENT_TYPE',
                error_id: 'f0e9a6af-846a-49ab-8321-e21bb12bf494',
                http_code: 422,
            };
            return responseFactory(body, {
                status: 422,
                headers: {
                    'content-type': 'application/json; charset=utf-8',
                },
            });
        });
        await expect(client.screenshot(new ScreenshotConfig({ url }))).rejects.toThrow(errors.ScreenshotApiError);
        expect(spy).toHaveBeenCalledTimes(1);
    });
});

describe('extract', () => {
    const KEY = '__API_KEY__';
    const client = new ScrapflyClient({ key: KEY });

    beforeEach(() => {
        jest.spyOn(client, 'fetch').mockClear(); // clear all mock meta on each test
    });

    it('succeeds', async () => {
        const spy = jest.spyOn(client, 'fetch');
        const html = 'very long html file';
        jest.spyOn(client, 'fetch').mockImplementation(async (config: Request): Promise<any> => {
            const configUrl = config[Object.getOwnPropertySymbols(config)[1]].url;
            const configBody = config[Object.getOwnPropertySymbols(config)[1]].body.source;
            // Ensure the URL matches the pattern
            expect(configUrl.origin + configUrl.pathname).toEqual(client.HOST + '/extraction');
            expect(config.method).toEqual('POST');
            expect(configUrl.searchParams.get('key')).toMatch(KEY);
            expect(configBody).toEqual(html);
            const body = { data: 'a document summary', content_type: 'text/html' };
            return responseFactory(body, {
                status: 200,
            });
        });

        const result = await client.extract(new ExtractionConfig({ body: html, content_type: 'text/html' }));
        expect(result).toBeDefined();
        expect(result.content_type).toBe('text/html');
        expect(result.data).toBe('a document summary');
        expect(spy).toHaveBeenCalledTimes(1);
    });

    it('fails due to failing to invalid config', async () => {
        const html = 'very long html file';
        await expect(
            client.extract(
                new ExtractionConfig({
                    body: html,
                    content_type: 'text/html',
                    epehemeral_template: { source: 'html' },
                    template: 'template',
                }),
            ),
        ).rejects.toThrow(errors.ExtractionConfigError);
    });

    it('fails to invalid API key', async () => {
        const html = 'very long html file';
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
        await expect(client.extract(new ExtractionConfig({ body: html, content_type: 'text/html' }))).rejects.toThrow(
            errors.BadApiKeyError,
        );
    });

    it('fails to any extraction related error', async () => {
        const html = 'very long html file';
        jest.spyOn(client, 'fetch').mockImplementation(async (): Promise<any> => {
            const result = {
                code: 'ERR::EXTRACTION::CONTENT_TYPE_NOT_SUPPORTED',
                error_id: 'f0e9a6af-846a-49ab-8321-e21bb12bf494',
                http_code: 422,
                links: {
                    'Related Error Doc':
                        'https://scrapfly.io/docs/extraction-api/error/ERR::EXTRACTION::CONTENT_TYPE_NOT_SUPPORTED',
                },
                message: 'ERR::EXTRACTION::CONTENT_TYPE_NOT_SUPPORTED',
            };
            return responseFactory(result, {
                status: 422,
                headers: {
                    'Content-Type': 'application/json',
                },
            });
        });
        await expect(client.extract(new ExtractionConfig({ body: html, content_type: 'text/html' }))).rejects.toThrow(
            errors.ExtractionApiError,
        );
    });
});
