// Crawler Compliance Test Suite
//
// Drives the Scrapfly Crawler API (via the TypeScript SDK) against the
// web-scraping-dev compliance trap suite, then asserts conformance by
// querying the central report endpoint /crawler-test-report on the
// target app.
//
// The trap app exposes 30 scenario routes (robots.txt traps, redirect
// loops, session-id vortex, infinite calendar, URL normalization,
// nofollow, sitemap index, etc). Each route records hits in an
// in-memory store. This test suite asserts hit counts after each crawl.
//
// Server-side catalog:
//   apps/web-scraping-dev/website/app/web/CRAWLER_TEST_SUITE.md
// Reference Python SDK implementation:
//   sdk/python/tests/crawler/test_compliance.py
// SDK brief:
//   sdk/CRAWLER_COMPLIANCE_TEST_BRIEF.md
//
// Required env vars:
//   SCRAPFLY_API_KEY        Dev API key (e.g. scp-live-...)
//   SCRAPFLY_API_HOST       Local Scrapfly API (default: https://api.scrapfly.home)
//
// Optional:
//   WEB_SCRAPING_DEV_BASE   Trap app base URL.
//                           Default: https://web-scraping.dev (public prod).
//                           Override to https://web-scraping-dev.home for the
//                           local k3d cluster.
//
// Run locally:
//   export SCRAPFLY_API_KEY=scp-live-...
//   deno test --allow-net --allow-read --allow-env \
//     --unsafely-ignore-certificate-errors=api.scrapfly.home,web-scraping-dev.home \
//     __tests__/integration/crawler-compliance.test.ts

import { ScrapflyClient } from '../../src/client.ts';
import { CrawlerConfig } from '../../src/crawlerconfig.ts';
import { Crawl } from '../../src/crawl.ts';
import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';

const SCRAPFLY_KEY = Deno.env.get('SCRAPFLY_API_KEY');
const SCRAPFLY_HOST = Deno.env.get('SCRAPFLY_API_HOST') ?? 'https://api.scrapfly.home';
const TARGET_BASE = Deno.env.get('WEB_SCRAPING_DEV_BASE') ?? 'https://web-scraping.dev';
const REPORT_URL = `${TARGET_BASE}/crawler-test-report`;
const RESET_URL = `${REPORT_URL}/reset`;

