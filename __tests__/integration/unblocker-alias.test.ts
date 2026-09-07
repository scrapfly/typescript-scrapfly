// Integration tests for the `unblocker` <-> `asp` alias against a real Scrapfly server.
//
// The unit parity matrix (__tests__/config/scrape.test.ts) proves the SDK builds
// the same query string for both names. It stops at the serializer. This module
// proves the other half: that a scrape driven through the real client, over the
// wire, to a real API, produces the SAME OBSERVED OUTCOME under either name.
//
// WHAT THE SDK LEGS PROVE, AND WHAT THEY DO NOT. Be precise, because the obvious
// reading is wrong. `ScrapeConfig` collapses `unblocker` into the single stored
// `asp` slot at construction (`scrapeconfig.ts`: `this.asp = options.asp ??
// options.unblocker ?? this.asp`), and the wire key is frozen at `asp`. So legs
// 1 and 2 put a BYTE-IDENTICAL request on the wire, as do legs 3 and 4. The SDK
// matrix proves the client folds both names onto one key and that the API
// honours that key. It does NOT prove the API still honours the `unblocker`
// SPELLING, because no SDK leg ever sends it.
//
// That spelling is a separate code path in the API itself: it reads the `asp`
// query parameter first and falls back to `unblocker` when `asp` is absent.
//
// It is what a customer on a raw HTTP client depends on, and the API silently
// ignores query params it does not recognise, so deleting it would make
// `unblocker=true` return an UNPROTECTED, billed scrape. Leg 5 is the only leg
// that covers it: it bypasses the SDK's fold and puts `unblocker=true` on the
// wire with no `asp` key. Delete that server-side fallback and leg 5 — and only
// leg 5 — goes red.
//
// GATING: both `SCRAPFLY_API_KEY` and `SCRAPFLY_API_HOST` must be set. There is
// deliberately no default host — a non-resolvable placeholder does not
// resolve, so a developer who exported only the key would get a wall of red that
// reads like an alias regression. The tests are REGISTERED either way and use
// Deno's own `ignore` flag, so a credential-less run reports `ignored` in the
// summary rather than silently registering zero tests: a gating expression that
// breaks later must show up as tests that stopped running, not as a file that
// quietly vanished from the count.
//
// COST, MEASURED RATHER THAN ASSUMED: on this shieldless target the anti-bot
// legs cost the same as the disabled ones. `context.cost` came back
// `{total: 1, details: [PROXY_DATACENTER_NETWORK]}` for an `unblocker=true`
// scrape of httpbin.dev, with no anti-bot line item — the ASP surcharge applies
// when a shield is actually engaged, which httpbin.dev does not do. The fixed
// leg count is therefore discipline about not hammering a live account, not a
// credit constraint. The no-retry rule still matters for a different reason: a
// retry would hide a genuine alias failure behind a second attempt.
//
// The call count is enforced at the socket, not above it. `client.fetch` IS
// `fetchRetry` (src/client.ts), and `fetchRetry` re-issues on any 5xx up to
// `retries` times INSIDE one invocation — so wrapping `client.fetch` from the
// outside counts logical legs, never HTTP requests. Here retries are disabled
// for the matrix (`fetchRetry(config, 1)`) and `globalThis.fetch` is counted
// independently, so the advertised number is the number that was billed.
//
// Set `SCRAPFLY_SKIP_BILLABLE=1` to run only the two cheap legs while debugging
// the harness. The equivalence tests then FAIL-FAST with an explicit message
// rather than passing, so a harness-only run can never read as a green verdict.
//
// An endpoint whose certificate the system store cannot verify needs that root
// handed to Deno — pass `--cert <pem>` (or `DENO_TLS_CA_STORE=system` when the
// root is already in the machine trust store). Certificate verification stays
// ON; `--unsafely-ignore-certificate-errors` is NOT required.
//
//   export SCRAPFLY_API_KEY=scp-live-...
//   export SCRAPFLY_API_HOST=https://api.scrapfly.io
//   deno test --allow-net --allow-env --allow-read \
//     __tests__/integration/unblocker-alias.test.ts

import { ScrapflyClient } from '../../src/client.ts';
import { ScrapeConfig } from '../../src/scrapeconfig.ts';
import { ScrapeResult } from '../../src/result.ts';
import { fetchRetry } from '../../src/utils.ts';
import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';

