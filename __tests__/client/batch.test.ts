import { ScrapflyClient } from '../../src/client.ts';
import { ScrapeConfig } from '../../src/scrapeconfig.ts';
import type { RequestOptions } from '../../src/utils.ts';
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { stub } from "https://deno.land/std/testing/mock.ts";

Deno.test('scrapeBatch: each config carries its method and body', async () => {
    const client = new ScrapflyClient({ key: '__API_KEY__' });
    let sent: Record<string, unknown>[] = [];
    const part = (id: string) => {
        const body = JSON.stringify({
            config: { url: 'https://web-scraping.dev/' },
            context: {},
            result: { status: 'DONE', success: true, status_code: 200, content: id, format: 'text' },
        });
        return `--b0und\r\nContent-Type: application/json\r\nX-Scrapfly-Correlation-Id: ${id}\r\nContent-Length: ${body.length}\r\n\r\n${body}\r\n`;
    };
    const fetchStub = stub(client, 'fetch', async (config: RequestOptions): Promise<Response> => {
        sent = JSON.parse(config.body as string).configs;
        return new Response(part('post') + part('get') + '--b0und--\r\n', {
            status: 200,
            headers: { 'Content-Type': 'multipart/mixed; boundary=b0und' },
        });
    });

    const configs = [
        new ScrapeConfig({ url: 'https://web-scraping.dev/api', method: 'POST', body: '{"q":1}', headers: { 'content-type': 'application/json' }, correlation_id: 'post' }),
        new ScrapeConfig({ url: 'https://web-scraping.dev/page', correlation_id: 'get' }),
    ];
    for await (const _ of client.scrapeBatch(configs)) {
        // drained
    }
    fetchStub.restore();

    assertEquals([sent[0].method, sent[0].body], ['POST', '{"q":1}']);
    assertEquals(sent[1].method, 'GET');
    assertEquals('body' in sent[1], false);
});
