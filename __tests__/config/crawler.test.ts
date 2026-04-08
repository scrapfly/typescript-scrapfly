import { CrawlerConfig } from '../../src/crawlerconfig.ts';
import * as errors from '../../src/errors.ts';
import { assertEquals, assertThrows } from 'https://deno.land/std@0.224.0/assert/mod.ts';

Deno.test('CrawlerConfig: minimal valid config', () => {
  const config = new CrawlerConfig({ url: 'https://web-scraping.dev/products' });
  const params = config.toApiParams();
  assertEquals(params.url, 'https://web-scraping.dev/products');
  // Defaults should NOT be in the serialized output (so server applies its own).
  assertEquals(params.respect_robots_txt, undefined);
  assertEquals(params.cache, undefined);
  assertEquals(params.page_limit, undefined);
  assertEquals(params.follow_internal_subdomains, undefined);
});

Deno.test('CrawlerConfig: empty url is rejected', () => {
  assertThrows(
    () => new CrawlerConfig({ url: '' }),
    errors.CrawlerConfigError,
    'url is required',
  );
});

Deno.test('CrawlerConfig: all common fields round-trip through toApiParams', () => {
  const config = new CrawlerConfig({
    url: 'https://web-scraping.dev/products',
    page_limit: 10,
    max_depth: 3,
    max_duration: 600,
    max_api_credit: 5000,
    exclude_paths: ['/admin/*'],
    ignore_base_path_restriction: true,
    follow_external_links: true,
    allowed_external_domains: ['cdn.example.com'],
    follow_internal_subdomains: false,
    allowed_internal_subdomains: ['blog.example.com'],
    headers: { 'X-Custom': 'value' },
    delay: 1000,
    user_agent: 'TestBot/1.0',
    max_concurrency: 5,
    rendering_delay: 2000,
    use_sitemaps: true,
    respect_robots_txt: false,
    ignore_no_follow: true,
    cache: true,
    cache_ttl: 3600,
    cache_clear: true,
    content_formats: ['markdown', 'text'],
    extraction_rules: { '/products/*': { type: 'prompt', value: 'extract products' } },
    asp: true,
    proxy_pool: 'public_residential_pool',
    country: 'us',
    webhook_name: 'my-webhook',
    webhook_events: ['crawler_finished', 'crawler_url_failed'],
  });
  const params = config.toApiParams();
  assertEquals(params.url, 'https://web-scraping.dev/products');
  assertEquals(params.page_limit, 10);
  assertEquals(params.max_depth, 3);
  assertEquals(params.max_duration, 600);
  assertEquals(params.max_api_credit, 5000);
  assertEquals(params.exclude_paths, ['/admin/*']);
  assertEquals(params.ignore_base_path_restriction, true);
  assertEquals(params.follow_external_links, true);
  assertEquals(params.allowed_external_domains, ['cdn.example.com']);
  assertEquals(params.follow_internal_subdomains, false);
  assertEquals(params.allowed_internal_subdomains, ['blog.example.com']);
  assertEquals(params.headers, { 'X-Custom': 'value' });
  assertEquals(params.delay, 1000);
  assertEquals(params.user_agent, 'TestBot/1.0');
  assertEquals(params.max_concurrency, 5);
  assertEquals(params.rendering_delay, 2000);
  assertEquals(params.use_sitemaps, true);
  assertEquals(params.respect_robots_txt, false);
  assertEquals(params.ignore_no_follow, true);
  assertEquals(params.cache, true);
  assertEquals(params.cache_ttl, 3600);
  assertEquals(params.cache_clear, true);
  assertEquals(params.content_formats, ['markdown', 'text']);
  assertEquals(params.extraction_rules, { '/products/*': { type: 'prompt', value: 'extract products' } });
  assertEquals(params.asp, true);
  assertEquals(params.proxy_pool, 'public_residential_pool');
  assertEquals(params.country, 'us');
  assertEquals(params.webhook_name, 'my-webhook');
  assertEquals(params.webhook_events, ['crawler_finished', 'crawler_url_failed']);
});

Deno.test('CrawlerConfig: exclude_paths and include_only_paths are mutually exclusive', () => {
  assertThrows(
    () =>
      new CrawlerConfig({
        url: 'https://example.com',
        exclude_paths: ['/foo/*'],
        include_only_paths: ['/bar/*'],
      }),
    errors.CrawlerConfigError,
    'mutually exclusive',
  );
});

