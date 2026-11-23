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
        const configBody = await new Response(config.body as BodyInit).text();
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
                    extraction_ephemeral_template: { source: 'html' },
                    extraction_template: 'template',
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

    const error = await assertRejects(
        async () => {
            await client.extract(new ExtractionConfig({ body: html, content_type: 'text/html' }));
        },
        errors.BadApiKeyError
    );

    assertEquals(error.args.http_status_code, 401);
    fetchStub.restore();
});

Deno.test('extract: exposes the missing template error context', async () => {
    const KEY = '__API_KEY__';
    const client = new ScrapflyClient({ key: KEY });
    const html = 'very long html file';
    const code = 'ERR::EXTRACTION::TEMPLATE_NOT_FOUND';
    const envelope = {
        code,
        error_id: 'f0e9a6af-846a-49ab-8321-e21bb12bf494',
        http_code: 422,
        message: 'No published version for the requested template',
    };
    const fetchStub = stub(client, 'fetch', async (): Promise<Response> => {
        return responseFactory(envelope, {
            status: 422,
            headers: {
                'Content-Type': 'application/json',
            },
        });
    });

    const error = await assertRejects(
        async () => {
            await client.extract(new ExtractionConfig({
                body: html,
                content_type: 'text/html',
                extraction_template: 'missing-template',
            }));
        },
        errors.ExtractionApiError
    );

    assertEquals(error.args.code, code);
    assertEquals(error.args.http_status_code, 422);
    assertEquals(error.args.api_response, envelope);
    assertEquals(error.message, JSON.stringify(envelope));
    fetchStub.restore();
});

Deno.test('extract: exposes the wire status for an error without an error id', async () => {
    const client = new ScrapflyClient({ key: '__API_KEY__' });
    const envelope = { message: 'Not found', http_code: 422 };
    const fetchStub = stub(client, 'fetch', async (): Promise<Response> =>
        responseFactory(envelope, { status: 404 })
    );

    const error = await assertRejects(
        () => client.extract(new ExtractionConfig({ body: 'html', content_type: 'text/html' })),
        errors.ApiHttpClientError
    );

    assertEquals(error.constructor, errors.ApiHttpClientError);
    assertEquals(error.args.http_status_code, 404);
    assertEquals(error.args.api_response, envelope);
    assertEquals(error.message, JSON.stringify(envelope));
    fetchStub.restore();
});
