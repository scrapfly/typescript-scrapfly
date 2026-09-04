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
    'Provide one of: url, url_list, remote_url_list',
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

Deno.test('CrawlerConfig: all valid webhook event names accepted', () => {
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
      'crawler_search_ready',
      'crawler_search_failed',
      'crawler_updated',
    ],
  });
  assertEquals(config.webhook_events?.length, 11);
  assertEquals(config.toApiParams().webhook_events?.length, 11);
});

Deno.test('CrawlerConfig: search serializes to the wire payload', () => {
  const config = new CrawlerConfig({ url: 'https://example.com', search: true });
  assertEquals(config.toApiParams().search, true);
});

Deno.test('CrawlerConfig: search is omitted when off', () => {
  // Unset means server default: never emit a field to send its default.
  const config = new CrawlerConfig({ url: 'https://example.com' });
  assertEquals(config.toApiParams().search, undefined);
});

Deno.test('CrawlerConfig: search survives the validateOptions allowlist', () => {
  // A key missing from validKeys throws 'Invalid option provided'; a key
  // missing from toApiParams' fields array is dropped silently. Both are
  // covered by the two assertions here.
  const config = new CrawlerConfig({ url: 'https://example.com', search: false });
  assertEquals(config.search, false);
  assertEquals(config.toApiParams().search, false);
});

Deno.test('CrawlerConfig: refresh fields serialize to the wire payload', () => {
  const config = new CrawlerConfig({ url: 'https://example.com', refresh: true, refresh_interval: 86400 });
  assertEquals(config.toApiParams().refresh, true);
  assertEquals(config.toApiParams().refresh_interval, 86400);
});

Deno.test('CrawlerConfig: refresh fields are omitted when off', () => {
  // Unset means server default: never emit a field to send its default.
  const config = new CrawlerConfig({ url: 'https://example.com' });
  assertEquals(config.toApiParams().refresh, undefined);
  assertEquals(config.toApiParams().refresh_interval, undefined);
});

Deno.test('CrawlerConfig: refresh without an interval uses the server period', () => {
  const config = new CrawlerConfig({ url: 'https://example.com', refresh: true });
  assertEquals(config.toApiParams().refresh, true);
  assertEquals(config.toApiParams().refresh_interval, undefined);
});

Deno.test('CrawlerConfig: refresh survives the validateOptions allowlist', () => {
  // A key missing from validKeys throws 'Invalid option provided'; a key
  // missing from toApiParams' fields array is dropped silently. Both are
  // covered by the two assertions here.
  const config = new CrawlerConfig({ url: 'https://example.com', refresh: false });
  assertEquals(config.refresh, false);
  assertEquals(config.toApiParams().refresh, false);
});

Deno.test('CrawlerConfig: refresh_interval outside the bounds is refused', () => {
  // The floor decides the cost; reject before a round trip.
  for (const refresh_interval of [1, 3599, 90 * 24 * 3600 + 1]) {
    assertThrows(
      () => new CrawlerConfig({ url: 'https://example.com', refresh: true, refresh_interval }),
      errors.CrawlerConfigError,
      'refresh_interval must be between',
    );
  }
  for (const refresh_interval of [3600, 86400, 90 * 24 * 3600]) {
    const config = new CrawlerConfig({ url: 'https://example.com', refresh: true, refresh_interval });
    assertEquals(config.toApiParams().refresh_interval, refresh_interval);
  }
});

Deno.test('CrawlerConfig: refresh_interval without refresh is refused', () => {
  // A period with the feature off would silently never run.
  assertThrows(
    () => new CrawlerConfig({ url: 'https://example.com', refresh_interval: 86400 }),
    errors.CrawlerConfigError,
    'refresh_interval requires refresh: true',
  );
});

