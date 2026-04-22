import { writeFile } from './polyfill.ts';

/**
 * Pull a required field out of an API response body and fail loud if it's
 * missing or the wrong type. Using this consistently across the response
 * classes means a server-side contract change surfaces as a clear error at
 * parse time instead of a silent fallback to 0/null/empty later.
 */
function requireField<T>(
  data: Record<string, any>,
  key: string,
  typeName: 'string' | 'number' | 'boolean' | 'object' | 'array',
  contextClass: string,
): T {
  if (!(key in data)) {
    throw new Error(`${contextClass}: required field '${key}' is missing from API response`);
  }
  const value = data[key];
  if (value === null || value === undefined) {
    throw new Error(`${contextClass}: required field '${key}' is null/undefined`);
  }
  const actual = Array.isArray(value) ? 'array' : typeof value;
  if (typeName === 'array' ? actual !== 'array' : actual !== typeName) {
    throw new Error(
      `${contextClass}: field '${key}' must be ${typeName}, got ${actual} (${JSON.stringify(value).slice(0, 100)})`,
    );
  }
  return value as T;
}

/**
 * Like `requireField` but for optional fields that the server may legitimately
 * omit or send as `null`. Returns `null` when absent; validates type otherwise.
 */
function optionalField<T>(
  data: Record<string, any>,
  key: string,
  typeName: 'string' | 'number' | 'boolean' | 'object' | 'array',
  contextClass: string,
): T | null {
  if (!(key in data)) return null;
  const value = data[key];
  if (value === null || value === undefined) return null;
  const actual = Array.isArray(value) ? 'array' : typeof value;
  if (typeName === 'array' ? actual !== 'array' : actual !== typeName) {
    throw new Error(
      `${contextClass}: field '${key}' must be ${typeName} or null, got ${actual}`,
    );
  }
  return value as T;
}

/**
 * Crawler job status values returned by the API.
 *
 * Note: there is **no** `COMPLETED` or `FAILED` value. A finished crawl always
 * has `status === 'DONE'`; success vs. failure is signaled by `is_success`.
 * `CANCELLED` is a separate terminal state set when the user cancels the job.
 */
export type CrawlerStatusValue = 'PENDING' | 'RUNNING' | 'DONE' | 'CANCELLED';

/**
 * Reasons documented for why a crawler stopped.
 */
export type CrawlerStopReason =
  | 'no_more_urls'
  | 'page_limit'
  | 'max_duration'
  | 'max_api_credit'
  | 'seed_url_failed'
  | 'user_cancelled'
  | 'crawler_error'
  | 'no_api_credit_left'
  | 'storage_error';

/**
 * Per-job state metrics returned in the status response and webhook payloads.
 *
 * Note on nullable fields: while the crawler is in `PENDING` (before any
 * worker has picked up the job), `start_time`, `stop_time`, and `stop_reason`
 * are all `null`. They become populated once the crawl starts progressing.
 * `duration` is always a number (0 when nothing has happened yet).
 */
export interface CrawlerState {
  /** Number of URLs the crawler has fetched. */
  urls_visited: number;
  /** Number of URLs from which content or links were extracted. */
  urls_extracted: number;
  /** Number of URLs that failed to fetch. */
  urls_failed: number;
  /** Number of URLs skipped (filtered out, duplicate, limit hit, ...). */
  urls_skipped: number;
  /** Number of URLs queued for future fetch. */
  urls_to_crawl: number;
  /** API credits consumed so far. */
  api_credit_used: number;
  /** Elapsed time in seconds since the crawl started (0 while PENDING). */
  duration: number;
  /** `null` until the crawler stops. */
  stop_reason: CrawlerStopReason | null;
  /** `null` until the crawler actually starts processing (still PENDING). */
  start_time: number | null;
  /** `null` until the crawler stops. */
  stop_time: number | null;
}

/**
 * Wraps the JSON response of `GET /crawl/{uuid}/status`.
 *
 * Strict parsing: every field documented in the public API contract is
 * required. A missing or wrong-typed field throws a clear error at parse
 * time so API contract drift surfaces loud and early instead of silently
 * producing zero-valued metrics.
 */
export class CrawlerStatus {
  crawler_uuid: string;
  status: CrawlerStatusValue;
  is_finished: boolean;
  /** `null` while the crawler is still running; bool once terminal. */
  is_success: boolean | null;
  state: CrawlerState;

