import * as errors from '../../src/errors.ts';
import { ScrapflyClient } from '../../src/client.ts';
import { CrawlerConfig } from '../../src/crawlerconfig.ts';
import { CrawlerArtifact, CrawlerContents, CrawlerStatus, CrawlerUrls } from '../../src/crawlerresult.ts';
import { assert, assertEquals, assertRejects } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { stub } from 'https://deno.land/std@0.224.0/testing/mock.ts';
import { responseFactory } from '../utils.ts';
import type { RequestOptions } from '../../src/utils.ts';

// ----- crawl() -------------------------------------------------------------

Deno.test('crawl: POST /crawl with JSON body, returns uuid', async () => {
  const KEY = '__API_KEY__';
  const client = new ScrapflyClient({ key: KEY });

  const fetchStub = stub(client, 'fetch', async (config: RequestOptions): Promise<Response> => {
    const configUrl = new URL(config.url);
    assertEquals(configUrl.origin + configUrl.pathname, client.HOST + '/crawl');
    assertEquals(config.method, 'POST');
    assertEquals(configUrl.searchParams.get('key'), KEY);
    const body = JSON.parse(config.body as string);
    assertEquals(body.url, 'https://web-scraping.dev/products');
    assertEquals(body.page_limit, 5);
    return responseFactory(
      { uuid: 'abc-123', status: 'PENDING' },
      { status: 201, headers: { 'Content-Type': 'application/json' } },
    );
  });

  const result = await client.crawl(
    new CrawlerConfig({ url: 'https://web-scraping.dev/products', page_limit: 5 }),
  );
  assertEquals(result.crawler_uuid, 'abc-123');
  assertEquals(result.status, 'PENDING');
  assertEquals(fetchStub.calls.length, 1);
  fetchStub.restore();
});

Deno.test('crawl: API returns crawler_uuid (canonical) is preferred over uuid', async () => {
  const client = new ScrapflyClient({ key: '__API_KEY__' });
  const fetchStub = stub(client, 'fetch', async (_config: RequestOptions): Promise<Response> => {
    return responseFactory(
      { crawler_uuid: 'canonical-uuid', uuid: 'fallback-uuid', status: 'PENDING' },
      { status: 201, headers: { 'Content-Type': 'application/json' } },
    );
  });
  const result = await client.crawl(new CrawlerConfig({ url: 'https://example.com' }));
  assertEquals(result.crawler_uuid, 'canonical-uuid');
  fetchStub.restore();
});

Deno.test('crawl: 401 throws BadApiKeyError', async () => {
  const client = new ScrapflyClient({ key: '__API_KEY__' });
  const fetchStub = stub(client, 'fetch', async (_config: RequestOptions): Promise<Response> => {
    return responseFactory(
      { error_id: 'x', http_code: 401, message: 'Invalid API key' },
      { status: 401, headers: { 'Content-Type': 'application/json' } },
    );
  });
  await assertRejects(
    () => client.crawl(new CrawlerConfig({ url: 'https://example.com' })),
    errors.BadApiKeyError,
  );
  fetchStub.restore();
});

Deno.test('crawl: ERR::CRAWLER::* throws ScrapflyCrawlerError', async () => {
  const client = new ScrapflyClient({ key: '__API_KEY__' });
  const fetchStub = stub(client, 'fetch', async (_config: RequestOptions): Promise<Response> => {
    return responseFactory(
      {
        error_id: 'x',
        http_code: 422,
        code: 'ERR::CRAWLER::HIGH_FAILURE_RATE',
        message: 'Crawler stopped: high failure rate',
      },
      { status: 422, headers: { 'Content-Type': 'application/json' } },
    );
  });
  await assertRejects(
    () => client.crawl(new CrawlerConfig({ url: 'https://example.com' })),
    errors.ScrapflyCrawlerError,
  );
  fetchStub.restore();
});

// ----- crawlStatus() -------------------------------------------------------

