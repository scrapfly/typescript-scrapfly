// Mix proxified and JSON-envelope scrapes in a single batch.
//
// A config with proxified_response=true returns the raw upstream response
// (HTML, JSON, binary, etc.) instead of Scrapfly's JSON envelope. In a
// batch, proxified parts surface as a native fetch Response while normal
// parts surface as a ScrapeResult.

import { ScrapflyClient, ScrapeConfig, errors } from 'scrapfly-sdk';

const client = new ScrapflyClient({ key: process.env.SCRAPFLY_API_KEY });

const configs = [
  // Proxified: raw upstream HTML + upstream headers + X-Scrapfly-* metadata.
  new ScrapeConfig({
    url: 'https://web-scraping.dev/product/1',
    correlation_id: 'html',
    proxified_response: true,
  }),
  // Normal: Scrapfly JSON envelope with config, context, result.
  new ScrapeConfig({ url: 'https://web-scraping.dev/api/products', correlation_id: 'api' }),
];

for await (const [correlationId, result] of client.scrapeBatch(configs)) {
  if (result instanceof errors.ScrapflyError) {
    console.error(`${correlationId}: error ${result}`);
    continue;
  }
  if (result instanceof Response) {
    const body = await result.text();
    console.log(
      `${correlationId}: proxified status=${result.status} content-type=${result.headers.get('content-type')} body=${body.length} bytes`,
    );
  } else {
    console.log(`${correlationId}: scrape status=${result.result.status_code}`);
  }
}