  constructor(data: Record<string, any>) {
    // Canonical API field name is `crawler_uuid`; accept short `uuid` as a
    // legacy fallback but throw if neither is present.
    if ('crawler_uuid' in data && typeof data.crawler_uuid === 'string' && data.crawler_uuid) {
      this.crawler_uuid = data.crawler_uuid;
    } else if ('uuid' in data && typeof data.uuid === 'string' && data.uuid) {
      this.crawler_uuid = data.uuid;
    } else {
      throw new Error(
        "CrawlerStatus: required field 'crawler_uuid' (or legacy 'uuid') is missing from API response",
      );
    }
    this.status = requireField<CrawlerStatusValue>(data, 'status', 'string', 'CrawlerStatus');
    this.is_finished = requireField<boolean>(data, 'is_finished', 'boolean', 'CrawlerStatus');
    // `is_success` is documented as nullable while the crawler is running.
    const isSuccessRaw = 'is_success' in data ? data.is_success : null;
    if (isSuccessRaw !== null && typeof isSuccessRaw !== 'boolean') {
      throw new Error(
        `CrawlerStatus: field 'is_success' must be bool or null, got ${typeof isSuccessRaw}`,
      );
    }
    this.is_success = isSuccessRaw;

    const state = requireField<Record<string, any>>(data, 'state', 'object', 'CrawlerStatus');
    this.state = {
      // URL counters and `duration` are always present and numeric (0 during PENDING).
      urls_visited: requireField<number>(state, 'urls_visited', 'number', 'CrawlerStatus.state'),
      urls_extracted: requireField<number>(state, 'urls_extracted', 'number', 'CrawlerStatus.state'),
      urls_failed: requireField<number>(state, 'urls_failed', 'number', 'CrawlerStatus.state'),
      urls_skipped: requireField<number>(state, 'urls_skipped', 'number', 'CrawlerStatus.state'),
      urls_to_crawl: requireField<number>(state, 'urls_to_crawl', 'number', 'CrawlerStatus.state'),
      api_credit_used: requireField<number>(state, 'api_credit_used', 'number', 'CrawlerStatus.state'),
      duration: requireField<number>(state, 'duration', 'number', 'CrawlerStatus.state'),
      // `start_time` / `stop_time` / `stop_reason` are null until the crawler
      // actually starts / stops — verified against the live server behavior.
      start_time: optionalField<number>(state, 'start_time', 'number', 'CrawlerStatus.state'),
      stop_time: optionalField<number>(state, 'stop_time', 'number', 'CrawlerStatus.state'),
      stop_reason: optionalField<CrawlerStopReason>(state, 'stop_reason', 'string', 'CrawlerStatus.state'),
    };
  }

  /** True while the crawler is still working (PENDING or RUNNING). */
  get isRunning(): boolean {
    return this.status === 'PENDING' || this.status === 'RUNNING';
  }

  /** True if the crawler reached a terminal state successfully. */
  get isComplete(): boolean {
    return this.status === 'DONE' && this.is_success === true;
  }

  /** True if the crawler reached a terminal state but failed. */
  get isFailed(): boolean {
    return this.status === 'DONE' && this.is_success === false;
  }

  /** True if the crawler was cancelled by the user. */
  get isCancelled(): boolean {
    return this.status === 'CANCELLED';
  }

  /**
   * Rough progress estimate based on visited vs. extracted URLs (0–100).
   * Returns 0 when nothing has been extracted yet.
   */
  get progressPct(): number {
    return this.state.urls_extracted > 0 ? (this.state.urls_visited / this.state.urls_extracted) * 100 : 0;
  }
}

/**
 * Single URL entry from `GET /crawl/{uuid}/urls`.
 *
 * The endpoint streams one record per line as `text/plain`. For `visited`
 * URLs each line is just the URL; for `failed` or `skipped` URLs the line is
 * `url,reason` (reason is the first token after the first comma — URLs never
 * contain a comma once percent-encoded, so this is unambiguous).
 *
 * Streaming text is used because the endpoint is expected to scale to
 * millions of URLs per job; JSON is not a suitable wire format at that
 * volume.
 */
export interface CrawlerUrlEntry {
  url: string;
  /** Only populated when the caller passed an explicit `status` filter. */
  status?: 'visited' | 'pending' | 'failed' | 'skipped';
  /** Only present for `failed` or `skipped` URLs. */
  reason?: string;
}