const SCRAPFLY_KEY = Deno.env.get('SCRAPFLY_API_KEY');
const SCRAPFLY_HOST = Deno.env.get('SCRAPFLY_API_HOST')?.replace(/\/+$/, '');
const SKIP_BILLABLE = Deno.env.get('SCRAPFLY_SKIP_BILLABLE') === '1';

/** Both variables are required; either one missing means "skip", never "fail". */
const CREDENTIALS_MISSING = !SCRAPFLY_KEY || !SCRAPFLY_HOST;

if (CREDENTIALS_MISSING) {
  console.log(
    'skipping unblocker/asp alias integration tests: set BOTH SCRAPFLY_API_KEY and SCRAPFLY_API_HOST ' +
      '(there is no default host — a non-resolving placeholder would fail rather than skip)',
  );
}

// Small, stable and cheap. The assertion is about the anti-bot toggle the API
// parsed, not about defeating anything, so the target only has to answer 200.
const TARGET_URL = 'https://httpbin.dev/html';

// The account running this matrix may carry a throttle rule on the target host
// (a sliding-window limit on rate and concurrency, reported under
// `context.throttler`). Five sequential legs do not reliably fit in it, and the
// slot is not released the instant a response is handed back. Pacing keeps the
// matrix observable; it softens no assertion and re-sends no leg.
const LEG_PACING_MS = 12_000;

// Keys the API stamps per request. They differ between any two calls by
// construction, so they are excluded from the whole-config comparison; every
// other echoed key must match for the two names to be indistinguishable.
const PER_REQUEST_CONFIG_KEYS = ['uuid', 'request_id', 'log_eviction_date'] as const;

/** Strip the API key out of anything headed for test output or an error message. */
function redact(text: string): string {
  if (!SCRAPFLY_KEY) return text;
  return text.replaceAll(SCRAPFLY_KEY, 'scp-live-***REDACTED***').replace(/key=[^&]*/g, 'key=***');
}

/**
 * A throttle refusal is the API declining to produce a data point — the scrape
 * never executed and nothing was billed. Reporting it as "leg asp=true FAILED"
 * sends a reader off to debug an alias that is fine.
 */
function isThrottleRefusal(error: unknown): boolean {
  const text = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  return text.includes('ERR::THROTTLE') || text.includes('429') || text.includes('TooManyConcurrentRequests');
}

/** One executed leg of the matrix, recorded as observed at the API. */
type Leg = {
  /** Human label, e.g. `unblocker=true`. */
  readonly name: string;
  /** Every URL the SDK's HTTP layer was actually asked to fetch, in order. */
  readonly requestUrls: readonly string[];
  /** `config.asp` echoed back by the API — the frozen response-side name. */
  readonly echoedAsp: boolean;
  /** Whole echoed config, minus the per-request keys above. */
  readonly echoedConfig: Record<string, unknown>;
  readonly statusCode: number;
  readonly success: boolean;
  readonly uuid: string;
  readonly costTotal: number;
  readonly costCodes: string;
};

function stripPerRequestKeys(config: Record<string, unknown>): Record<string, unknown> {
  const copy: Record<string, unknown> = { ...config };
  for (const key of PER_REQUEST_CONFIG_KEYS) delete copy[key];
  return copy;
}

/** Counts every request that actually reaches the network, below any retry loop. */
let socketRequests = 0;
const nativeFetch = globalThis.fetch;
function countSocketRequests(): void {
  if (globalThis.fetch !== nativeFetch) return;
  globalThis.fetch = ((...args: Parameters<typeof nativeFetch>) => {
    socketRequests += 1;
    return nativeFetch(...args);
  }) as typeof fetch;
}

/**
 * Drive one real scrape and record what the API reported back.
 *
 * `client.fetch` is replaced rather than reimplemented, so the URL recorded is
 * the one the SDK genuinely put on the wire — not a second derivation of
 * `toApiParams`, which would only restate the unit matrix. Retries are pinned
 * to 1: `fetchRetry` would otherwise re-issue a billable scrape up to three
 * times inside a single recorded invocation, and the matrix's whole design
 * constraint is an exact call count.
 */