// `unblocker` is the customer-facing name for the anti-bot bypass; `asp` is the
// permanently supported deprecated alias. The POST /crawl body key stays `asp`
// for both names.
Deno.test('CrawlerConfig: unblocker is serialized as asp', () => {
  const config = new CrawlerConfig({ url: 'https://example.com', unblocker: true });
  assertEquals(config.unblocker, true);
  assertEquals(config.asp, true);
  const params = config.toApiParams();
  assertEquals(params.asp, true);
  // The new name must not reach the wire until the API has learned it.
  assertEquals(Object.keys(params).includes('unblocker'), false);
});

Deno.test('CrawlerConfig: unblocker false omits the key, as in every other SDK', () => {
  // Off means the key is ABSENT, not `asp: false`. Python, Go and Rust all omit
  // it, and the API's resolveAsp (pkg/crawler/config.go) cannot tell a
  // present-false from an absent pair, so one shape is carried by all four.
  const params = new CrawlerConfig({ url: 'https://example.com', unblocker: false }).toApiParams();
  assertEquals(Object.keys(params).includes('asp'), false);
  assertEquals(Object.keys(params).includes('unblocker'), false);
});

Deno.test('CrawlerConfig: explicit asp wins over unblocker', () => {
  // asp:false is an explicit "off" and must not be overridden by unblocker.
  const off = new CrawlerConfig({ url: 'https://example.com', asp: false, unblocker: true });
  assertEquals(off.unblocker, false);
  assertEquals(Object.keys(off.toApiParams()).includes('asp'), false);

  const on = new CrawlerConfig({ url: 'https://example.com', asp: true, unblocker: false });
  assertEquals(on.unblocker, true);
  assertEquals(on.toApiParams().asp, true);
});

Deno.test('CrawlerConfig: neither name supplied stays unset', () => {
  // Dropped from the body so the server applies its own default.
  const config = new CrawlerConfig({ url: 'https://example.com' });
  assertEquals(config.asp, undefined);
  assertEquals(config.unblocker, undefined);
  assertEquals(Object.keys(config.toApiParams()).includes('asp'), false);
});

Deno.test('CrawlerConfig: unblocker and asp are one value after construction', () => {
  const config = new CrawlerConfig({ url: 'https://example.com' });
  config.unblocker = true;
  assertEquals(config.asp, true);
  assertEquals(config.toApiParams().asp, true);

  // Turning it back off through the deprecated name must still turn it off.
  config.asp = false;
  assertEquals(config.unblocker, false);
  assertEquals(Object.keys(config.toApiParams()).includes('asp'), false);
});

// ===========================================================================
// unblocker <-> asp PARITY MATRIX
//
// The guarantee a customer migrating from `asp` to `unblocker` relies on is
// stronger than "unblocker is serialized as asp": FOR EVERY CASE THE TWO NAMES
// MUST BEHAVE EXACTLY THE SAME. A targeted assertion on the `asp` key cannot
// prove that — the two names could still diverge in another body field, in
// stored instance state, or in whether validateOptions accepts them. Every
// test below compares WHOLE bodies of two configs that differ only in which
// name was used, so a divergence anywhere fails it.
// ===========================================================================

/**
 * `toApiParams()` as a key-sorted entry list. Sorting is only so that a
 * difference in key ORDER cannot raise a false failure; a difference in any
 * key or any value still fails.
 */
function crawlerParamEntries(config: CrawlerConfig): Array<[string, unknown]> {
  return Object.entries(config.toApiParams()).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
}

/**
 * A whole-body comparison is only as strong as the body has fields to diverge
 * in. If the fixture is ever trimmed, or the serializer regresses to emitting
 * almost nothing, every equality below would still pass while its name claimed
 * it compared "byte-identical bodies". This floor stops that; the Go SDK's
 * matrix carries the same guard (`len(legacy) < 25`).
 */
const MIN_LOADED_BODY_KEYS = 25;

function assertNotVacuous(entries: Array<[string, unknown]>, what: string) {
  assertEquals(
    entries.length >= MIN_LOADED_BODY_KEYS,
    true,
    `${what} emits only ${entries.length} keys (${entries.map(([k]) => k).join(', ')}); a whole-output ` +
      `comparison over that proves almost nothing. Expected at least ${MIN_LOADED_BODY_KEYS}.`,
  );
}