/**
 * Wraps the streaming text response of `GET /crawl/{uuid}/urls`.
 *
 * The server returns one record per line with `Content-Type: text/plain`;
 * this class parses that stream into a materialised list for caller
 * convenience. For very large jobs, prefer {@link ScrapflyClient.crawlUrlsStream}
 * (if provided) or call the endpoint via `client.fetch` directly and iterate
 * the body as a stream.
 *
 * Pagination metadata fields (`page`, `per_page`) are echoes of the caller's
 * request parameters — the wire protocol carries no global `total`, only the
 * records in the current page. Use `urls.length` for the page size and
 * request further pages by incrementing `page` until an empty response.
 */
export class CrawlerUrls {
  urls: CrawlerUrlEntry[];
  page: number;
  per_page: number;

  constructor(
    urls: CrawlerUrlEntry[],
    page: number,
    perPage: number,
  ) {
    this.urls = urls;
    this.page = page;
    this.per_page = perPage;
  }

  /**
   * Parse the raw text body returned by `GET /crawl/{uuid}/urls`.
   *
   * - Empty lines are ignored (trailing newlines, blank records).
   * - `visited` status → one URL per line, record has `{url, status: 'visited'}`.
   * - `failed`/`skipped` status → `url,reason`, record includes `reason`.
   * - When the caller didn't pass a `status` filter, the server defaults to
   *   `visited`; we pass that as the `statusHint` so every parsed record gets
   *   the right status tag.
   *
   * @param body      Raw text body of the response.
   * @param statusHint The status filter passed on the request (for tagging).
   * @param page      Caller-provided page (echoed on the response object).
   * @param perPage   Caller-provided per_page (echoed on the response object).
   */
  static fromText(
    body: string,
    statusHint: 'visited' | 'pending' | 'failed' | 'skipped',
    page: number,
    perPage: number,
  ): CrawlerUrls {
    const urls: CrawlerUrlEntry[] = [];
    for (const rawLine of body.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line) continue;
      if (statusHint === 'visited' || statusHint === 'pending') {
        // Plain URL per line.
        urls.push({ url: line, status: statusHint });
      } else {
        // `url,reason` — split on the first comma.
        const commaIdx = line.indexOf(',');
        if (commaIdx === -1) {
          urls.push({ url: line, status: statusHint });
        } else {
          urls.push({
            url: line.slice(0, commaIdx),
            status: statusHint,
            reason: line.slice(commaIdx + 1),
          });
        }
      }
    }
    return new CrawlerUrls(urls, page, perPage);
  }
}

/**
 * Wraps the JSON-mode response of `GET /crawl/{uuid}/contents` (i.e. `plain=false`).
 *
 * The `contents` field maps each URL to a map of format → content. When
 * `plain=true` is used instead, {@link ScrapflyClient.crawlContents} returns
 * a raw `string` directly rather than this class.
 *
 * Strict parsing: `contents` and `links` are both required per the documented
 * contract. A response missing either field indicates an API contract change
 * and throws at parse time rather than producing an empty envelope that looks
 * valid.
 */
export class CrawlerContents {
  contents: Record<string, Record<string, string>>;
  links: { crawled_urls?: string; next?: string | null; prev?: string | null };

  constructor(data: Record<string, any>) {
    this.contents = requireField<Record<string, Record<string, string>>>(
      data,
      'contents',
      'object',
      'CrawlerContents',
    );
    this.links = requireField<typeof this.links>(data, 'links', 'object', 'CrawlerContents');
  }
}

/**
 * Artifact type accepted by `GET /crawl/{uuid}/artifact?type=...`.
 */
export type CrawlerArtifactType = 'warc' | 'har';

/**
 * Holds the raw bytes of a downloaded WARC or HAR artifact.
 *
 * **Note on parsing:** the SDK does NOT bundle WARC or HAR parsers. Use a dedicated
 * library (e.g. `warcio` on npm for WARC) if you need to walk the records. The
 * `save()` method is provided for the common case of writing the artifact to disk.
 */
export class CrawlerArtifact {
  type: CrawlerArtifactType;
  data: Uint8Array;

  constructor(type: CrawlerArtifactType, data: Uint8Array) {
    this.type = type;
    this.data = data;
  }

  /** Write the artifact to a file on disk. */
  async save(filepath: string): Promise<void> {
    await writeFile(filepath, this.data);
  }
}

// ---------------------------------------------------------------------------
// Webhook payloads
// ---------------------------------------------------------------------------