async function runLeg(name: string, toggle: { asp?: boolean; unblocker?: boolean }): Promise<Leg> {
  const client = new ScrapflyClient({ key: SCRAPFLY_KEY!, host: SCRAPFLY_HOST! });
  const requestUrls: string[] = [];
  client.fetch = ((config, ..._rest) => {
    requestUrls.push(config.url);
    return fetchRetry(config, 1);
  }) as typeof client.fetch;

  let result;
  try {
    result = await client.scrape(new ScrapeConfig({ url: TARGET_URL, ...toggle }));
  } catch (error) {
    const detail = redact(error instanceof Error ? `${error.name}: ${error.message}` : String(error));
    if (isThrottleRefusal(error)) {
      throw new Error(
        `leg ${name} was THROTTLED before it ran, so this is an environment limit and ` +
          `NOT an asp/unblocker divergence: ${detail}`,
      );
    }
    throw new Error(`leg ${name} FAILED at the API: ${detail}`);
  }

  // `scrape` only returns a raw Response in proxified mode, which this matrix
  // never enables; narrow explicitly rather than casting.
  if (!(result instanceof ScrapeResult)) {
    throw new Error(`leg ${name}: expected a ScrapeResult, got a raw Response`);
  }

  const cost = result.context?.cost;
  const leg: Leg = {
    name,
    requestUrls,
    echoedAsp: (result.config as unknown as Record<string, unknown>).asp as boolean,
    echoedConfig: stripPerRequestKeys(result.config as unknown as Record<string, unknown>),
    statusCode: result.result.status_code,
    success: result.result.success,
    uuid: result.uuid,
    costTotal: cost?.total ?? -1,
    costCodes: (cost?.details ?? []).map((d: { code: string }) => d.code).join(','),
  };
  console.log(
    `leg ${name}: uuid=${leg.uuid} http=${leg.statusCode} success=${leg.success} ` +
      `echoed config.asp=${leg.echoedAsp} cost=${leg.costTotal} [${leg.costCodes}] ` +
      `query=${redact(new URL(requestUrls[0]).search)}`,
  );
  return leg;
}

/** The API-side alias leg: `unblocker` on the wire, no SDK folding. */
type RawLeg = {
  readonly url: string;
  readonly httpStatus: number;
  readonly echoedAsp: unknown;
  readonly upstreamStatus: number;
  readonly success: boolean;
  readonly uuid: string;
};

/**
 * Send `unblocker=true` with no `asp` key at all and read back what the API
 * parsed. `ScrapeConfig` cannot express this request — it resolves `unblocker`
 * into `asp` at construction — so the URL is assembled by hand and sent through
 * the same fetch layer.
 */
async function runRawAliasLeg(): Promise<RawLeg> {
  const params = new URLSearchParams({
    key: SCRAPFLY_KEY!,
    url: TARGET_URL,
    // An `asp` key of any value wins the server-side precedence rule, and the
    // alias fallback would never be reached.
    unblocker: 'true',
  });
  const url = `${SCRAPFLY_HOST}/scrape?${params.toString()}`;

  const response = await fetchRetry({ url, method: 'GET', headers: { accept: 'application/json' } }, 1);
  const text = await response.text();

  let body: Record<string, never>;
  try {
    body = JSON.parse(text);
  } catch {
    throw new Error(`leg raw unblocker=true: API answered HTTP ${response.status} with non-JSON: ${redact(text.slice(0, 400))}`);
  }

  const leg: RawLeg = {
    url,
    httpStatus: response.status,
    echoedAsp: (body.config ?? {})['asp'],
    upstreamStatus: (body.result ?? {})['status_code'],
    success: (body.result ?? {})['success'],
    uuid: body['uuid'],
  };
  console.log(
    `leg raw unblocker=true: uuid=${leg.uuid} api_http=${leg.httpStatus} upstream=${leg.upstreamStatus} ` +
      `success=${leg.success} echoed config.asp=${leg.echoedAsp} query=${redact(new URL(url).search)}`,
  );
  return leg;
}

type Matrix = {
  unblockerTrue: Leg | null;
  aspTrue: Leg | null;
  unblockerFalse: Leg;
  aspFalse: Leg;
  rawUnblocker: RawLeg | null;
};

