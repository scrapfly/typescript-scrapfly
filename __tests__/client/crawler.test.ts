import * as errors from '../../src/errors.ts';
import { ScrapflyClient } from '../../src/client.ts';
import { CrawlerConfig } from '../../src/crawlerconfig.ts';
import {
  CrawlerArtifact,
  CrawlerContents,
  CrawlerSearchResponse,
  CrawlerStatus,
  CrawlerUrls,
  isSearchable,
  parseCrawlerRefreshState,
  parseCrawlerSearchState,
  refreshChanged,
} from '../../src/crawlerresult.ts';
import type { CrawlerPromptDone } from '../../src/crawlerresult.ts';
import { Crawl } from '../../src/crawl.ts';
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

// ----- crawlSearch / crawlPrompt ------------------------------------------

const SEARCH_ENVELOPE = {
  query: 'TLS fingerprint',
  mode: 'hybrid',
  limit: 20,
  completeness: 'exact',
  crawls: [{ crawler_uuid: '0198aaaa', documents: 412, vectors: 18432, index: 'IVF_PQ' }],
  skipped: [{ crawler_uuid: '0198bbbb', reason: 'search_not_ready', status: 'BUILDING' }],
  results: [{
    rank: 1,
    score: 0.927,
    scores: { vector: 0.91, fts: 12.4, rrf: 0.0312 },
    crawler_uuid: '0198aaaa',
    url: 'https://example.com/foo',
    title: 'Foo Product',
    source_format: 'markdown',
    content_type: 'application/markdown',
    chunk_id: 3,
    text: 'the matched chunk',
    warc_offset: 728271,
    warc_end: 746643,
    contents_url: 'https://api.scrapfly.io/crawl/0198aaaa/contents?url=x',
  }],
  stats: { duration_ms: 412, crawls_searched: 1, candidates: 150, gcs_gets: 27 },
  crawls_requested: 2,
  crawls_searched: 1,
  crawls_pruned_exact: 0,
  // The completeness envelope names the crawls it could not read, it does not
  // count them. Decoding either as a scalar throws on every real response.
  crawls_skipped_deadline: ['0198cccc'],
  crawls_failed: [{ crawler_uuid: '0198dddd', reason: 'search_failed', status: 'FAILED' }],
  theta: 0.42,
  max_ub_unsearched: null,
  cursor: null,
};

function sseResponse(frames: string): Response {
  return new Response(frames, {
    status: 200,
    headers: { 'Content-Type': 'text/event-stream' },
  });
}

Deno.test('crawlSearch: POSTs the collection body to /crawl/search', async () => {
  const KEY = '__API_KEY__';
  const client = new ScrapflyClient({ key: KEY });
  const fetchStub = stub(client, 'fetch', async (config: RequestOptions): Promise<Response> => {
    const configUrl = new URL(config.url);
    assertEquals(configUrl.origin + configUrl.pathname, client.HOST + '/crawl/search');
    assertEquals(config.method, 'POST');
    assertEquals(configUrl.searchParams.get('key'), KEY);
    const body = JSON.parse(config.body as string);
    assertEquals(body.query, 'TLS fingerprint');
    assertEquals(body.crawl_ids, ['0198aaaa', '0198bbbb']);
    assertEquals(body.limit, 20);
    assertEquals(body.mode, 'hybrid');
    assertEquals(body.filters, { url_prefix: 'https://example.com/docs/' });
    return responseFactory(SEARCH_ENVELOPE, { status: 200, headers: { 'Content-Type': 'application/json' } });
  });

  const res = await client.crawlSearch(['0198aaaa', '0198bbbb'], 'TLS fingerprint', {
    limit: 20,
    mode: 'hybrid',
    filters: { url_prefix: 'https://example.com/docs/' },
  });

  assert(res instanceof CrawlerSearchResponse);
  assertEquals(res.isExact, true);
  assertEquals(res.results.length, 1);
  assertEquals(res.results[0].url, 'https://example.com/foo');
  assertEquals(res.results[0].scores.rrf, 0.0312);
  assertEquals(res.results[0].warc_end, 746643);
  assertEquals(res.skipped[0].reason, 'search_not_ready');
  assertEquals(res.crawls[0].vectors, 18432);
  assertEquals(res.crawls_skipped_deadline, ['0198cccc']);
  assertEquals(res.crawls_failed?.[0].crawler_uuid, '0198dddd');
  assertEquals(res.crawls_failed?.[0].reason, 'search_failed');
  // No crawl was left unopened, so no bound exists: null, never 0.
  assertEquals(res.max_ub_unsearched, null);
  assertEquals(res.cursor, null);
  fetchStub.restore();
});

