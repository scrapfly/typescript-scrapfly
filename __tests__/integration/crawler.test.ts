// Integration tests for the Crawler API against a real Scrapfly server.
//
// These tests run only when both `SCRAPFLY_API_KEY` and `SCRAPFLY_API_HOST` are
// set in the environment. They are skipped (with a console message) otherwise,
// so the unit-test suite stays fast and offline.
//
// Local development: point at the dev cluster:
//   export SCRAPFLY_API_KEY=scp-live-...
//   export SCRAPFLY_API_HOST=https://api.scrapfly.local
//   deno test --allow-net --allow-read --allow-env --unsafely-ignore-certificate-errors=api.scrapfly.local __tests__/integration/crawler.test.ts
//
// Note on the `/urls` endpoint: the server returns a streaming `text/plain`
// response (one URL per line for visited; `url,reason` for failed/skipped).
// JSON is intentionally NOT supported — the endpoint is designed to scale to
// millions of records per crawl where JSON would be too expensive. The SDK
// parses the text format directly via `CrawlerUrls.fromText()`.

import { ScrapflyClient } from '../../src/client.ts';
import { CrawlerConfig } from '../../src/crawlerconfig.ts';
import { Crawl } from '../../src/crawl.ts';
import {
  CrawlerArtifact,
  CrawlerSearchResponse,
  CrawlerStatus,
  CrawlerUrls,
  isSearchable,
} from '../../src/crawlerresult.ts';
import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';

const SCRAPFLY_KEY = Deno.env.get('SCRAPFLY_API_KEY');
const SCRAPFLY_HOST = Deno.env.get('SCRAPFLY_API_HOST') ?? 'https://api.scrapfly.local';

