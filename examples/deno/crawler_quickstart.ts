// Quickstart for the Crawler API.
//
// Run with:
//   SCRAPFLY_API_KEY=scp-live-... \
//     deno run --allow-net --allow-read --allow-env examples/deno/crawler_quickstart.ts
//
// To target a local self-hosted dev cluster instead of api.scrapfly.io:
//   SCRAPFLY_API_KEY=scp-live-... \
//   SCRAPFLY_API_HOST=https://api.scrapfly.local \
//     deno run --allow-net --allow-read --allow-env --unsafely-ignore-certificate-errors=api.scrapfly.local examples/deno/crawler_quickstart.ts
//
// What this example does:
//   1. Schedules a small crawl of https://web-scraping.dev/products
//   2. Polls the status until the crawl finishes
//   3. Prints summary metrics
//   4. Reads back the markdown content of the seed URL via the `plain` mode
//   5. Downloads the WARC artifact and reports its size

import { Crawl, CrawlerConfig, ScrapflyClient } from '../../src/main.ts';

const KEY = Deno.env.get('SCRAPFLY_API_KEY');
if (!KEY) {
  console.error('SCRAPFLY_API_KEY env var is required');
  Deno.exit(1);
}
const HOST = Deno.env.get('SCRAPFLY_API_HOST');

const client = new ScrapflyClient({ key: KEY, ...(HOST ? { host: HOST } : {}) });

const crawl = new Crawl(
  client,
  new CrawlerConfig({
    url: 'https://web-scraping.dev/products',
    page_limit: 5,
    max_duration: 60,
    content_formats: ['markdown'],
  }),
);

console.log('🕷  scheduling crawl...');
await crawl.start();
console.log(`   uuid=${crawl.uuid}`);

console.log('⏳ waiting for completion (poll every 2s)...');
await crawl.wait({ pollInterval: 2, maxWait: 120, verbose: true });

const status = await crawl.status();
console.log('✅ crawl finished');
console.log(`   status=${status.status}  is_success=${status.is_success}`);
console.log(`   visited=${status.state.urls_visited}/${status.state.urls_extracted}`);
console.log(`   credits_used=${status.state.api_credit_used}  duration=${status.state.duration}s`);
console.log(`   stop_reason=${status.state.stop_reason}`);

console.log('\n📄 reading the seed URL as markdown (plain mode)...');
const md = await crawl.read('https://web-scraping.dev/products', 'markdown');
console.log(`   markdown length=${md?.length ?? 0} chars`);
console.log(`   first 200 chars: ${(md ?? '').slice(0, 200).replace(/\n/g, ' ')}`);

console.log('\n📦 downloading WARC artifact...');
const warc = await crawl.warc();
console.log(`   warc bytes=${warc.data.byteLength}`);
console.log('   (use a library like `warcio` on npm to parse the records)');

console.log('\n🎉 done');