/**
 * One deliberately rich option set — everything CrawlerConfig serializes except
 * the anti-bot toggle — plus whatever the caller passes for the toggle. Rich
 * rather than minimal on purpose: whole-body equality between two of these then
 * covers every other field the rename could have disturbed, not just the one
 * key under test.
 */
function crawlerConfigWith(toggle: { asp?: boolean; unblocker?: boolean }): CrawlerConfig {
  return new CrawlerConfig({
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
    headers: { 'X-Parity': 'yes' },
    delay: 1000,
    user_agent: 'ParityBot/1.0',
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
    search: true,
    refresh: true,
    refresh_interval: 86400,
    proxy_pool: 'public_residential_pool',
    country: 'us',
    webhook_name: 'parity-webhook',
    webhook_events: ['crawler_finished', 'crawler_url_failed'],
    ...toggle,
  });
}

Deno.test('parity: asp and unblocker emit byte-identical bodies (enabled)', () => {
  const viaAsp = crawlerConfigWith({ asp: true });
  const viaUnblocker = crawlerConfigWith({ unblocker: true });
  assertNotVacuous(crawlerParamEntries(viaAsp), 'loaded crawl body');
  // Whole emitted body, not just the one key.
  assertEquals(crawlerParamEntries(viaUnblocker), crawlerParamEntries(viaAsp));
  // The wire value the whole comparison hinges on, pinned explicitly so a
  // both-sides-broken regression (neither emits it) cannot pass silently.
  assertEquals(viaAsp.toApiParams().asp, true);
  assertEquals(viaUnblocker.toApiParams().asp, true);
});

Deno.test('parity: asp and unblocker emit byte-identical bodies (disabled)', () => {
  const viaAsp = crawlerConfigWith({ asp: false });
  const viaUnblocker = crawlerConfigWith({ unblocker: false });
  assertNotVacuous(crawlerParamEntries(viaAsp), 'loaded crawl body');
  assertEquals(crawlerParamEntries(viaUnblocker), crawlerParamEntries(viaAsp));
  // Off means the key is absent, under BOTH names — the same shape the scrape
  // config and the Python / Go / Rust SDKs use.
  assertEquals(Object.keys(viaAsp.toApiParams()).includes('asp'), false);
  assertEquals(Object.keys(viaUnblocker.toApiParams()).includes('asp'), false);
});

Deno.test('parity: asp and unblocker leave identical stored state', () => {
  // The emitted body is one view of the config; the instance itself is another.
  // A second storage slot for the new name, or a key present under one name and
  // absent under the other, shows up here and nowhere else.
  for (const value of [true, false]) {
    const viaAsp = crawlerConfigWith({ asp: value });
    const viaUnblocker = crawlerConfigWith({ unblocker: value });
    assertEquals(Object.keys(viaUnblocker).sort(), Object.keys(viaAsp).sort());
    assertEquals(viaUnblocker, viaAsp);
    // `unblocker` is an accessor on the prototype, so it must never show up as
    // an own key — the field loop in toApiParams would otherwise be able to
    // pick up a duplicate of `asp`.
    assertEquals(Object.keys(viaUnblocker).includes('unblocker'), false);
  }
});

/**
 * The full truth table with BOTH names in play.
 *
 * Precedence: an explicitly supplied `asp` wins; `unblocker` is consulted only
 * when `asp` was not supplied. Never OR-ed — an explicit `false` on the winning
 * name turns the feature off even when the other name says true.
 *
 * `wireAsp` is the value expected under the `asp` key, `undefined` meaning the
 * key is dropped from the body so the server applies its own default. Only
 * `true` is ever emitted: an off toggle drops the key, the same shape the
 * Python, Go and Rust SDKs emit for these rows.
 *
 * CROSS-SDK NOTE on the two conflict rows. Python, TypeScript and Rust all
 * resolve `asp: false, unblocker: true` to OFF, as pinned here. GO ANSWERS ON
 * for that one row: its `ASP` field is a plain `bool`, so a supplied `false` is
 * byte-identical to the zero value and cannot be honoured. That divergence is
 * documented in go/unblocker.go and go/README.md, and the Go test row that pins
 * it is named GO_LANGUAGE_FORCED_EXCEPTION_documented_divergence_not_a_bug. It
 * is the ONLY cell where the four SDKs disagree.
 */
