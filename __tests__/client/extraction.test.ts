import * as errors from '../../src/errors.ts';
import { ScrapflyClient } from '../../src/client.ts';
import { ExtractionConfig } from '../../src/extractionconfig.ts';
import { assertEquals, assertRejects } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { stub } from "https://deno.land/std@0.224.0/testing/mock.ts";
import { responseFactory } from '../utils.ts';
import type { RequestOptions } from '../../src/utils.ts';

Deno.test('extract: succeeds', async () => {
    const KEY = '__API_KEY__';
    const client = new ScrapflyClient({ key: KEY });
    const html = 'very long html file';
    const fetchStub = stub(client, 'fetch', async (config: RequestOptions): Promise<Response> => {
        const configUrl = new URL(config.url);
        const configBody = await new Response(config.body).text();
        assertEquals(configUrl.origin + configUrl.pathname, client.HOST + '/extraction');
        assertEquals(config.method, 'POST');
        assertEquals(configUrl.searchParams.get('key'), KEY);
        assertEquals(configBody, html);
        const body = { data: 'a document summary', content_type: 'text/html' };
        return responseFactory(body, { status: 200 });
    });

    const result = await client.extract(new ExtractionConfig({ body: html, content_type: 'text/html' }));
    assertEquals(result.content_type, 'text/html');
    assertEquals(result.data, 'a document summary');
    assertEquals(fetchStub.calls.length, 1);

    fetchStub.restore();
});

Deno.test('extract: fails due to invalid config', async () => {
    const KEY = '__API_KEY__';
    const client = new ScrapflyClient({ key: KEY });
    const html = 'very long html file';
    await assertRejects(
        async () => {
            await client.extract(
                new ExtractionConfig({
                    body: html,
                    content_type: 'text/html',
                    ephemeral_template: { source: 'html' },
                    template: 'template',
                }),
            );
        },
        errors.ExtractionConfigError
    );
});

Deno.test('extract: fails due to invalid API key', async () => {
    const KEY = '__API_KEY__';
    const client = new ScrapflyClient({ key: KEY });
    const html = 'very long html file';
    const fetchStub = stub(client, 'fetch', async (config: RequestOptions): Promise<Response> => {
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

    await assertRejects(
        async () => {
            await client.extract(new ExtractionConfig({ body: html, content_type: 'text/html' }));
        },
        errors.BadApiKeyError
    );

    fetchStub.restore();
});

Deno.test('extract: fails due to any extraction related error', async () => {
    const KEY = '__API_KEY__';
    const client = new ScrapflyClient({ key: KEY });
    const html = 'very long html file';
    const fetchStub = stub(client, 'fetch', async (config: RequestOptions): Promise<Response> => {
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

    await assertRejects(
        async () => {
            await client.extract(new ExtractionConfig({ body: html, content_type: 'text/html' }));
        },
        errors.ExtractionApiError
    );

    fetchStub.restore();
});