if (!SCRAPFLY_KEY) {
  console.log(
    'skipping crawler integration tests (set SCRAPFLY_API_KEY to enable; pointing at https://api.scrapfly.local by default)',
  );
} else {
  function makeClient(): ScrapflyClient {
    return new ScrapflyClient({ key: SCRAPFLY_KEY!, host: SCRAPFLY_HOST });
  }

  // Helper: start a small crawl and wait for it to finish.
  // Returns both the high-level Crawl wrapper and the underlying client so tests
  // can use either fluent API. Intentionally repeated per test rather than
  // memoized so each test owns its own UUID and can be debugged independently.
  async function startSmallCrawl(): Promise<{ client: ScrapflyClient; crawl: Crawl }> {
    const client = makeClient();
    const crawl = new Crawl(
      client,
      new CrawlerConfig({
        url: 'https://web-scraping.dev/products',
        page_limit: 2,
        max_duration: 30,
        content_formats: ['markdown'],
      }),
    );
    await crawl.start();
    await crawl.wait({ pollInterval: 2, maxWait: 60 });
    return { client, crawl };
  }

  Deno.test('integration: client can talk to api.scrapfly.local', async () => {
    // Sanity check — the URL host override works and the cluster is reachable.
    const client = makeClient();
    assertEquals(client.HOST, SCRAPFLY_HOST.replace(/\/+$/, ''));
  });

  Deno.test('integration: full crawler lifecycle (start → wait → status)', async () => {
    const { crawl } = await startSmallCrawl();
    assert(crawl.started);
    assert(crawl.uuid);

    const status = await crawl.status(true);
    assert(status instanceof CrawlerStatus);
    assertEquals(status.status, 'DONE');
    assertEquals(status.is_finished, true);
    assertEquals(status.is_success, true);
    assertEquals(status.isComplete, true);
    assert(status.state.urls_visited >= 1, 'expected at least one visited URL');
    // Once the crawler reaches DONE, start_time and stop_time are both populated
    // (they are nullable only while PENDING / still running — see the docs).
    assert(typeof status.state.start_time === 'number', 'start_time should be set once DONE');
    assert(typeof status.state.stop_time === 'number', 'stop_time should be set once DONE');
    assert(typeof status.state.duration === 'number');
    assert(status.state.stop_reason !== null, 'stop_reason should be set once DONE');
  });

  Deno.test('integration: crawlContents in JSON mode returns content map', async () => {
    const { client, crawl } = await startSmallCrawl();
    const result = await client.crawlContents(crawl.uuid!, { format: 'markdown' });
    assert(typeof result === 'object', 'expected CrawlerContents object in JSON mode');
    if (typeof result === 'object' && 'contents' in result) {
      const urls = Object.keys(result.contents);
      assert(urls.length >= 1, 'expected at least one crawled URL with content');
    }
  });

  Deno.test('integration: crawlContents in plain mode returns string for the seed URL', async () => {
    const { crawl } = await startSmallCrawl();
    // The seed URL is always visited, so we can read it back without having to
    // first list all visited URLs. (The /urls endpoint is currently server-side
    // text-only, see the conditional test below.)
    const seedUrl = 'https://web-scraping.dev/products';
    const md = await crawl.read(seedUrl, 'markdown');
    if (md === null) {
      throw new Error(`expected non-null markdown content for seed URL ${seedUrl}`);
    }
    assertEquals(typeof md, 'string');
    assert(md.length > 0, 'expected non-empty markdown body');
  });

  Deno.test('integration: crawlArtifact (warc) returns non-empty bytes', async () => {
    const { crawl } = await startSmallCrawl();
    const artifact = await crawl.warc();
    assert(artifact instanceof CrawlerArtifact);
    assertEquals(artifact.type, 'warc');
    assert(artifact.data.byteLength > 0, 'expected non-empty WARC artifact bytes');
  });

  Deno.test('integration: cancel a long-running crawl transitions to CANCELLED', async () => {
    const client = makeClient();
    // Use a long max_duration so the crawl is still running when we cancel it.
    const crawl = new Crawl(
      client,
      new CrawlerConfig({
        url: 'https://web-scraping.dev/products',
        page_limit: 1000,
        max_duration: 600,
      }),
    );
    await crawl.start();
    const cancelled = await crawl.cancel();
    assertEquals(cancelled, true);

    // Give the engine a moment to flush the cancellation, then verify the
    // terminal state matches expectations.
    await new Promise((r) => setTimeout(r, 2000));
    const status = await crawl.status(true);
    assertEquals(status.status, 'CANCELLED');
    assertEquals(status.state.stop_reason, 'user_cancelled');
  });

  Deno.test('integration: crawlUrls returns a CrawlerUrls from streaming text', async () => {
    // The server currently returns the streaming text response with an empty
    // body for successful but short crawls (separate known issue). This test
    // verifies the SDK parses whatever the server sends into a valid
    // CrawlerUrls instance — zero records is a legitimate outcome for an
    // "empty" page. When the server bug is fixed, this test will start
    // asserting on real content without needing any SDK changes.
    const { crawl } = await startSmallCrawl();
    const urls = await crawl.urls({ status: 'visited', per_page: 50 });
    assert(urls instanceof CrawlerUrls);
    assertEquals(urls.page, 1);
    assertEquals(urls.per_page, 50);
    assert(Array.isArray(urls.urls));
    // Every parsed record (if any) should have a URL tagged with the requested status.
    for (const entry of urls.urls) {
      assert(typeof entry.url === 'string' && entry.url.length > 0);
      assertEquals(entry.status, 'visited');
    }
  });

  // Helper: start a crawl with the search index on and wait for the index to
  // leave BUILDING. The index is published after the crawl's own terminal
  // status, so a crawl that just finished is not yet searchable.
  async function startSearchCrawl(): Promise<{ client: ScrapflyClient; crawl: Crawl }> {
    const client = makeClient();
    const crawl = new Crawl(
      client,
      new CrawlerConfig({
        url: 'https://web-scraping.dev/products',
        page_limit: 3,
        max_duration: 60,
        content_formats: ['markdown'],
        search: true,
      }),
    );
    await crawl.start();
    await crawl.wait({ pollInterval: 2, maxWait: 120 });

    const deadline = Date.now() + 120_000;
    for (;;) {
      const status = await crawl.status(true);
      assert(status.search !== null, 'a crawl started with search:true must report a search block');
      if (status.search!.status !== 'BUILDING' || Date.now() > deadline) break;
      await new Promise((resolve) => setTimeout(resolve, 3000));
    }
    return { client, crawl };
  }

  Deno.test('integration: search=true publishes an index reported on /status', async () => {
    const { crawl } = await startSearchCrawl();
    const status = await crawl.status(true);
    assert(isSearchable(status.search), `index never became searchable: ${JSON.stringify(status.search)}`);
    assert((status.search!.vectors ?? 0) >= 1, 'index published with no vectors');
  });

  Deno.test('integration: crawlSearch returns ranked chunks from the crawl', async () => {
    const { crawl } = await startSearchCrawl();
    const res = await crawl.search('product', { limit: 5 });
    assert(res instanceof CrawlerSearchResponse);
    assert(res.results.length > 0, `no results: ${JSON.stringify(res.skipped)}`);
    const hit = res.results[0];
    assertEquals(hit.rank, 1);
    assertEquals(hit.crawler_uuid, crawl.uuid);
    assert(hit.url.length > 0);
    assert(hit.text.length > 0);
  });

  Deno.test('integration: crawlPrompt streams source, token and done frames', async () => {
    const { crawl } = await startSearchCrawl();
    let answer = '';
    let done = false;
    for await (const ev of crawl.prompt('What does this website sell?')) {
      if (ev.event === 'token') answer += ev.data;
      if (ev.event === 'done') done = true;
    }
    assert(done, 'stream ended without a done frame');
    assert(answer.length > 0, 'no tokens streamed');
  });
}