Deno.test('crawlSearch: a single-crawl search is a one-element collection call', async () => {
  const client = new ScrapflyClient({ key: '__API_KEY__' });
  const fetchStub = stub(client, 'fetch', async (config: RequestOptions): Promise<Response> => {
    const configUrl = new URL(config.url);
    assertEquals(configUrl.origin + configUrl.pathname, client.HOST + '/crawl/search');
    assertEquals(JSON.parse(config.body as string).crawl_ids, ['0198aaaa']);
    return responseFactory(SEARCH_ENVELOPE, { status: 200, headers: { 'Content-Type': 'application/json' } });
  });
  await client.crawlSearch(['0198aaaa'], 'TLS fingerprint');
  fetchStub.restore();
});

Deno.test('crawlSearch: empty crawl_ids rejected before any request', async () => {
  const client = new ScrapflyClient({ key: '__API_KEY__' });
  const fetchStub = stub(client, 'fetch', async (_config: RequestOptions): Promise<Response> => {
    throw new Error('no request should be issued');
  });
  await assertRejects(() => client.crawlSearch([], 'q'), errors.ScrapflyCrawlerError);
  await assertRejects(() => client.crawlSearch(['a'], ''), errors.ScrapflyCrawlerError);
  assertEquals(fetchStub.calls.length, 0);
  fetchStub.restore();
});

Deno.test('crawlSearch: error envelope throws ScrapflyCrawlerError', async () => {
  const client = new ScrapflyClient({ key: '__API_KEY__' });
  const fetchStub = stub(client, 'fetch', async (_config: RequestOptions): Promise<Response> => {
    return responseFactory(
      {
        error_id: 'x',
        http_code: 400,
        code: 'ERR::CRAWLER::SEARCH_NOT_ENABLED',
        message: 'Search is not enabled',
      },
      { status: 400, headers: { 'Content-Type': 'application/json' } },
    );
  });
  await assertRejects(() => client.crawlSearch(['0198aaaa'], 'q'), errors.ScrapflyCrawlerError);
  fetchStub.restore();
});

