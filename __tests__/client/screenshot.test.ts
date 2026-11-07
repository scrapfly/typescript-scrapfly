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

const ENQUEUED = { success: true, webhook_enqueued: true, job_uuid: 'job-1', log_uuid: 'log-1', webhook_name: 'my-webhook' };

function webhookScreenshot(status: number, contentType: string, body: unknown) {
    const client = new ScrapflyClient({ key: '__API_KEY__' });
    const fetchStub = stub(client, 'fetch', async (): Promise<Response> => {
        return responseFactory(body, { status, headers: { 'content-type': contentType } });
    });
    const answer = client.screenshot(new ScreenshotConfig({ url: 'https://web-scraping.dev/product/1', webhook: 'my-webhook' }));
    return { client, answer: answer.finally(() => fetchStub.restore()) };
}

Deno.test('screenshot: enqueued for a webhook returns its job and no image', async () => {
    const result = await webhookScreenshot(201, 'application/json; charset=utf-8', ENQUEUED).answer;

    assertEquals(result.job_uuid, 'job-1');
    assertEquals(result.image.byteLength, 0);
    assertEquals(result.metadata, { extension_name: '', upstream_status_code: 0, upstream_url: '' });
});

Deno.test('screenshot: saving one enqueued for a webhook is refused', async () => {
    const { client, answer } = webhookScreenshot(201, 'application/json', ENQUEUED);
    const result = await answer;

    await assertRejects(() => client.saveScreenshot(result, 'shot'), Error, 'does not exist');
});

Deno.test('screenshot: any other 201 is an error', async () => {
    const bodies = [{ success: true }, { webhook_enqueued: false, job_uuid: 'job-1' }, { webhook_enqueued: true }, { webhook_enqueued: true, job_uuid: '' }];
    for (const body of bodies) {
        await assertRejects(() => webhookScreenshot(201, 'application/json', body).answer, errors.ScreenshotApiError);
    }
});

Deno.test('screenshot: the 201 of a webhook is read whatever its content type', async () => {
    const result = await webhookScreenshot(201, 'text/plain', ENQUEUED).answer;

    assertEquals(result.job_uuid, 'job-1');
    assertEquals(result.image.byteLength, 0);
});

Deno.test('screenshot: JSON answered with a 200 is an error', async () => {
    await assertRejects(() => webhookScreenshot(200, 'application/json', { success: true }).answer, errors.ScreenshotApiError);
});

Deno.test('screenshot: a 401 answered with a charset is a bad API key', async () => {
    await assertRejects(() => webhookScreenshot(401, 'application/json; charset=utf-8', { code: 'ERR::AUTH::INVALID_KEY', http_code: 401 }).answer, errors.BadApiKeyError);
});

Deno.test('screenshot: a 401 whose body is not JSON is a bad API key', async () => {
    const client = new ScrapflyClient({ key: '__API_KEY__' });
    const fetchStub = stub(client, 'fetch', async (): Promise<Response> => {
        return new Response('<html>401</html>', { status: 401, headers: { 'content-type': 'application/json' } });
    });

    await assertRejects(() => client.screenshot(new ScreenshotConfig({ url: 'https://web-scraping.dev/product/1' })), errors.BadApiKeyError, '<html>401</html>');
    fetchStub.restore();
});

Deno.test('screenshot: an empty error body says its status', async () => {
    for (const [status, contentType] of [[201, 'application/json'], [502, 'application/json'], [502, 'text/html']] as const) {
        const client = new ScrapflyClient({ key: '__API_KEY__' });
        const fetchStub = stub(client, 'fetch', async (): Promise<Response> => {
            return new Response('', { status, headers: { 'content-type': contentType } });
        });

        await assertRejects(() => client.screenshot(new ScreenshotConfig({ url: 'https://web-scraping.dev/product/1' })), errors.ScreenshotApiError, `API returned status ${status}`);
        fetchStub.restore();
    }
});

Deno.test('screenshot: an error body that is not JSON under a JSON content type is a screenshot error', async () => {
    const client = new ScrapflyClient({ key: '__API_KEY__' });
    const fetchStub = stub(client, 'fetch', async (): Promise<Response> => {
        return new Response('upstream gone', { status: 502, headers: { 'content-type': 'application/json; charset=utf-8' } });
    });

    await assertRejects(() => client.screenshot(new ScreenshotConfig({ url: 'https://web-scraping.dev/product/1' })), errors.ScreenshotApiError, 'upstream gone');
    fetchStub.restore();
});

Deno.test('screenshot: an image has no job', async () => {
    const client = new ScrapflyClient({ key: '__API_KEY__' });
    const fetchStub = stub(client, 'fetch', async (): Promise<Response> => {
        return responseFactory(mockedStream(), { status: 200, headers: { 'content-type': 'image/png', 'x-scrapfly-upstream-http-code': '200' } });
    });

    const result = await client.screenshot(new ScreenshotConfig({ url: 'https://web-scraping.dev/product/1' }));

    assertEquals(result.job_uuid, null);
    assertEquals(result.metadata.extension_name, 'png');
    assertEquals(result.metadata.upstream_status_code, 200);
    fetchStub.restore();
});