Deno.test('crawlStatus: GET /crawl/{uuid}/status returns parsed CrawlerStatus', async () => {
  const KEY = '__API_KEY__';
  const client = new ScrapflyClient({ key: KEY });
  const fetchStub = stub(client, 'fetch', async (config: RequestOptions): Promise<Response> => {
    const configUrl = new URL(config.url);
    assertEquals(configUrl.origin + configUrl.pathname, client.HOST + '/crawl/abc-123/status');
    assertEquals(config.method, 'GET');
    assertEquals(configUrl.searchParams.get('key'), KEY);
    return responseFactory(
      {
        crawler_uuid: 'abc-123',
        status: 'RUNNING',
        is_finished: false,
        is_success: null,
        state: {
          urls_visited: 5,
          urls_extracted: 20,
          urls_failed: 1,
          urls_skipped: 2,
          urls_to_crawl: 12,
          api_credit_used: 50,
          duration: 30,
          stop_reason: null,
          start_time: 1700000000,
          stop_time: 1700000030,
        },
      },
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    );
  });
  const status = await client.crawlStatus('abc-123');
  assert(status instanceof CrawlerStatus);
  assertEquals(status.crawler_uuid, 'abc-123');
  assertEquals(status.status, 'RUNNING');
  assertEquals(status.is_finished, false);
  assertEquals(status.is_success, null);
  assertEquals(status.state.urls_visited, 5);
  assertEquals(status.state.urls_extracted, 20);
  assertEquals(status.isRunning, true);
  assertEquals(status.isComplete, false);
  // 5/20 * 100 = 25
  assertEquals(status.progressPct, 25);
  fetchStub.restore();
});

Deno.test('crawlStatus: terminal DONE+success', async () => {
  const client = new ScrapflyClient({ key: '__API_KEY__' });
  const fetchStub = stub(client, 'fetch', async (_config: RequestOptions): Promise<Response> => {
    return responseFactory(
      {
        crawler_uuid: 'abc-123',
        status: 'DONE',
        is_finished: true,
        is_success: true,
        state: {
          urls_visited: 10,
          urls_extracted: 10,
          urls_failed: 0,
          urls_skipped: 0,
          urls_to_crawl: 0,
          api_credit_used: 100,
          duration: 60,
          stop_reason: 'no_more_urls',
          start_time: 1700000000,
          stop_time: 1700000060,
        },
      },
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    );
  });
  const status = await client.crawlStatus('abc-123');
  assertEquals(status.isComplete, true);
  assertEquals(status.isFailed, false);
  assertEquals(status.isRunning, false);
  fetchStub.restore();
});

// ----- crawlUrls() ---------------------------------------------------------

Deno.test('crawlUrls: GET /crawl/{uuid}/urls parses streaming text (visited)', async () => {
  const KEY = '__API_KEY__';
  const client = new ScrapflyClient({ key: KEY });
  const fetchStub = stub(client, 'fetch', async (config: RequestOptions): Promise<Response> => {
    const configUrl = new URL(config.url);
    assertEquals(configUrl.origin + configUrl.pathname, client.HOST + '/crawl/abc-123/urls');
    assertEquals(configUrl.searchParams.get('key'), KEY);
    assertEquals(configUrl.searchParams.get('status'), 'visited');
    assertEquals(configUrl.searchParams.get('page'), '2');
    assertEquals(configUrl.searchParams.get('per_page'), '50');
    // Canonical wire format: one URL per line, plain text.
    return new Response(
      'https://example.com/page1\nhttps://example.com/page2\n',
      { status: 200, headers: { 'Content-Type': 'text/plain; charset=utf-8' } },
    );
  });
  const result = await client.crawlUrls('abc-123', { status: 'visited', page: 2, per_page: 50 });
  assert(result instanceof CrawlerUrls);
  assertEquals(result.urls.length, 2);
  assertEquals(result.urls[0].url, 'https://example.com/page1');
  assertEquals(result.urls[0].status, 'visited');
  assertEquals(result.urls[1].url, 'https://example.com/page2');
  assertEquals(result.page, 2);
  assertEquals(result.per_page, 50);
  fetchStub.restore();
});