Deno.test('crawlPrompt: streams source, token and done frames', async () => {
  const client = new ScrapflyClient({ key: '__API_KEY__' });
  let sentBody: Record<string, any> = {};
  const fetchStub = stub(client, 'fetch', async (config: RequestOptions): Promise<Response> => {
    const configUrl = new URL(config.url);
    assertEquals(configUrl.origin + configUrl.pathname, client.HOST + '/crawl/prompt');
    assertEquals(config.headers.accept, 'text/event-stream');
    sentBody = JSON.parse(config.body as string);
    return sseResponse(
      'event: source\ndata: {"id":1,"crawler_uuid":"0198aaaa","url":"https://example.com/foo","score":0.92}\n\n' +
        ':keepalive\n\n' +
        'event: token\ndata: "The"\n\n' +
        'event: token\ndata: " answer"\n\n' +
        // The engine's own done frame, verbatim. The stream is a byte relay, so
        // thoughts_token_count / model / sources_dropped reach the caller here
        // even though the non-streaming JSON path renders a narrower envelope.
        'event: done\ndata: {"sources_used":[1],"sources_dropped":2,"truncated":false,' +
        '"usage":{"prompt_token_count":1841,"candidates_token_count":260,"thoughts_token_count":118,' +
        '"total_token_count":2219,"cost":{"input":0.000184,"output":0.000378},"model":"gemini-2.5-flash"}}\n\n',
    );
  });

  let answer = '';
  const sources: string[] = [];
  // Typed, not Record<string, any>: an interface that stops declaring one of
  // these fields must fail the type check, not decode into `undefined`.
  let done: CrawlerPromptDone | null = null;
  for await (
    const ev of client.crawlPrompt(['0198aaaa', '0198bbbb'], 'Compare the pricing models.', {
      search: { limit: 30, mode: 'hybrid' },
      model: 'gemini-2.5-flash-lite',
    })
  ) {
    if (ev.event === 'token') answer += ev.data;
    if (ev.event === 'source') sources.push(ev.data.url);
    if (ev.event === 'done') done = ev.data;
  }

  assertEquals(sentBody.generation, { stream: true, model: 'gemini-2.5-flash-lite' });
  assertEquals(sentBody.search, { limit: 30, mode: 'hybrid' });
  assertEquals(answer, 'The answer');
  assertEquals(sources, ['https://example.com/foo']);
  assertEquals(done?.sources_used, [1]);
  assertEquals(done?.sources_dropped, 2);
  // The done frame reports the flat price and nothing about how the answer was
  // produced. The fixture still sends usage/tokens/cost/model because an older
  // API will; a type with no such field is what drops them.
  assertEquals(JSON.stringify(done).includes('gemini'), false);
  assertEquals(JSON.stringify(done).includes('token_count'), false);
  fetchStub.restore();
});

Deno.test('crawlPrompt: an error frame throws mid-stream', async () => {
  // Generation can fail after tokens were already yielded.
  const client = new ScrapflyClient({ key: '__API_KEY__' });
  const fetchStub = stub(client, 'fetch', async (_config: RequestOptions): Promise<Response> => {
    return sseResponse(
      'event: token\ndata: "partial"\n\n' +
        'event: error\ndata: {"code":"ERR::CRAWLER::PROMPT_GENERATION_FAILED","message":"upstream refused"}\n\n',
    );
  });

  const tokens: string[] = [];
  await assertRejects(
    async () => {
      for await (const ev of client.crawlPrompt(['0198aaaa'], 'hi')) {
        if (ev.event === 'token') tokens.push(ev.data);
      }
    },
    errors.ScrapflyCrawlerError,
  );
  assertEquals(tokens, ['partial']);
  fetchStub.restore();
});

Deno.test('crawlPrompt: an error status throws before streaming', async () => {
  const client = new ScrapflyClient({ key: '__API_KEY__' });
  const fetchStub = stub(client, 'fetch', async (_config: RequestOptions): Promise<Response> => {
    return responseFactory(
      { error_id: 'x', http_code: 403, code: 'ERR::CRAWLER::SEARCH_DISABLED_BY_COMPLIANCE', message: 'nope' },
      { status: 403, headers: { 'Content-Type': 'application/json' } },
    );
  });
  await assertRejects(
    async () => {
      for await (const _ of client.crawlPrompt(['0198aaaa'], 'hi')) { /* drained by the throw */ }
    },
    errors.ScrapflyCrawlerError,
  );
  fetchStub.restore();
});

// ----- Crawl wrapper delegation -------------------------------------------

