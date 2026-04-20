// Scrape multiple URLs in a single request using the Batch Scraping API.
//
// scrapeBatch accepts up to 100 ScrapeConfigs and streams each result as
// soon as it's ready. Results arrive OUT OF ORDER — use correlation_id on
// every config to match each result back to its originating request.

import { ScrapflyClient, ScrapeConfig, errors, ScrapeResult } from 'scrapfly-sdk';

const client = new ScrapflyClient({ key: process.env.SCRAPFLY_API_KEY });

// Every config in a batch MUST carry a unique correlation_id.
const configs = [
  new ScrapeConfig({ url: 'https://web-scraping.dev/product/1', correlation_id: 'product-1' }),
  new ScrapeConfig({ url: 'https://web-scraping.dev/product/2', correlation_id: 'product-2' }),
  new ScrapeConfig({ url: 'https://web-scraping.dev/product/3', correlation_id: 'product-3' }),
];

for await (const [correlationId, result] of client.scrapeBatch(configs)) {
  if (result instanceof errors.ScrapflyError) {
    console.error(`${correlationId}: error ${result.code}`);
    continue;
  }
  if (result instanceof Response) {
    // Proxified: raw upstream response (not reached in this example).
    console.log(`${correlationId}: proxified status=${result.status}`);
    continue;
  }
  // Standard ScrapeResult.
  console.log(`${correlationId}: status=${result.result.status_code} size=${result.result.content.length} bytes`);
}
