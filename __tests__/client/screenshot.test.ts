import * as errors from '../../src/errors.js';
import { ScrapflyClient } from '../../src/client.js';
import { ScreenshotConfig } from '../../src/screenshotconfig.js';
import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { mockedStream, responseFactory } from '../utils.js';

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
        expect(result.metadata.extension_name).toBe('png');
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