Deno.test('crawlUrls: parses url,reason for failed status', async () => {
  const client = new ScrapflyClient({ key: '__API_KEY__' });
  const fetchStub = stub(client, 'fetch', async (_config: RequestOptions): Promise<Response> => {
    return new Response(
      'https://example.com/404,page_limit\nhttps://example.com/500,crawler_error\n',
      { status: 200, headers: { 'Content-Type': 'text/plain; charset=utf-8' } },
    );
  });
  const result = await client.crawlUrls('abc-123', { status: 'failed' });
  assertEquals(result.urls.length, 2);
  assertEquals(result.urls[0].url, 'https://example.com/404');
  assertEquals(result.urls[0].reason, 'page_limit');
  assertEquals(result.urls[0].status, 'failed');
  assertEquals(result.urls[1].reason, 'crawler_error');
  fetchStub.restore();
});

Deno.test('crawlUrls: empty body yields empty urls array', async () => {
  const client = new ScrapflyClient({ key: '__API_KEY__' });
  const fetchStub = stub(client, 'fetch', async (_config: RequestOptions): Promise<Response> => {
    return new Response('', { status: 200, headers: { 'Content-Type': 'text/plain' } });
  });
  const result = await client.crawlUrls('abc-123', { status: 'visited' });
  assertEquals(result.urls.length, 0);
  assertEquals(result.page, 1);
  assertEquals(result.per_page, 100);
  fetchStub.restore();
});

Deno.test('crawlUrls: JSON error envelope throws ScrapflyCrawlerError', async () => {
  const client = new ScrapflyClient({ key: '__API_KEY__' });
  const fetchStub = stub(client, 'fetch', async (_config: RequestOptions): Promise<Response> => {
    return responseFactory(
      {
        error_id: 'x',
        http_code: 404,
        code: 'ERR::CRAWLER::NOT_FOUND',
        message: 'Crawl not found',
      },
      { status: 404, headers: { 'Content-Type': 'application/json' } },
    );
  });
  await assertRejects(
    () => client.crawlUrls('abc-123', { status: 'visited' }),
    errors.ScrapflyCrawlerError,
  );
  fetchStub.restore();
});

// ----- crawlContents() -----------------------------------------------------

Deno.test('crawlContents: JSON mode returns CrawlerContents', async () => {
  const client = new ScrapflyClient({ key: '__API_KEY__' });
  const fetchStub = stub(client, 'fetch', async (config: RequestOptions): Promise<Response> => {
    const configUrl = new URL(config.url);
    // Server query param is `formats` (plural) — see crawlContents impl note.
    assertEquals(configUrl.searchParams.get('formats'), 'markdown');
    assertEquals(configUrl.searchParams.get('plain'), null);
    return responseFactory(
      {
        contents: {
          'https://example.com/p1': { markdown: '# Page 1' },
          'https://example.com/p2': { markdown: '# Page 2' },
        },
        links: { next: null, prev: null },
      },
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    );
  });
  const result = await client.crawlContents('abc-123', { format: 'markdown' });
  assert(result instanceof CrawlerContents);
  assertEquals(Object.keys((result as CrawlerContents).contents).length, 2);
  fetchStub.restore();
});

Deno.test('crawlContents: plain mode returns string', async () => {
  const client = new ScrapflyClient({ key: '__API_KEY__' });
  const fetchStub = stub(client, 'fetch', async (config: RequestOptions): Promise<Response> => {
    const configUrl = new URL(config.url);
    assertEquals(configUrl.searchParams.get('plain'), 'true');
    assertEquals(configUrl.searchParams.get('url'), 'https://example.com/p1');
    // Server query param is `formats` (plural) — see crawlContents impl note.
    assertEquals(configUrl.searchParams.get('formats'), 'markdown');
    return new Response('# Page 1 markdown content', {
      status: 200,
      headers: { 'Content-Type': 'text/markdown' },
    });
  });
  const result = await client.crawlContents('abc-123', {
    format: 'markdown',
    url: 'https://example.com/p1',
    plain: true,
  });
  assertEquals(typeof result, 'string');
  assertEquals(result, '# Page 1 markdown content');
  fetchStub.restore();
});