Deno.test('CrawlerConfig: rendering_delay bounds are enforced', () => {
  assertThrows(
    () => new CrawlerConfig({ url: 'https://example.com', rendering_delay: -1 }),
    errors.CrawlerConfigError,
  );
  assertThrows(
    () => new CrawlerConfig({ url: 'https://example.com', rendering_delay: 25001 }),
    errors.CrawlerConfigError,
  );
  // Boundaries are inclusive
  new CrawlerConfig({ url: 'https://example.com', rendering_delay: 0 });
  new CrawlerConfig({ url: 'https://example.com', rendering_delay: 25000 });
});

Deno.test('CrawlerConfig: delay bounds are enforced', () => {
  assertThrows(
    () => new CrawlerConfig({ url: 'https://example.com', delay: -1 }),
    errors.CrawlerConfigError,
  );
  assertThrows(
    () => new CrawlerConfig({ url: 'https://example.com', delay: 15001 }),
    errors.CrawlerConfigError,
  );
});

Deno.test('CrawlerConfig: max_duration bounds are enforced', () => {
  assertThrows(
    () => new CrawlerConfig({ url: 'https://example.com', max_duration: 14 }),
    errors.CrawlerConfigError,
  );
  assertThrows(
    () => new CrawlerConfig({ url: 'https://example.com', max_duration: 10801 }),
    errors.CrawlerConfigError,
  );
  // Boundaries are inclusive
  new CrawlerConfig({ url: 'https://example.com', max_duration: 15 });
  new CrawlerConfig({ url: 'https://example.com', max_duration: 10800 });
});

Deno.test('CrawlerConfig: cache_ttl bounds are enforced', () => {
  assertThrows(
    () => new CrawlerConfig({ url: 'https://example.com', cache_ttl: -1 }),
    errors.CrawlerConfigError,
  );
  assertThrows(
    () => new CrawlerConfig({ url: 'https://example.com', cache_ttl: 604801 }),
    errors.CrawlerConfigError,
  );
});

Deno.test('CrawlerConfig: max_api_credit cannot be negative', () => {
  assertThrows(
    () => new CrawlerConfig({ url: 'https://example.com', max_api_credit: -1 }),
    errors.CrawlerConfigError,
  );
  // 0 is valid (means no limit per docs)
  new CrawlerConfig({ url: 'https://example.com', max_api_credit: 0 });
});

Deno.test('CrawlerConfig: max array sizes are enforced', () => {
  // exclude_paths max 100
  assertThrows(
    () =>
      new CrawlerConfig({
        url: 'https://example.com',
        exclude_paths: Array.from({ length: 101 }, (_, i) => `/path${i}/*`),
      }),
    errors.CrawlerConfigError,
    'exclude_paths',
  );
  // allowed_external_domains max 250
  assertThrows(
    () =>
      new CrawlerConfig({
        url: 'https://example.com',
        allowed_external_domains: Array.from({ length: 251 }, (_, i) => `domain${i}.example.com`),
      }),
    errors.CrawlerConfigError,
    'allowed_external_domains',
  );
  // allowed_internal_subdomains max 250
  assertThrows(
    () =>
      new CrawlerConfig({
        url: 'https://example.com',
        allowed_internal_subdomains: Array.from({ length: 251 }, (_, i) => `sub${i}.example.com`),
      }),
    errors.CrawlerConfigError,
    'allowed_internal_subdomains',
  );
});

Deno.test('CrawlerConfig: invalid content_formats value is rejected', () => {
  assertThrows(
    () =>
      new CrawlerConfig({
        url: 'https://example.com',
        // deno-lint-ignore no-explicit-any
        content_formats: ['markdown', 'pdf' as any],
      }),
    errors.CrawlerConfigError,
    'content_formats',
  );
});

Deno.test('CrawlerConfig: invalid webhook_events value is rejected', () => {
  assertThrows(
    () =>
      new CrawlerConfig({
        url: 'https://example.com',
        // deno-lint-ignore no-explicit-any
        webhook_events: ['crawler_finished', 'crawl.completed' as any],
      }),
    errors.CrawlerConfigError,
    'webhook_events',
  );
});

Deno.test('CrawlerConfig: unknown option is rejected', () => {
  assertThrows(
    () =>
      new CrawlerConfig({
        url: 'https://example.com',
        // deno-lint-ignore no-explicit-any
        nonsense_field: true,
      } as any),
    errors.CrawlerConfigError,
    'Invalid option',
  );
});

Deno.test('CrawlerConfig: all 8 valid webhook event names accepted', () => {
  const config = new CrawlerConfig({
    url: 'https://example.com',
    webhook_events: [
      'crawler_started',
      'crawler_url_visited',
      'crawler_url_skipped',
      'crawler_url_discovered',
      'crawler_url_failed',
      'crawler_stopped',
      'crawler_cancelled',
      'crawler_finished',
    ],
  });
  assertEquals(config.webhook_events?.length, 8);
});