const CRAWLER_TRUTH_TABLE: Array<{
  name: string;
  options: { asp?: boolean; unblocker?: boolean };
  resolved: boolean | undefined;
  wireAsp: true | undefined;
}> = [
  { name: 'neither supplied', options: {}, resolved: undefined, wireAsp: undefined },
  { name: 'unblocker only, true', options: { unblocker: true }, resolved: true, wireAsp: true },
  { name: 'unblocker only, false', options: { unblocker: false }, resolved: false, wireAsp: undefined },
  { name: 'asp only, true', options: { asp: true }, resolved: true, wireAsp: true },
  { name: 'asp only, false', options: { asp: false }, resolved: false, wireAsp: undefined },
  { name: 'both true (agree)', options: { asp: true, unblocker: true }, resolved: true, wireAsp: true },
  { name: 'both false (agree)', options: { asp: false, unblocker: false }, resolved: false, wireAsp: undefined },
  // Conflicts: the explicitly supplied `asp` decides, in both directions.
  {
    name: 'conflict asp=false unblocker=true -> asp wins, off',
    options: { asp: false, unblocker: true },
    resolved: false,
    wireAsp: undefined,
  },
  {
    name: 'conflict asp=true unblocker=false -> asp wins, on',
    options: { asp: true, unblocker: false },
    resolved: true,
    wireAsp: true,
  },
  // `??` tests "supplied", not truthiness: an explicit `undefined` for `asp` is
  // NOT a supplied value, so `unblocker` still decides. This is what makes
  // `{ ...opts, asp: opts.asp }` spread-forwarding safe for callers.
  {
    name: 'asp: undefined is not supplied, unblocker decides',
    options: { asp: undefined, unblocker: true },
    resolved: true,
    wireAsp: true,
  },
];

/**
 * Each row runs against BOTH a bare config and the loaded fixture: a defect
 * that only fires when a conflicting name pair coexists with other populated
 * options is invisible against `{ url }` alone.
 */
const CRAWLER_TRUTH_TABLE_BASES: Array<{
  label: string;
  build: (options: { asp?: boolean; unblocker?: boolean }) => CrawlerConfig;
}> = [
  { label: 'minimal', build: (options) => new CrawlerConfig({ url: 'https://example.com', ...options }) },
  { label: 'loaded', build: (options) => crawlerConfigWith(options) },
];

for (const row of CRAWLER_TRUTH_TABLE) {
  for (const base of CRAWLER_TRUTH_TABLE_BASES) {
    Deno.test(`truth table (crawler, ${base.label}): ${row.name}`, () => {
      const config = base.build(row.options);
      assertEquals(config.asp, row.resolved);
      assertEquals(config.unblocker, row.resolved);

      const params = config.toApiParams();
      assertEquals(params.asp, row.wireAsp);
      assertEquals(Object.keys(params).includes('asp'), row.wireAsp !== undefined);
      assertEquals(Object.keys(params).includes('unblocker'), false);
      if (base.label === 'loaded') {
        assertNotVacuous(crawlerParamEntries(config), 'loaded crawl body');
      }
    });
  }
}