Deno.test('crawlContents: plain=true without url throws CrawlerConfigError', async () => {
  const client = new ScrapflyClient({ key: '__API_KEY__' });
  await assertRejects(
    () => client.crawlContents('abc-123', { format: 'markdown', plain: true }),
    errors.CrawlerConfigError,
    'plain=true requires',
  );
});

Deno.test('crawlContents: strict parsing rejects response missing `contents`', async () => {
  const client = new ScrapflyClient({ key: '__API_KEY__' });
  const fetchStub = stub(client, 'fetch', async (_config: RequestOptions): Promise<Response> => {
    // `links` present but `contents` missing — server contract violation.
    return responseFactory(
      { links: { next: null, prev: null } },
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    );
  });
  await assertRejects(
    () => client.crawlContents('abc-123', { format: 'markdown' }),
    Error,
    "required field 'contents' is missing",
  );
  fetchStub.restore();
});

// ----- crawlContentsBatch() ------------------------------------------------

Deno.test('crawlContentsBatch: parses multipart/related response', async () => {
  const client = new ScrapflyClient({ key: '__API_KEY__' });
  const boundary = 'mp-test-boundary';
  const multipartBody = [
    `--${boundary}`,
    'Content-Type: text/markdown',
    'Content-Location: https://example.com/page1',
    '',
    '# Page 1',
    `--${boundary}`,
    'Content-Type: text/markdown',
    'Content-Location: https://example.com/page2',
    '',
    '# Page 2',
    `--${boundary}--`,
    '',
  ].join('\r\n');

  const fetchStub = stub(client, 'fetch', async (config: RequestOptions): Promise<Response> => {
    const configUrl = new URL(config.url);
    assertEquals(configUrl.origin + configUrl.pathname, client.HOST + '/crawl/abc-123/contents/batch');
    assertEquals(config.method, 'POST');
    assertEquals(configUrl.searchParams.get('formats'), 'markdown');
    assertEquals(config.body, 'https://example.com/page1\nhttps://example.com/page2');
    return new Response(multipartBody, {
      status: 200,
      headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
    });
  });

  const result = await client.crawlContentsBatch(
    'abc-123',
    ['https://example.com/page1', 'https://example.com/page2'],
    ['markdown'],
  );
  assertEquals(result['https://example.com/page1']['markdown'], '# Page 1');
  assertEquals(result['https://example.com/page2']['markdown'], '# Page 2');
  fetchStub.restore();
});

Deno.test('crawlContentsBatch: empty url list throws', async () => {
  const client = new ScrapflyClient({ key: '__API_KEY__' });
  await assertRejects(
    () => client.crawlContentsBatch('abc-123', [], ['markdown']),
    errors.CrawlerConfigError,
  );
});

Deno.test('crawlContentsBatch: > 100 urls throws', async () => {
  const client = new ScrapflyClient({ key: '__API_KEY__' });
  const urls = Array.from({ length: 101 }, (_, i) => `https://example.com/p${i}`);
  await assertRejects(
    () => client.crawlContentsBatch('abc-123', urls, ['markdown']),
    errors.CrawlerConfigError,
    '100',
  );
});

// ----- crawlArtifact() -----------------------------------------------------

