import { ScrapeConfig } from '../../src/scrapeconfig.ts';
import { CrawlerConfig } from '../../src/crawlerconfig.ts';
import { ScreenshotConfig } from '../../src/screenshotconfig.ts';
import { type ContextData, ScrapeResult } from '../../src/result.ts';
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';

const POOLS: Record<string, string> = {
  BASIC: 'basic',
  UNBLOCKER: 'unblocker',
  UNBLOCKER_ULTRA: 'unblocker_ultra',
  AUTO: 'auto',
};

const LEGACY_POOLS: Record<string, string> = {
  PUBLIC_DATACENTER_POOL: 'public_datacenter_pool',
  PUBLIC_RESIDENTIAL_POOL: 'public_residential_pool',
};

// The Tor pool is a current pool, not a name written before the proxy pools.
const TOR_POOL: Record<string, string> = { PUBLIC_TOR_POOL: 'public_tor_pool' };

Deno.test('proxy pools: statics carry the wire values, legacy names kept', () => {
  for (const [name, value] of Object.entries({ ...POOLS, ...TOR_POOL, ...LEGACY_POOLS })) {
    assertEquals((ScrapeConfig as unknown as Record<string, string>)[name], value, name);
  }
});

Deno.test('proxy pools: a pool goes out as proxy_pool with no asp key', () => {
  for (const pool of Object.values(POOLS)) {
    const config = new ScrapeConfig({ url: 'http://httpbin.dev/get', proxy_pool: pool });
    assertEquals(config.toApiParams({ key: '1234' }), {
      key: '1234',
      url: 'http://httpbin.dev/get',
      proxy_pool: pool,
    });
  }
});

Deno.test('proxy pools: the crawler sends the pool as proxy_pool with no asp key', () => {
  for (const pool of Object.values(POOLS)) {
    const params = new CrawlerConfig({ url: 'https://web-scraping.dev/products', proxy_pool: pool }).toApiParams();
    assertEquals(params.proxy_pool, pool);
    assertEquals(params.asp, undefined);
  }
});

Deno.test('proxy pools: no proxy_pool is sent unless one is set', () => {
  assertEquals('proxy_pool' in new ScrapeConfig({ url: 'http://httpbin.dev/get' }).toApiParams({ key: '1234' }), false);
  assertEquals('proxy_pool' in new CrawlerConfig({ url: 'https://web-scraping.dev/products' }).toApiParams(), false);
});

Deno.test('proxy pools: a legacy pool name goes out on its own', () => {
  const config = new ScrapeConfig({ url: 'http://httpbin.dev/get', proxy_pool: ScrapeConfig.PUBLIC_RESIDENTIAL_POOL });
  assertEquals(config.toApiParams({ key: '1234' }), {
    key: '1234',
    url: 'http://httpbin.dev/get',
    proxy_pool: 'public_residential_pool',
  });
});

Deno.test('proxy pools: a legacy pool with unblocker is unchanged', () => {
  const config = new ScrapeConfig({
    url: 'http://httpbin.dev/get',
    proxy_pool: ScrapeConfig.PUBLIC_RESIDENTIAL_POOL,
    unblocker: true,
  });
  assertEquals(config.toApiParams({ key: '1234' }), {
    key: '1234',
    url: 'http://httpbin.dev/get',
    proxy_pool: 'public_residential_pool',
    asp: true,
  });
});

Deno.test('proxy pools: a screenshot sends its pool as proxy_pool', () => {
  for (const pool of Object.values(POOLS)) {
    const config = new ScreenshotConfig({ url: 'https://web-scraping.dev/product/1', proxy_pool: pool });
    assertEquals(config.toApiParams({ key: '1234' }).proxy_pool, pool);
  }
});

Deno.test('proxy pools: a screenshot without a pool leaves the API defaults', () => {
  const config = new ScreenshotConfig({ url: 'https://web-scraping.dev/product/1' });
  assertEquals('proxy_pool' in config.toApiParams({ key: '1234' }), false);
});

// The answer names the pool the way the account reads it, in the config echo and in context.proxy alike: a legacy
// public_residential_pool order with asp=true reads unblocker_ultra. It carries no unblocker_tier: type-checked by
// deno test, the expect-error goes unused (and fails to compile) the day ConfigData declares one again.
Deno.test('proxy pools: the answer names the pool, with no unblocker_tier', async () => {
  const response = JSON.parse(await Deno.readTextFile('__tests__/data/response_html_success.json'));
  response.config.proxy_pool = 'unblocker_ultra';
  response.config.asp = true;
  response.context.proxy.pool = 'unblocker_ultra';
  response.context.proxy.network = 'residential';
  const result = new ScrapeResult(response);
  assertEquals(result.config.proxy_pool, 'unblocker_ultra');
  assertEquals(result.context.proxy.pool, 'unblocker_ultra');
  // @ts-expect-error not a config field
  assertEquals(result.config.unblocker_tier, undefined);
});

// Type-checked too: the API returns no tier field on context.proxy, so the expect-error goes unused
// (and fails to compile) the day the type declares one again.
Deno.test('proxy pools: context.proxy declares no tier field', () => {
  const proxy: ContextData['proxy'] = {
    country: 'us',
    identity: 'i',
    network: 'residential',
    pool: 'unblocker',
    // @ts-expect-error not a context.proxy field
    tier: 'unblocker',
  };
  assertEquals(proxy.pool, 'unblocker');
});