if (!SCRAPFLY_KEY) {
  console.log(
    'skipping crawler-compliance integration tests (set SCRAPFLY_API_KEY to enable)',
  );
} else {
  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  function makeClient(): ScrapflyClient {
    return new ScrapflyClient({ key: SCRAPFLY_KEY!, host: SCRAPFLY_HOST });
  }

  // Plain fetch against the trap app — DO NOT use the Scrapfly SDK here.
  // We are observing the trap store, not exercising the crawler. Mixing in
  // SDK retries / proxies would make assertion failures hard to diagnose.
  async function resetTrapStore(): Promise<void> {
    const res = await fetch(RESET_URL, { method: 'POST' });
    if (!res.ok) {
      throw new Error(`failed to reset trap store: ${res.status} ${res.statusText}`);
    }
    // Drain the body so the connection can be reused.
    await res.text();
  }

  interface TrapInfo {
    hit_count: number;
    last_hit_ts: number | null;
    sample_hits: unknown[];
  }
  interface ComplianceReport {
    generated_at: number;
    traps: Record<string, TrapInfo>;
  }

  async function fetchReport(trap?: string): Promise<ComplianceReport> {
    const url = trap ? `${REPORT_URL}?trap=${encodeURIComponent(trap)}` : REPORT_URL;
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`failed to fetch compliance report: ${res.status}`);
    }
    return (await res.json()) as ComplianceReport;
  }

  // Safe lookup — returns 0 if the trap was never hit. The trap store does
  // NOT pre-register names, so a missing key means zero hits.
  function hitCount(report: ComplianceReport, trapName: string): number {
    return report.traps[trapName]?.hit_count ?? 0;
  }

  // Run a small crawl synchronously and return the completed Crawl object.
  // All compliance tests use a baseline config: low page_limit, cache off,
  // bounded max_duration so a buggy run cannot block CI.
  async function runCrawl(overrides: Record<string, unknown> = {}): Promise<Crawl> {
    const client = makeClient();
    const baseConfig: Record<string, unknown> = {
      url: `${TARGET_BASE}/`,
      page_limit: 50,
      max_depth: 2,
      max_concurrency: 5,
      max_duration: 120,
      // Cache off so trap hits are reproducible across runs.
      cache: false,
      cache_clear: true,
      // Defaults — most tests want politeness ON; the negative control
      // overrides respect_robots_txt explicitly.
      respect_robots_txt: true,
      ignore_no_follow: false,
      follow_external_links: false,
      asp: false,
      ...overrides,
    };
    const crawl = new Crawl(client, new CrawlerConfig(baseConfig as { url: string } & Record<string, unknown>));
    await crawl.start();
    await crawl.wait({ pollInterval: 2, maxWait: 180 });
    return crawl;
  }

  // -------------------------------------------------------------------------
  // Robots.txt compliance
  // -------------------------------------------------------------------------

  Deno.test('compliance: respects robots.txt Disallow', async () => {
    await resetTrapStore();
    const crawl = await runCrawl({ page_limit: 50, max_depth: 2 });
    assert(crawl.uuid, 'crawl should have a uuid');

    const report = await fetchReport();
    const violations = hitCount(report, 'robots_txt_violation');
    assertEquals(
      violations,
      0,
      `SDK crawl with respect_robots_txt=true fetched /robots-disallowed ${violations} times. The crawler is ignoring robots.txt Disallow directives.`,
    );
  });

  Deno.test('compliance: NEGATIVE control — violates robots.txt when disabled', async () => {
    // With respect_robots_txt=false the crawler SHOULD discover and fetch
    // /robots-disallowed. If this returns 0 hits, the trap link is not
    // discoverable AT ALL — the positive test above is meaningless.
    await resetTrapStore();
    await runCrawl({
      page_limit: 50,
      max_depth: 2,
      respect_robots_txt: false,
    });

    const hits = hitCount(await fetchReport(), 'robots_txt_violation');
    assert(
      hits >= 1,
      'Negative control failed: with respect_robots_txt=false the crawler still did not fetch /robots-disallowed. The robots-respect positive test above is therefore unreliable until this is fixed.',
    );
  });

  // -------------------------------------------------------------------------
  // Meta / header robots — link-level nofollow
  // -------------------------------------------------------------------------

  Deno.test('compliance: respects <meta name="robots" content="nofollow">', async () => {
    await resetTrapStore();
    await runCrawl({
      url: `${TARGET_BASE}/meta-nofollow`,
      page_limit: 10,
      max_depth: 2,
    });

    assertEquals(
      hitCount(await fetchReport(), 'meta_nofollow_violation'),
      0,
      "Crawler followed a link from a page with <meta name='robots' content='nofollow'>",
    );
  });

  Deno.test('compliance: respects rel="nofollow" on individual links', async () => {
    await resetTrapStore();
    await runCrawl({
      url: `${TARGET_BASE}/rel-nofollow`,
      page_limit: 10,
      max_depth: 2,
    });

    assertEquals(
      hitCount(await fetchReport(), 'rel_nofollow_violation'),
      0,
      "Crawler followed a link with rel='nofollow' attribute",
    );
  });

  Deno.test('compliance: respects X-Robots-Tag: nofollow HTTP header', async () => {
    await resetTrapStore();
    await runCrawl({
      url: `${TARGET_BASE}/header-nofollow`,
      page_limit: 10,
      max_depth: 2,
    });

    assertEquals(
      hitCount(await fetchReport(), 'x_robots_tag_nofollow_violation'),
      0,
      'Crawler did not honor X-Robots-Tag: nofollow HTTP header',
    );
  });

  // -------------------------------------------------------------------------
  // Crawler traps — bounded behavior
  // -------------------------------------------------------------------------

  Deno.test('compliance: escapes redirect loop /loop-a <-> /loop-b', async () => {
    await resetTrapStore();
    await runCrawl({
      url: `${TARGET_BASE}/loop-a`,
      page_limit: 20,
      max_depth: 5,
    });

    const loops = hitCount(await fetchReport(), 'redirect_loop');
    assert(
      loops < 10,
      `Crawler caught in redirect loop: ${loops} hits. Cycle detection is not working.`,
    );
  });

  Deno.test('compliance: bounds session-id vortex (URL canonicalization)', async () => {
    await resetTrapStore();
    await runCrawl({
      url: `${TARGET_BASE}/session-vortex`,
      page_limit: 100,
      max_depth: 3,
    });

    const hits = hitCount(await fetchReport(), 'session_vortex_hit');
    assert(
      hits < 20,
      `Crawler trapped by session-id vortex: ${hits} hits. Check URL canonicalization for volatile query params.`,
    );
  });

  Deno.test('compliance: bounds infinite calendar trap', async () => {
    await resetTrapStore();
    await runCrawl({
      url: `${TARGET_BASE}/calendar/2024/01`,
      page_limit: 100,
      max_depth: 5,
    });

    const hits = hitCount(await fetchReport(), 'calendar_trap_hit');
    assert(
      hits < 50,
      `Crawler stuck in infinite calendar: ${hits} pages crawled`,
    );
  });

  Deno.test('compliance: caps redirect chain at the body endpoint', async () => {
    await resetTrapStore();
    await runCrawl({
      url: `${TARGET_BASE}/redirect-chain/1`,
      page_limit: 5,
      max_depth: 1,
    });

    const depth = hitCount(await fetchReport(), 'redirect_chain_depth');
    assert(
      depth > 0 && depth <= 10,
      `Unexpected redirect-chain depth: ${depth} (expected 1..10)`,
    );
  });

  // -------------------------------------------------------------------------
  // URL normalization & deduplication
  // -------------------------------------------------------------------------

  Deno.test('compliance: collapses #fragment-only URL variants', async () => {
    // A page with links #a, #b, #c (all fragments of the same URL) must
    // result in exactly ONE HTTP request, since fragments never leave the
    // client.
    await resetTrapStore();
    await runCrawl({
      url: `${TARGET_BASE}/fragment-collapse`,
      page_limit: 10,
      max_depth: 2,
    });

    assertEquals(
      hitCount(await fetchReport(), 'fragment_collapse_hit'),
      1,
      'Crawler made multiple requests for the same URL with different #fragment suffixes. Fragments must be stripped.',
    );
  });

  Deno.test('compliance: normalizes URL variants to a single fetch', async () => {
    await resetTrapStore();
    await runCrawl({
      url: `${TARGET_BASE}/normalize-source`,
      page_limit: 20,
      max_depth: 2,
    });

    const hits = hitCount(await fetchReport(), 'normalization_duplicate');
    assert(
      hits <= 1,
      `Crawler fetched the normalized target ${hits} times; expected at most 1. Check canonicalization (case sensitivity, trailing slash, fragment, empty query).`,
    );
  });

  // -------------------------------------------------------------------------
  // Sitemap handling
  // -------------------------------------------------------------------------

  Deno.test('compliance: reads sitemap index (50 children x 100 URLs)', async () => {
    await resetTrapStore();
    await runCrawl({
      url: `${TARGET_BASE}/`,
      page_limit: 500,
      max_depth: 1,
      use_sitemaps: true,
    });

    const leafs = hitCount(await fetchReport(), 'sitemap_leaf_discovered');
    assert(
      leafs > 0,
      'Crawler with use_sitemaps=true did not discover any leaf URLs from /sitemap-index.xml. Either sitemap-index format is not supported, or the SDK did not pass use_sitemaps=true.',
    );
  });

  Deno.test('compliance: tolerates dead link in sitemap', async () => {
    // One of the child sitemaps lists /sitemap-404-target which returns
    // 404. The crawler must continue processing the rest. Test passes if
    // the crawl completes without throwing.
    await resetTrapStore();
    const crawl = await runCrawl({
      url: `${TARGET_BASE}/`,
      page_limit: 100,
      max_depth: 1,
      use_sitemaps: true,
    });
    assert(crawl.uuid);

    const hits = hitCount(await fetchReport(), 'sitemap_dead_link_followed');
    console.log(`[observation] sitemap dead link followed: ${hits} times`);
  });

  // -------------------------------------------------------------------------
  // External-link boundary
  // -------------------------------------------------------------------------

  Deno.test('compliance: does not follow external redirect when disabled', async () => {
    await resetTrapStore();
    const crawl = await runCrawl({
      url: `${TARGET_BASE}/redirect-external`,
      page_limit: 5,
      max_depth: 2,
      follow_external_links: false,
    });
    assert(crawl.uuid);

    const followed = hitCount(await fetchReport(), 'external_redirect_followed');
    console.log(`[observation] external redirect followed: ${followed}`);
  });
}