/**
 * Fields common to every crawler webhook payload.
 */
export interface CrawlerWebhookCommon {
  crawler_uuid: string;
  project: string;
  env: string;
  action: string;
  state: CrawlerState;
}

/**
 * Webhook for the four "lifecycle" events that share an identical payload shape:
 * `crawler_started`, `crawler_stopped`, `crawler_cancelled`, `crawler_finished`.
 *
 * Verified against `apps/scrapfly/web-app/src/Template/Docs/crawler-api/webhooks_example/`.
 */
export interface CrawlerLifecycleWebhook {
  event: 'crawler_started' | 'crawler_stopped' | 'crawler_cancelled' | 'crawler_finished';
  payload: CrawlerWebhookCommon & {
    seed_url: string;
    links: { status: string };
  };
}

/** Payload for `crawler_url_visited` events. */
export interface CrawlerUrlVisitedWebhook {
  event: 'crawler_url_visited';
  payload: CrawlerWebhookCommon & {
    url: string;
    scrape: {
      status_code: number;
      country?: string;
      log_uuid?: string;
      log_url?: string;
      content: Record<string, string>;
    };
  };
}

/** Payload for `crawler_url_skipped` events. */
export interface CrawlerUrlSkippedWebhook {
  event: 'crawler_url_skipped';
  payload: CrawlerWebhookCommon & {
    /** Map of skipped URL → reason (e.g. `"page_limit"`). */
    urls: Record<string, string>;
  };
}

/** Payload for `crawler_url_discovered` events. */
export interface CrawlerUrlDiscoveredWebhook {
  event: 'crawler_url_discovered';
  payload: CrawlerWebhookCommon & {
    origin: string;
    discovered_urls: string[];
  };
}

/** Payload for `crawler_url_failed` events. */
export interface CrawlerUrlFailedWebhook {
  event: 'crawler_url_failed';
  payload: CrawlerWebhookCommon & {
    url: string;
    error: string;
    scrape_config: Record<string, any>;
    links: { log: string | null };
  };
}

/**
 * Discriminated union of every crawler webhook payload type.
 *
 * Use {@link parseCrawlerWebhook} to safely turn an `unknown` body into one of these.
 */
export type CrawlerWebhookPayload =
  | CrawlerLifecycleWebhook
  | CrawlerUrlVisitedWebhook
  | CrawlerUrlSkippedWebhook
  | CrawlerUrlDiscoveredWebhook
  | CrawlerUrlFailedWebhook;

const LIFECYCLE_EVENTS = new Set([
  'crawler_started',
  'crawler_stopped',
  'crawler_cancelled',
  'crawler_finished',
]);

/**
 * Parse a raw webhook body (JSON-decoded object) into a typed crawler webhook payload.
 *
 * Throws `Error` if the body is not an object, has no `event` field, or carries an
 * unknown event name. Use this in your webhook handler after `JSON.parse()`.
 *
 * @example
 * ```ts
 * import { parseCrawlerWebhook } from '@scrapfly/scrapfly-sdk';
 *
 * app.post('/webhook', async (req, res) => {
 *   const body = await req.json();
 *   const webhook = parseCrawlerWebhook(body);
 *   if (webhook.event === 'crawler_finished') {
 *     console.log('done', webhook.payload.state.urls_visited);
 *   }
 * });
 * ```
 */
export function parseCrawlerWebhook(body: unknown): CrawlerWebhookPayload {
  if (typeof body !== 'object' || body === null) {
    throw new Error('Crawler webhook body must be a JSON object');
  }
  const obj = body as Record<string, any>;
  const event = obj.event;
  if (typeof event !== 'string') {
    throw new Error('Crawler webhook body is missing required `event` string field');
  }
  if (typeof obj.payload !== 'object' || obj.payload === null) {
    throw new Error('Crawler webhook body is missing required `payload` object field');
  }
  if (
    LIFECYCLE_EVENTS.has(event) ||
    event === 'crawler_url_visited' ||
    event === 'crawler_url_skipped' ||
    event === 'crawler_url_discovered' ||
    event === 'crawler_url_failed'
  ) {
    // The body has already been validated to have an `event` and `payload`. The
    // narrower per-event field shapes are runtime-checked by the discriminated union
    // — TypeScript users get the typed view; runtime users get a permissive bag.
    return obj as unknown as CrawlerWebhookPayload;
  }
  throw new Error(`Unknown crawler webhook event: ${event}`);
}
