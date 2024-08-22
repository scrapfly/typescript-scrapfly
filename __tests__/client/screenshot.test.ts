import * as errors from '../../src/errors.ts';
import { ScrapflyClient } from '../../src/client.ts';
import { ScreenshotConfig } from '../../src/screenshotconfig.ts';
import { assertEquals, assertRejects } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { stub } from "https://deno.land/std/testing/mock.ts";
import type { RequestOptions } from '../../src/utils.ts';
import { mockedStream, responseFactory } from '../utils.ts';
import { ScreenshotResult } from '../../src/result.ts';

Deno.test('screenshot: succeeds', async () => {
    const KEY = '__API_KEY__';
    const client = new ScrapflyClient({ key: KEY });
    const url = 'https://web-scraping.dev/';
    const fetchStub = stub(client, 'fetch', async (config: RequestOptions): Promise<Response> => {
        const configUrl = new URL(config.url);
        // Ensure the URL matches the pattern
        assertEquals(configUrl.origin + configUrl.pathname, client.HOST + '/screenshot');
        assertEquals(config.method, 'GET');
        assertEquals(configUrl.searchParams.get('key'), KEY);
        assertEquals(configUrl.searchParams.get('url'), url);
        assertEquals(Array.from((configUrl.searchParams as any).keys()), ['key', 'url']);
        const body = mockedStream();
        return responseFactory(body, {
            status: 200,
            headers: {
                'content-encoding': 'gzip',
                'ContEnT-TyPe': 'image/png',  // ensure case insensitivity
                'x-scrapfly-upstream-http-code': '200',
                'x-scrapfly-upstream-url': url,
            },
        });
    });

    const result = await client.screenshot(new ScreenshotConfig({ url: url }));
    assertEquals(result.metadata.extension_name, 'png');
    assertEquals(result.metadata.upstream_url, url);
    assertEquals(result.metadata.upstream_status_code, 200);
    assertEquals(fetchStub.calls.length, 1);

    fetchStub.restore();
});

Deno.test('screenshot: fails due to failing upstream response', async () => {
    const KEY = '__API_KEY__';
    const client = new ScrapflyClient({ key: KEY });
    const url = 'https://domain.com/down-page/';
    const fetchStub = stub(client, 'fetch', async (config: RequestOptions): Promise<Response> => {
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

    await assertRejects(
        async () => {
            await client.screenshot(new ScreenshotConfig({ url }));
        },
        errors.ScreenshotApiError,
    );

    assertEquals(fetchStub.calls.length, 1);

    fetchStub.restore();
});

Deno.test('screenshot: fails to non html/text web page', async () => {
    const KEY = '__API_KEY__';
    const client = new ScrapflyClient({ key: KEY });
    const url = 'https://web-scraping.dev/assets/pdf/eula.pdf/';
    const fetchStub = stub(client, 'fetch', async (config: RequestOptions): Promise<Response> => {
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

    await assertRejects(
        async () => {
            await client.screenshot(new ScreenshotConfig({ url }));
        },
        errors.ScreenshotApiError
    );

    assertEquals(fetchStub.calls.length, 1);

    fetchStub.restore();
});