import * as errors from '../../src/errors.ts';
import { ScrapflyClient } from '../../src/client.ts';
import { ScrapeConfig } from '../../src/scrapeconfig.ts';
import type { ScrapeResult } from '../../src/result.ts';
import { assertEquals, assertRejects } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { resultFactory, responseFactory } from '../utils.ts';
import type { RequestOptions } from '../../src/utils.ts';
import { stub } from "https://deno.land/std/testing/mock.ts";

const KEY = '__API_KEY__';

function largeObjectClient(format: 'clob' | 'blob', contentUrl: string, reply: (url: URL) => Response) {
    const client = new ScrapflyClient({ key: KEY });
    const seen: URL[] = [];
    const fetchStub = stub(client, 'fetch', async (config: RequestOptions): Promise<Response> => {
        const url = new URL(config.url);
        seen.push(url);
        if (url.pathname === '/scrape') {
            const result = resultFactory({ url: 'https://web-scraping.dev/product/1' });
            result.data.result.format = format;
            result.data.result.content = contentUrl;
            return responseFactory(result.data, { status: 200, headers: { 'Content-Type': 'application/json' } });
        }
        return reply(url);
    });
    return { client, seen, fetchStub };
}

Deno.test('large object: a JSON clob is its text', async () => {
    const page = '{"products": [{"id": 1}]}';
    const { client, fetchStub } = largeObjectClient('clob', 'https://api.scrapfly.io/scrape/large_object/01', () =>
        new Response(page, { status: 200, headers: { 'Content-Type': 'application/json; charset=utf-8' } }));

    const result = await client.scrape(new ScrapeConfig({ url: 'https://web-scraping.dev/product/1' })) as ScrapeResult;

    assertEquals(result.result.content, page);
    assertEquals(result.result.format, 'text');
    fetchStub.restore();
});

Deno.test('large object: an error status raises instead of being returned as the page', async () => {
    for (const format of ['clob', 'blob'] as const) {
        const { client, fetchStub } = largeObjectClient(format, 'https://api.scrapfly.io/scrape/large_object/01', () =>
            responseFactory(
                { reason: 'Not Found', message: 'Large Object 01 not found', error_id: '01', http_code: 404 },
                { status: 404, headers: { 'Content-Type': 'application/json' } },
            ));

        await assertRejects(
            () => client.scrape(new ScrapeConfig({ url: 'https://web-scraping.dev/product/1' })),
            errors.ApiHttpClientError,
            'Large Object 01 not found',
        );
        fetchStub.restore();
    }
});

Deno.test('large object: an error answer that is not an API error raises with its status', async () => {
    for (const body of ['null', '<html>' + 'x'.repeat(2000) + '</html>']) {
        const { client, fetchStub } = largeObjectClient('clob', 'https://api.scrapfly.io/scrape/large_object/01', () =>
            new Response(body, { status: 404, headers: { 'Content-Type': 'text/html' } }));

        const error = await assertRejects(
            () => client.scrape(new ScrapeConfig({ url: 'https://web-scraping.dev/product/1' })),
            errors.ApiHttpClientError,
        );
        assertEquals((error as errors.ApiHttpClientError).message.length <= 500, true);
        fetchStub.restore();
    }
});

Deno.test('large object: the key is added to the query of its URL', async () => {
    const { client, seen, fetchStub } = largeObjectClient('clob', 'https://api.scrapfly.io/scrape/large_object/01?part=2', () =>
        new Response('large text', { status: 200, headers: { 'Content-Type': 'text/plain' } }));

    await client.scrape(new ScrapeConfig({ url: 'https://web-scraping.dev/product/1' }));

    assertEquals(seen[1].searchParams.get('part'), '2');
    assertEquals(seen[1].searchParams.get('key'), KEY);
    fetchStub.restore();
});
