// Use msgpack wire encoding for per-part bodies in a batch.
//
// Msgpack produces slightly smaller payloads than JSON and decodes faster.
// Pass { format: 'msgpack' } to scrapeBatch to opt in — the SDK handles
// decoding transparently.

import { ScrapflyClient, ScrapeConfig, errors } from 'scrapfly-sdk';

const client = new ScrapflyClient({ key: process.env.SCRAPFLY_API_KEY });

const configs = [
  new ScrapeConfig({ url: 'https://web-scraping.dev/product/1', correlation_id: 'product-1' }),
  new ScrapeConfig({ url: 'https://web-scraping.dev/product/2', correlation_id: 'product-2' }),
];

for await (const [correlationId, result] of client.scrapeBatch(configs, { format: 'msgpack' })) {
  if (result instanceof errors.ScrapflyError) {
    console.error(`${correlationId}: error ${result.code}`);
    continue;
  }
  if (result instanceof Response) continue;
  console.log(`${correlationId}: status=${result.result.status_code}`);
}