let matrixOnce: Promise<Matrix> | null = null;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Executes the legs once per process; every test case shares the result. */
function matrix(): Promise<Matrix> {
  if (matrixOnce === null) {
    matrixOnce = (async () => {
      countSocketRequests();
      if (SKIP_BILLABLE) {
        console.log(
          'SCRAPFLY_SKIP_BILLABLE=1 — the anti-bot legs are NOT running; the equivalence ' +
            'claim and the API-side alias are NOT being exercised by this run',
        );
      }

      // Billable — a real anti-bot scrape.
      const unblockerTrue = SKIP_BILLABLE ? null : await runLeg('unblocker=true', { unblocker: true });
      if (!SKIP_BILLABLE) await sleep(LEG_PACING_MS);
      // Billable — a real anti-bot scrape.
      const aspTrue = SKIP_BILLABLE ? null : await runLeg('asp=true', { asp: true });
      if (!SKIP_BILLABLE) await sleep(LEG_PACING_MS);
      // Cheap.
      const unblockerFalse = await runLeg('unblocker=false', { unblocker: false });
      await sleep(LEG_PACING_MS);
      // Cheap.
      const aspFalse = await runLeg('asp=false', { asp: false });
      // Billable — and the only leg that shows the API the new spelling.
      let rawUnblocker: RawLeg | null = null;
      if (!SKIP_BILLABLE) {
        await sleep(LEG_PACING_MS);
        rawUnblocker = await runRawAliasLeg();
      }

      return { unblockerTrue, aspTrue, unblockerFalse, aspFalse, rawUnblocker };
    })();
  }
  return matrixOnce;
}

/** Guard: the anti-bot legs must actually have run before anything asserts on them. */
function requireBillable<T>(leg: T | null, name: string): T {
  if (leg === null) {
    throw new Error(
      `leg ${name} did not run (SCRAPFLY_SKIP_BILLABLE=1). This test asserts the alias ` +
        'equivalence and cannot pass without it — unset SCRAPFLY_SKIP_BILLABLE to run the matrix.',
    );
  }
  return leg;
}

/** A leg passes only on a real 200 — two identical failures prove nothing. */
function assertSucceeded(leg: Leg): void {
  assertEquals(leg.success, true, `leg ${leg.name}: scrape did not succeed`);
  assertEquals(leg.statusCode, 200, `leg ${leg.name}: expected upstream HTTP 200`);
}

const integration = (name: string, fn: () => Promise<void>) =>
  Deno.test({ name, ignore: CREDENTIALS_MISSING, fn });

integration('integration: leg 1 unblocker=true — API reports the anti-bot ENABLED on a 200', async () => {
  const leg = requireBillable((await matrix()).unblockerTrue, 'unblocker=true');
  assertSucceeded(leg);
  assertEquals(leg.echoedAsp, true, 'API did not report the anti-bot enabled for unblocker=true');
});

integration('integration: leg 2 asp=true — API reports the anti-bot ENABLED on a 200', async () => {
  const leg = requireBillable((await matrix()).aspTrue, 'asp=true');
  assertSucceeded(leg);
  assertEquals(leg.echoedAsp, true, 'API did not report the anti-bot enabled for asp=true');
});

integration('integration: legs 1 and 2 are indistinguishable at the API', async () => {
  const m = await matrix();
  const unblockerTrue = requireBillable(m.unblockerTrue, 'unblocker=true');
  const aspTrue = requireBillable(m.aspTrue, 'asp=true');
  assertEquals(unblockerTrue.echoedAsp, aspTrue.echoedAsp);
  assertEquals(unblockerTrue.statusCode, aspTrue.statusCode);
  assertEquals(unblockerTrue.success, aspTrue.success);
  // Stronger than the toggle alone: the entire config the API parsed out of
  // the request is identical, so no other knob moved with the rename.
  assertEquals(unblockerTrue.echoedConfig, aspTrue.echoedConfig);
});

integration('integration: leg 3 unblocker=false — API reports the anti-bot DISABLED on a 200', async () => {
  const leg = (await matrix()).unblockerFalse;
  assertSucceeded(leg);
  assertEquals(leg.echoedAsp, false, 'API did not report the anti-bot disabled for unblocker=false');
});

integration('integration: leg 4 asp=false — API reports the anti-bot DISABLED on a 200', async () => {
  const leg = (await matrix()).aspFalse;
  assertSucceeded(leg);
  assertEquals(leg.echoedAsp, false, 'API did not report the anti-bot disabled for asp=false');
});

integration('integration: legs 3 and 4 are indistinguishable at the API', async () => {
  const { unblockerFalse, aspFalse } = await matrix();
  assertEquals(unblockerFalse.echoedAsp, aspFalse.echoedAsp);
  assertEquals(unblockerFalse.statusCode, aspFalse.statusCode);
  assertEquals(unblockerFalse.success, aspFalse.success);
  assertEquals(unblockerFalse.echoedConfig, aspFalse.echoedConfig);
});