Deno.test('Crawl: search and prompt delegate to the collection endpoints', async () => {
  const client = new ScrapflyClient({ key: '__API_KEY__' });
  const seen: string[] = [];
  const fetchStub = stub(client, 'fetch', async (config: RequestOptions): Promise<Response> => {
    const path = new URL(config.url).pathname;
    seen.push(path);
    if (path === '/crawl') {
      return responseFactory(
        { crawler_uuid: 'abc-123', status: 'PENDING' },
        { status: 201, headers: { 'Content-Type': 'application/json' } },
      );
    }
    if (path === '/crawl/search') {
      assertEquals(JSON.parse(config.body as string).crawl_ids, ['abc-123']);
      return responseFactory(SEARCH_ENVELOPE, { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    assertEquals(JSON.parse(config.body as string).crawl_ids, ['abc-123']);
    return sseResponse('event: done\ndata: {"truncated":false}\n\n');
  });

  const crawl = new Crawl(client, new CrawlerConfig({ url: 'https://example.com', search: true }));
  await crawl.start();
  await crawl.search('q');
  for await (const _ of crawl.prompt('q')) { /* drain */ }

  assertEquals(seen, ['/crawl', '/crawl/search', '/crawl/prompt']);
  fetchStub.restore();
});

// ----- /status search block -----------------------------------------------

Deno.test('crawlStatus: the search block is parsed when present', async () => {
  const client = new ScrapflyClient({ key: '__API_KEY__' });
  const fetchStub = stub(client, 'fetch', async (_config: RequestOptions): Promise<Response> => {
    return responseFactory({
      crawler_uuid: 'abc-123',
      status: 'DONE',
      is_finished: true,
      is_success: true,
      state: {
        urls_visited: 1,
        urls_extracted: 1,
        urls_failed: 0,
        urls_skipped: 0,
        urls_to_crawl: 0,
        api_credit_used: 1,
        duration: 1,
        stop_reason: 'no_more_urls',
        start_time: 1,
        stop_time: 2,
      },
      search: { status: 'READY', documents: 412, vectors: 18432, index: 'IVF_PQ', generation: 1 },
    }, { status: 200, headers: { 'Content-Type': 'application/json' } });
  });

  const status = await client.crawlStatus('abc-123');
  assertEquals(status.search?.status, 'READY');
  assertEquals(status.search?.vectors, 18432);
  assertEquals(isSearchable(status.search), true);
  fetchStub.restore();
});

Deno.test('crawlStatus: the search block is null on a crawl without it', async () => {
  const client = new ScrapflyClient({ key: '__API_KEY__' });
  const fetchStub = stub(client, 'fetch', async (_config: RequestOptions): Promise<Response> => {
    return responseFactory({
      crawler_uuid: 'abc-123',
      status: 'DONE',
      is_finished: true,
      is_success: true,
      state: {
        urls_visited: 1,
        urls_extracted: 1,
        urls_failed: 0,
        urls_skipped: 0,
        urls_to_crawl: 0,
        api_credit_used: 1,
        duration: 1,
        stop_reason: 'no_more_urls',
        start_time: 1,
        stop_time: 2,
      },
    }, { status: 200, headers: { 'Content-Type': 'application/json' } });
  });

  const status = await client.crawlStatus('abc-123');
  assertEquals(status.search, null);
  assertEquals(isSearchable(status.search), false);
  fetchStub.restore();
});

Deno.test('crawlStatus: search and refresh decode through their field whitelists', async () => {
  const client = new ScrapflyClient({ key: '__API_KEY__' });
  const fetchStub = stub(client, 'fetch', async (_config: RequestOptions): Promise<Response> => {
    return responseFactory({
      crawler_uuid: 'abc-123',
      status: 'DONE',
      is_finished: true,
      is_success: true,
      state: {
        urls_visited: 5,
        urls_extracted: 5,
        urls_failed: 0,
        urls_skipped: 0,
        urls_to_crawl: 0,
        api_credit_used: 5,
        duration: 12,
        stop_reason: 'no_more_urls',
        start_time: 1,
        stop_time: 13,
      },
      search: {
        status: 'READY',
        manifest: 'gs://scrapfly-crawler/0198aaaa/index/manifest.json',
        documents: 5,
        vectors: 41,
        dropped: 0,
        queue_depth: 0,
        fragments: 1,
        built_at: '2026-09-03T22:31:41Z',
        index: 'IVF_PQ',
        embedding_model: 'gemini-embedding-001',
        embedding_dimension: 1536,
        generation: 1,
        unmodelled: 'from a newer engine',
      },
      refresh: {
        enabled: true,
        interval_seconds: 3600,
        status: 'RUNNING',
        generation: 4,
        started_at: '2026-09-03T22:31:03Z',
        consecutive_failures: 2,
        history: [],
        unmodelled: 'from a newer engine',
      },
    }, { status: 200, headers: { 'Content-Type': 'application/json' } });
  });

  const status = await client.crawlStatus('abc-123');
  // Counters the index writer always reports. Dropping one from the model
  // leaves undefined here, which is exactly what a caller reading the block
  // to decide whether the index is worth querying would then see.
  assertEquals(status.search?.queue_depth, 0);
  assertEquals(status.search?.fragments, 1);
  assertEquals(status.search?.manifest, 'gs://scrapfly-crawler/0198aaaa/index/manifest.json');
  // Which model we embed with is not the customer's business.
  assertEquals(JSON.stringify(status.search).includes('gemini'), false);
  assertEquals(JSON.stringify(status.search).includes('embedding_'), false);
  // Only GET /status relays these two on the refresh block.
  assertEquals(status.refresh?.started_at, '2026-09-03T22:31:03Z');
  assertEquals(status.refresh?.consecutive_failures, 2);

  // Whitelist, not spread: a key the model does not declare stops at the
  // parser instead of riding through as raw JSON.
  const search = status.search as unknown as Record<string, unknown>;
  const refresh = status.refresh as unknown as Record<string, unknown>;
  assertEquals('unmodelled' in search, false);
  assertEquals('unmodelled' in refresh, false);
  fetchStub.restore();
});

Deno.test('parseCrawlerSearchState: accepts both envelope shapes', () => {
  // The search webhooks and GET /status both nest the block; the block on its
  // own must decode to the same thing.
  const block = { status: 'PARTIAL', documents: 3, vectors: 12, queue_depth: 1, fragments: 2 };
  const flat = parseCrawlerSearchState(block);
  const nested = parseCrawlerSearchState({ crawler_uuid: '0198aaaa', search: block });
  assertEquals(flat.status, nested.status);
  assertEquals(flat.vectors, nested.vectors);
  assertEquals(isSearchable(nested), true);

  // No block at all is not a running build: it reads as disabled.
  const absent = parseCrawlerSearchState({});
  assertEquals(absent.status, 'DISABLED');
  assertEquals(absent.manifest, undefined);
  assertEquals(isSearchable(absent), false);

  // Zero is a count the writer made; it must survive as 0, not fold to absent.
  const empty = parseCrawlerSearchState({ status: 'BUILDING', documents: 0, queue_depth: 0, fragments: 0 });
  assertEquals(empty.documents, 0);
  assertEquals(empty.queue_depth, 0);
  assertEquals(empty.fragments, 0);
});

// ----- crawlRefreshNow / crawlRefreshSettings / crawlRefreshHistory --------

const REFRESH_ENVELOPE = {
  enabled: true,
  interval_seconds: 86400,
  status: 'SCHEDULED',
  generation: 2,
  last_run_at: '2026-09-01T04:00:00Z',
  next_run_at: '2026-09-02T04:00:00Z',
  error: null,
  history: [
    {
      at: '2026-08-31T04:00:00Z',
      generation: 1,
      added: 0,
      updated: 0,
      removed: 0,
      unchanged: 412,
      failed: 0,
      duration_ms: 41200,
      search_status: 'READY',
    },
    {
      at: '2026-09-01T04:00:00Z',
      generation: 2,
      added: 3,
      updated: 7,
      removed: 1,
      unchanged: 404,
      failed: 0,
      duration_ms: 44900,
      search_status: 'READY',
      sample_updated: ['https://example.com/pricing'],
      sample_removed: ['https://example.com/old'],
    },
  ],
};

Deno.test('crawlRefreshNow: POSTs to /crawl/{uuid}/refresh', async () => {
  const KEY = '__API_KEY__';
  const client = new ScrapflyClient({ key: KEY });
  const fetchStub = stub(client, 'fetch', async (config: RequestOptions): Promise<Response> => {
    const configUrl = new URL(config.url);
    assertEquals(configUrl.origin + configUrl.pathname, client.HOST + '/crawl/0198aaaa/refresh');
    assertEquals(config.method, 'POST');
    assertEquals(configUrl.searchParams.get('key'), KEY);
    return responseFactory(REFRESH_ENVELOPE, { status: 202, headers: { 'Content-Type': 'application/json' } });
  });

  const state = await client.crawlRefreshNow('0198aaaa');

  assertEquals(state.enabled, true);
  assertEquals(state.status, 'SCHEDULED');
  assertEquals(state.generation, 2);
  assertEquals(state.next_run_at, '2026-09-02T04:00:00Z');
  assertEquals(state.history?.length, 2);
  assertEquals(refreshChanged(state.history?.[1]), 11);
  assertEquals(state.history?.[1].sample_removed, ['https://example.com/old']);
  fetchStub.restore();
});

Deno.test('crawlRefreshSettings: PATCHes only the fields passed', async () => {
  const client = new ScrapflyClient({ key: '__API_KEY__' });
  let body: Record<string, unknown> = {};
  const fetchStub = stub(client, 'fetch', async (config: RequestOptions): Promise<Response> => {
    const configUrl = new URL(config.url);
    assertEquals(configUrl.origin + configUrl.pathname, client.HOST + '/crawl/0198aaaa/refresh');
    assertEquals(config.method, 'PATCH');
    body = JSON.parse(config.body as string);
    return responseFactory(REFRESH_ENVELOPE, { status: 200, headers: { 'Content-Type': 'application/json' } });
  });

  await client.crawlRefreshSettings('0198aaaa', { enabled: true, interval_seconds: 86400 });
  assertEquals(body, { refresh: true, refresh_interval: 86400 });

  // Turning refresh off must not send an interval, or it would overwrite the
  // period the crawl keeps for when it is turned back on.
  await client.crawlRefreshSettings('0198aaaa', { enabled: false });
  assertEquals(body, { refresh: false });
  fetchStub.restore();
});

Deno.test('crawlRefresh: bad input rejected before any request', async () => {
  const client = new ScrapflyClient({ key: '__API_KEY__' });
  const fetchStub = stub(client, 'fetch', async (_config: RequestOptions): Promise<Response> => {
    throw new Error('no request should be issued');
  });
  await assertRejects(() => client.crawlRefreshNow(''), errors.ScrapflyCrawlerError);
  await assertRejects(() => client.crawlRefreshSettings('0198aaaa', {}), errors.ScrapflyCrawlerError);
  await assertRejects(
    () => client.crawlRefreshSettings('0198aaaa', { interval_seconds: 60 }),
    errors.ScrapflyCrawlerError,
  );
  assertEquals(fetchStub.calls.length, 0);
  fetchStub.restore();
});

Deno.test('crawlRefreshHistory: GETs the timeline newest last', async () => {
  const client = new ScrapflyClient({ key: '__API_KEY__' });
  const fetchStub = stub(client, 'fetch', async (config: RequestOptions): Promise<Response> => {
    const configUrl = new URL(config.url);
    assertEquals(configUrl.origin + configUrl.pathname, client.HOST + '/crawl/0198aaaa/refresh/history');
    assertEquals(config.method, 'GET');
    assertEquals(configUrl.searchParams.get('limit'), '5');
    return responseFactory(REFRESH_ENVELOPE, { status: 200, headers: { 'Content-Type': 'application/json' } });
  });

  const history = await client.crawlRefreshHistory('0198aaaa', { limit: 5 });

  assertEquals(history.map((e) => e.generation), [1, 2]);
  assertEquals(refreshChanged(history[0]), 0);
  assertEquals(history[0].unchanged, 412);
  fetchStub.restore();
});

Deno.test('crawlRefresh: error envelope throws ScrapflyCrawlerError', async () => {
  const client = new ScrapflyClient({ key: '__API_KEY__' });
  const fetchStub = stub(client, 'fetch', async (_config: RequestOptions): Promise<Response> => {
    return responseFactory(
      {
        error_id: 'e1',
        code: 'ERR::CRAWLER::REFRESH_IN_PROGRESS',
        message: 'A refresh is already running',
        http_code: 409,
      },
      { status: 409, headers: { 'Content-Type': 'application/json' } },
    );
  });
  await assertRejects(() => client.crawlRefreshNow('0198aaaa'), errors.ScrapflyCrawlerError);
  fetchStub.restore();
});

Deno.test('Crawl.refresh*: delegate to the client', async () => {
  const client = new ScrapflyClient({ key: '__API_KEY__' });
  const paths: string[] = [];
  const fetchStub = stub(client, 'fetch', async (config: RequestOptions): Promise<Response> => {
    const configUrl = new URL(config.url);
    paths.push(configUrl.pathname);
    if (configUrl.pathname === '/crawl') {
      return responseFactory(
        { uuid: '0198aaaa', status: 'PENDING' },
        { status: 201, headers: { 'Content-Type': 'application/json' } },
      );
    }
    return responseFactory(REFRESH_ENVELOPE, { status: 200, headers: { 'Content-Type': 'application/json' } });
  });

  const crawl = new Crawl(client, new CrawlerConfig({ url: 'https://example.com', refresh: true }));
  await crawl.start();
  await crawl.refreshNow();
  await crawl.refreshSettings({ enabled: true });
  await crawl.refreshHistory();

  assertEquals(paths, [
    '/crawl',
    '/crawl/0198aaaa/refresh',
    '/crawl/0198aaaa/refresh',
    '/crawl/0198aaaa/refresh/history',
  ]);
  fetchStub.restore();
});

Deno.test('parseCrawlerRefreshState: accepts both envelope shapes', () => {
  // The refresh endpoints answer with the state at the top level; /status
  // nests it under `refresh`. Both must decode to the same thing.
  const flat = parseCrawlerRefreshState(REFRESH_ENVELOPE);
  const nested = parseCrawlerRefreshState({ crawler_uuid: '0198aaaa', refresh: REFRESH_ENVELOPE });
  assertEquals(flat.generation, nested.generation);
  assertEquals(flat.history?.length, nested.history?.length);

  // A crawl with no refresh block reads as disabled, never as enabled.
  const absent = parseCrawlerRefreshState({});
  assertEquals(absent.enabled, false);
  assertEquals(absent.status, 'DISABLED');
  assertEquals(absent.next_run_at, undefined);
});

Deno.test('parseCrawlerRefreshState: keeps the two fields only /status sends', () => {
  // GET /crawl/{uuid}/status relays the engine's refresh block verbatim, so it
  // carries started_at and consecutive_failures; the three refresh routes
  // render a typed state that declares neither. One type serves both paths,
  // and the whitelist below is the only place the keys can be lost.
  const running = {
    enabled: true,
    interval_seconds: 3600,
    status: 'RUNNING',
    generation: 4,
    started_at: '2026-09-03T22:31:03.851147Z',
    consecutive_failures: 2,
    history: [],
  };
  const nested = parseCrawlerRefreshState({ crawler_uuid: '0198aaaa', refresh: running });
  assertEquals(nested.started_at, '2026-09-03T22:31:03.851147Z');
  assertEquals(nested.consecutive_failures, 2);

  // A settled schedule names no run in flight, and a clean counter is 0 rather
  // than absent: 0 is a claim the server made, undefined is the route not
  // making it.
  const settled = parseCrawlerRefreshState({
    refresh: { ...running, status: 'SCHEDULED', started_at: null, consecutive_failures: 0 },
  });
  assertEquals(settled.started_at, undefined);
  assertEquals(settled.consecutive_failures, 0);

  // PATCH /crawl/{uuid}/refresh answers without either key.
  const routeReply = parseCrawlerRefreshState(REFRESH_ENVELOPE);
  assertEquals(routeReply.started_at, undefined);
  assertEquals(routeReply.consecutive_failures, undefined);
});