Deno.test('crawlArtifact: GET warc returns CrawlerArtifact with bytes', async () => {
  const client = new ScrapflyClient({ key: '__API_KEY__' });
  const warcBytes = new Uint8Array([0x1f, 0x8b, 0x08, 0x00, 0xde, 0xad, 0xbe, 0xef]);
  const fetchStub = stub(client, 'fetch', async (config: RequestOptions): Promise<Response> => {
    const configUrl = new URL(config.url);
    assertEquals(configUrl.searchParams.get('type'), 'warc');
    return new Response(warcBytes, {
      status: 200,
      headers: { 'Content-Type': 'application/gzip' },
    });
  });
  const artifact = await client.crawlArtifact('abc-123', 'warc');
  assert(artifact instanceof CrawlerArtifact);
  assertEquals(artifact.type, 'warc');
  assertEquals(artifact.data.byteLength, 8);
  fetchStub.restore();
});

Deno.test('crawlArtifact: GET har returns CrawlerArtifact', async () => {
  const client = new ScrapflyClient({ key: '__API_KEY__' });
  const harJson = JSON.stringify({ log: { version: '1.2', entries: [] } });
  const fetchStub = stub(client, 'fetch', async (config: RequestOptions): Promise<Response> => {
    const configUrl = new URL(config.url);
    assertEquals(configUrl.searchParams.get('type'), 'har');
    return new Response(harJson, {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  });
  const artifact = await client.crawlArtifact('abc-123', 'har');
  assertEquals(artifact.type, 'har');
  assert(artifact.data.byteLength > 0);
  fetchStub.restore();
});

Deno.test('crawlArtifact: warc with JSON error envelope throws ScrapflyCrawlerError', async () => {
  const client = new ScrapflyClient({ key: '__API_KEY__' });
  const fetchStub = stub(client, 'fetch', async (_config: RequestOptions): Promise<Response> => {
    return responseFactory(
      {
        error_id: 'x',
        http_code: 404,
        code: 'ERR::CRAWLER::NOT_FOUND',
        message: 'Crawl not found',
      },
      { status: 404, headers: { 'Content-Type': 'application/json' } },
    );
  });
  await assertRejects(
    () => client.crawlArtifact('abc-123', 'warc'),
    errors.ScrapflyCrawlerError,
  );
  fetchStub.restore();
});

// ----- crawlCancel() -------------------------------------------------------

Deno.test('crawlCancel: POST /crawl/{uuid}/cancel returns true on success', async () => {
  const KEY = '__API_KEY__';
  const client = new ScrapflyClient({ key: KEY });
  const fetchStub = stub(client, 'fetch', async (config: RequestOptions): Promise<Response> => {
    const configUrl = new URL(config.url);
    assertEquals(configUrl.origin + configUrl.pathname, client.HOST + '/crawl/abc-123/cancel');
    assertEquals(config.method, 'POST');
    return new Response('', { status: 200 });
  });
  const ok = await client.crawlCancel('abc-123');
  assertEquals(ok, true);
  fetchStub.restore();
});

Deno.test('crawlCancel: error envelope throws ScrapflyCrawlerError', async () => {
  const client = new ScrapflyClient({ key: '__API_KEY__' });
  const fetchStub = stub(client, 'fetch', async (_config: RequestOptions): Promise<Response> => {
    return responseFactory(
      {
        error_id: 'x',
        http_code: 422,
        code: 'ERR::CRAWLER::ALREADY_FINISHED',
        message: 'Cannot cancel finished crawler',
      },
      { status: 422, headers: { 'Content-Type': 'application/json' } },
    );
  });
  await assertRejects(
    () => client.crawlCancel('abc-123'),
    errors.ScrapflyCrawlerError,
  );
  fetchStub.restore();
});

// ----- host override ------------------------------------------------------

Deno.test('client: host override is honored, trailing slashes stripped', () => {
  const client = new ScrapflyClient({ key: '__API_KEY__', host: 'https://api.scrapfly.local/' });
  assertEquals(client.HOST, 'https://api.scrapfly.local');
});

Deno.test('client: host omitted defaults to api.scrapfly.io', () => {
  const client = new ScrapflyClient({ key: '__API_KEY__' });
  assertEquals(client.HOST, 'https://api.scrapfly.io');
});