integration('integration: leg 5 — the API honours a raw `unblocker=true` with no `asp` key', async () => {
  const leg = requireBillable((await matrix()).rawUnblocker, 'raw unblocker=true');

  const query = new URL(leg.url).searchParams;
  assertEquals(query.get('unblocker'), 'true', 'harness error: this leg must put `unblocker` on the wire');
  assertEquals(
    query.has('asp'),
    false,
    'harness error: an `asp` key wins the server-side precedence rule and the alias fallback would never be reached',
  );

  assertEquals(leg.httpStatus, 200, `raw unblocker=true: Scrapfly API answered ${leg.httpStatus}`);
  assertEquals(leg.upstreamStatus, 200, 'raw unblocker=true: upstream did not answer 200');
  assertEquals(leg.success, true, 'raw unblocker=true: scrape reported unsuccessful');

  assertEquals(
    leg.echoedAsp,
    true,
    'THE API-SIDE ALIAS IS BROKEN: a request carrying only `unblocker=true` was parsed as ' +
      `config.asp=${leg.echoedAsp}. Every customer who migrated to the new name on a raw HTTP ` +
      `client is being billed for an UNPROTECTED scrape. uuid=${leg.uuid}`,
  );
});

integration('integration: the SDK wire key and the API alias reach the same state', async () => {
  const m = await matrix();
  const sdk = requireBillable(m.aspTrue, 'asp=true');
  const raw = requireBillable(m.rawUnblocker, 'raw unblocker=true');
  assertEquals(
    sdk.echoedAsp,
    raw.echoedAsp,
    'the SDK `asp=true` route and the raw `unblocker=true` route echoed different states',
  );
});

integration('integration: the outbound query carried asp and never unblocker', async () => {
  const legs = await matrix();
  const rows: Array<readonly [Leg, boolean]> = [
    [legs.unblockerFalse, false],
    [legs.aspFalse, false],
  ];
  if (legs.unblockerTrue) rows.unshift([legs.unblockerTrue, true]);
  if (legs.aspTrue) rows.unshift([legs.aspTrue, true]);

  for (const [leg, expectAsp] of rows) {
    assert(leg.requestUrls.length > 0, `leg ${leg.name}: no request was recorded`);
    for (const raw of leg.requestUrls) {
      const query = new URL(raw).searchParams;
      // The wire key is `asp` under both SDK-facing names, forever. Note what
      // this pins: the CLIENT's fold. Leg 5 covers the server's half.
      assertEquals(query.has('unblocker'), false, `leg ${leg.name}: leaked "unblocker" onto the wire: ${redact(raw)}`);
      if (expectAsp) {
        assertEquals(query.get('asp'), 'true', `leg ${leg.name}: expected asp=true on the wire`);
      } else {
        // `false` is the default, so the serializer omits the key entirely.
        assertEquals(query.has('asp'), false, `leg ${leg.name}: expected no asp key on the wire`);
      }
    }
  }
});

integration('integration: the matrix cost exactly the advertised number of scrapes', async () => {
  const legs = await matrix();
  const sdkLegs = [legs.unblockerTrue, legs.aspTrue, legs.unblockerFalse, legs.aspFalse].filter(
    (leg): leg is Leg => leg !== null,
  );
  const expected = sdkLegs.length + (legs.rawUnblocker ? 1 : 0);

  // Counted at `client.fetch`, i.e. once per logical leg. Retries are pinned to
  // 1 inside runLeg, so this equals the request count by construction.
  const recorded = sdkLegs.reduce((n, leg) => n + leg.requestUrls.length, 0) + (legs.rawUnblocker ? 1 : 0);
  assertEquals(recorded, expected, `expected ${expected} outbound scrape requests, recorded ${recorded}`);

  // Counted at `globalThis.fetch`, i.e. BELOW any retry loop. This is the
  // number the account was actually charged for; if it exceeds `expected`,
  // something re-issued a billable scrape.
  assertEquals(
    socketRequests,
    expected,
    `the matrix put ${socketRequests} requests on the socket but advertises ${expected} — ` +
      `${socketRequests - expected} extra real scrape(s) were billed`,
  );
});