Deno.test('truth table (crawler): rows with the same outcome are indistinguishable', () => {
  // Stronger than the per-row assertions: every row that RESOLVES to the same
  // outcome must produce the SAME whole body, whichever name (or pair of names)
  // got the caller there. A per-row assertion on `asp` would still pass if two
  // rows agreed on the toggle and diverged in some other field. Ported from the
  // Rust matrix (`unblocker_matrix_rows_with_the_same_outcome_are_indistinguishable`).
  for (const outcome of [true, undefined]) {
    const rows = CRAWLER_TRUTH_TABLE.filter((row) => row.wireAsp === outcome);
    assertEquals(rows.length >= 3, true, 'the grouping is only meaningful with several rows per outcome');
    const baseline = crawlerParamEntries(crawlerConfigWith(rows[0].options));
    assertNotVacuous(baseline, 'loaded crawl body');
    for (const row of rows.slice(1)) {
      assertEquals(
        crawlerParamEntries(crawlerConfigWith(row.options)),
        baseline,
        `row "${row.name}" diverged from "${rows[0].name}" although both resolve to wireAsp=${outcome}`,
      );
    }
  }
});

// Kept as its own case: the resolved STATE is tri-state on the crawler
// (undefined / false / true) even though only `true` reaches the body, so the
// grouping above is by wire outcome and this pins the state column.
for (const row of CRAWLER_TRUTH_TABLE) {
  Deno.test(`truth table (crawler): ${row.name}`, () => {
    const config = new CrawlerConfig({ url: 'https://example.com', ...row.options });
    // Resolved outcome, readable under either name — both must agree.
    assertEquals(config.asp, row.resolved);
    assertEquals(config.unblocker, row.resolved);

    const params = config.toApiParams();
    // Emitted wire key and value. Only `true` reaches the body; both "off" and
    // "not supplied" drop the key, so the four SDKs emit one shape.
    assertEquals(params.asp, row.wireAsp);
    assertEquals(Object.keys(params).includes('asp'), row.wireAsp !== undefined);
    // The new name NEVER reaches the wire, whichever name went in.
    assertEquals(Object.keys(params).includes('unblocker'), false);
  });
}

Deno.test('parity: validateOptions accepts each name on its own', () => {
  for (const options of [{ asp: true }, { unblocker: true }, { asp: false }, { unblocker: false }]) {
    const config = new CrawlerConfig({ url: 'https://example.com', ...options });
    assertEquals(typeof config.asp, 'boolean');
  }
  // Negative control: the allow-list really is enforced, so the two passes
  // above are evidence and not a no-op.
  assertThrows(
    () => new CrawlerConfig({ url: 'https://example.com', unblock: true } as any),
    errors.CrawlerConfigError,
    'Invalid option provided: unblock',
  );
});

Deno.test('parity: post-construction mutation agrees in both directions', () => {
  // Setting one name and reading the other must agree BOTH ways, and each
  // mutation must reach the wire.
  const config = new CrawlerConfig({ url: 'https://example.com' });

  config.unblocker = true;
  assertEquals(config.asp, true);
  assertEquals(config.toApiParams().asp, true);

  config.asp = false;
  assertEquals(config.unblocker, false);
  assertEquals(Object.keys(config.toApiParams()).includes('asp'), false);

  config.asp = true;
  assertEquals(config.unblocker, true);
  assertEquals(config.toApiParams().asp, true);

  config.unblocker = false;
  assertEquals(config.asp, false);
  assertEquals(Object.keys(config.toApiParams()).includes('asp'), false);

  // Back to unset through either name drops the key again.
  config.unblocker = undefined;
  assertEquals(config.asp, undefined);
  assertEquals(Object.keys(config.toApiParams()).includes('asp'), false);
});

Deno.test('parity: mutating either name converges on identical bodies', () => {
  // Same equivalence as at construction, but reached by assignment: two configs
  // built without the toggle, then switched through different names, must emit
  // the same whole body.
  for (const value of [true, false]) {
    const mutatedAsp = crawlerConfigWith({});
    const mutatedUnblocker = crawlerConfigWith({});
    mutatedAsp.asp = value;
    mutatedUnblocker.unblocker = value;
    assertEquals(crawlerParamEntries(mutatedUnblocker), crawlerParamEntries(mutatedAsp));
    // ...and identical to having passed that name to the constructor.
    assertEquals(crawlerParamEntries(mutatedUnblocker), crawlerParamEntries(crawlerConfigWith({ asp: value })));
  }
});
