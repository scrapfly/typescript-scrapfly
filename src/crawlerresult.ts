import { ScrapflyCrawlerError } from './errors.ts';
import { writeFile } from './polyfill.ts';
import type { Rec } from './types.ts';

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
  /**
   * `null` unless the crawl was started with `search: true`. Polling this is
   * the webhook-free way to learn when the index became queryable.
   */
  search: CrawlerSearchState | null;
  /** `null` unless the crawl re-scrapes itself on a period. */
  refresh: CrawlerRefreshState | null;

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

    // Both blocks go through their field whitelist rather than a cast to the
    // interface. A cast is a compile-time claim only: raw JSON rides through
    // it, so a field the model never declared still reaches the caller and a
    // field the model lost still looks decoded.
    const search = optionalField<Record<string, any>>(data, 'search', 'object', 'CrawlerStatus');
    this.search = search ? parseCrawlerSearchState(search) : null;
    const refresh = optionalField<Record<string, any>>(data, 'refresh', 'object', 'CrawlerStatus');
    this.refresh = refresh ? parseCrawlerRefreshState(refresh) : null;
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
 * Which retrieval legs a search runs. `hybrid` runs both and merges them with
 * reciprocal rank fusion; it is the server default when the field is omitted.
 */
export type CrawlerSearchMode = 'vector' | 'fts' | 'hybrid';

/** Lifecycle of a crawl's auto-refresh loop. */
export type CrawlerRefreshStatus = 'DISABLED' | 'SCHEDULED' | 'RUNNING' | 'FAILED';

/**
 * One row of a crawl's refresh timeline.
 *
 * `sample_updated` / `sample_removed` carry at most ten URLs each. The full
 * lists are never inlined: a 5,000-page crawl would otherwise put 5,000
 * strings into every status poll.
 */
export interface CrawlerRefreshEntry {
  at?: string;
  /** Refresh generation this run produced, 1 for the first. */
  generation?: number;
  /** URLs this run discovered that the crawl did not hold. */
  added?: number;
  /** Known URLs whose content fingerprint changed. */
  updated?: number;
  /** Known URLs that no longer exist and were dropped. */
  removed?: number;
  /** Re-scraped with an identical fingerprint: no embedding, no index write. */
  unchanged?: number;
  /** URLs the run could not fetch. They keep their previous content. */
  failed?: number;
  duration_ms?: number;
  search_status?: string;
  error?: string;
  /** Up to ten re-indexed URLs. */
  sample_updated?: string[];
  /** Up to ten dropped URLs. */
  sample_removed?: string[];
}

/**
 * The `refresh` block of a crawl, carried by `GET /crawl/{uuid}/status` and
 * returned by the three refresh calls.
 *
 * Parsed leniently: older API builds omit the block entirely.
 */
export interface CrawlerRefreshState {
  enabled: boolean;
  /** Period between runs in seconds; 0 when disabled. */
  interval_seconds: number;
  status: CrawlerRefreshStatus;
  /** Number of refresh runs completed so far. */
  generation?: number;
  last_run_at?: string;
  /** Absent while refresh is disabled. */
  next_run_at?: string;
  error?: string;
  /**
   * When the run currently in flight began. Only `GET /crawl/{uuid}/status`
   * carries it: the three refresh routes render a typed state that does not
   * declare the field, so it is optional on both paths.
   */
  started_at?: string;
  /**
   * Consecutive failed runs; reset to 0 by the first run that succeeds. Same
   * route asymmetry as `started_at`.
   */
  consecutive_failures?: number;
  /** Newest last, capped at the 50 most recent runs. */
  history?: CrawlerRefreshEntry[];
}

/** Pages a run actually touched. Zero means the site stood still. */
export function refreshChanged(entry: CrawlerRefreshEntry | null | undefined): number {
  return (entry?.added ?? 0) + (entry?.updated ?? 0) + (entry?.removed ?? 0);
}

/**
 * Normalize a refresh envelope.
 *
 * The three refresh endpoints answer with the state at the top level;
 * `GET /status` nests it under `refresh`. Accepting both means the SDK never
 * has to guess which call produced the payload.
 *
 * This is a field whitelist, not a spread: a key that is not named here never
 * reaches the caller, whatever the interface declares.
 */
export function parseCrawlerRefreshState(data: Record<string, any>): CrawlerRefreshState {
  const block = data && typeof data.refresh === 'object' && data.refresh !== null ? data.refresh : data;
  return {
    enabled: block.enabled === true,
    interval_seconds: typeof block.interval_seconds === 'number' ? block.interval_seconds : 0,
    status: (block.status as CrawlerRefreshStatus) ?? 'DISABLED',
    generation: block.generation,
    last_run_at: block.last_run_at ?? undefined,
    next_run_at: block.next_run_at ?? undefined,
    error: block.error ?? undefined,
    started_at: block.started_at ?? undefined,
    consecutive_failures: block.consecutive_failures ?? undefined,
    history: Array.isArray(block.history) ? (block.history as CrawlerRefreshEntry[]) : [],
  };
}

export type CrawlerSearchStatus = 'DISABLED' | 'BUILDING' | 'READY' | 'PARTIAL' | 'FAILED';

/**
 * The `search` block describing a crawl's index, carried by
 * `GET /crawl/{uuid}/status` and by the two search webhooks.
 *
 * Parsed leniently: the block is sparse on failure and older API builds omit
 * it entirely.
 */
export interface CrawlerSearchState {
  status: CrawlerSearchStatus;
  /** Storage path of the index manifest; absent until the artifact is published. */
  manifest?: string;
  /** Crawled pages represented in the index. */
  documents?: number;
  /** Embedded chunks those pages were split into. */
  vectors?: number;
  /** Chunks discarded during the build (embedding failures, oversized rows). */
  dropped?: number;
  queue_depth?: number;
  fragments?: number;
  error?: string;
  built_at?: string;
  /** Vector index type (e.g. `IVF_PQ`); absent below the index threshold. */
  index?: string;
  /**
   * Bumped when a paused crawl resumes and rebuilds. Results from different
   * generations are not comparable.
   */
  generation?: number;
}

/** True when the index can answer a query right now. */
export function isSearchable(state: CrawlerSearchState | null | undefined): boolean {
  return state?.status === 'READY' || state?.status === 'PARTIAL';
}

/**
 * Normalize a search envelope.
 *
 * `GET /status` nests the block under `search` and so do the two search
 * webhooks; taking the block on its own as well means a caller holding either
 * envelope decodes the same way.
 *
 * This is a field whitelist, not a spread: a key that is not named here never
 * reaches the caller, whatever the interface declares. `status` is the one
 * field with no sane absent value, so a block without it reads as DISABLED.
 */
export function parseCrawlerSearchState(data: Record<string, any>): CrawlerSearchState {
  const block = data && typeof data.search === 'object' && data.search !== null ? data.search : data;
  return {
    status: (block.status as CrawlerSearchStatus) ?? 'DISABLED',
    manifest: block.manifest ?? undefined,
    documents: block.documents ?? undefined,
    vectors: block.vectors ?? undefined,
    dropped: block.dropped ?? undefined,
    queue_depth: block.queue_depth ?? undefined,
    fragments: block.fragments ?? undefined,
    error: block.error ?? undefined,
    built_at: block.built_at ?? undefined,
    index: block.index ?? undefined,
    generation: block.generation ?? undefined,
  };
}

/** Per-leg scores behind a result. Which keys appear depends on the mode. */
export interface CrawlerSearchScores {
  vector?: number;
  fts?: number;
  rrf?: number;
}

/**
 * One matched chunk from `POST /crawl/search`.
 *
 * A result is a chunk, not a page: `chunk_id` orders chunks within one crawled
 * document and `text` is only the matched slice. Expand a hit back to the
 * whole document through `contents_url`, or through `warc_offset`/`warc_end`
 * against the crawl's WARC artifact.
 */
export interface CrawlerSearchResult {
  rank: number;
  score: number;
  scores: CrawlerSearchScores;
  crawler_uuid: string;
  url: string;
  title: string | null;
  source_format: string | null;
  content_type: string | null;
  chunk_id: number;
  text: string;
  warc_offset: number | null;
  warc_end: number | null;
  contents_url: string | null;
}

/** A crawl that was opened and searched. */
export interface CrawlerSearchCrawl {
  crawler_uuid: string;
  documents?: number;
  vectors?: number;
  index?: string;
}

/** Why a requested crawl contributed nothing. A skip is never fatal. */
export type CrawlerSkipReason =
  | 'search_not_enabled'
  | 'search_not_ready'
  | 'search_failed'
  | 'search_disabled'
  | 'incompatible_index'
  | 'deadline';

export interface CrawlerSearchSkipped {
  crawler_uuid: string;
  reason: CrawlerSkipReason;
  status?: string;
}

/** Fan-out timing and IO counters. */
export interface CrawlerSearchStats {
  duration_ms?: number;
  crawls_searched?: number;
  candidates?: number;
  gcs_gets?: number;
}

/**
 * Wraps the JSON response of `POST /crawl/search`.
 *
 * The envelope states its own completeness: `exact` with most crawls unopened
 * is the normal outcome, because the fan-out proves via an admissible bound
 * that the unopened crawls held nothing better. `partial` means the deadline
 * cut the fan-out short.
 *
 * Strict on the fields the contract always carries, lenient on the rest, so
 * drift in the ranking envelope surfaces at parse time rather than as an
 * empty result list.
 */
export class CrawlerSearchResponse {
  query: string;
  mode: CrawlerSearchMode;
  limit: number;
  completeness: 'exact' | 'partial';
  results: CrawlerSearchResult[];
  crawls: CrawlerSearchCrawl[];
  skipped: CrawlerSearchSkipped[];
  stats: CrawlerSearchStats;

  crawls_requested: number | null;
  crawls_searched: number | null;
  crawls_pruned_exact: number | null;
  /**
   * The crawls the deadline cut, and the crawls whose index could not be read,
   * named rather than counted: a caller told "3 failed" cannot retry them.
   */
  crawls_skipped_deadline: string[] | null;
  crawls_failed: CrawlerSearchSkipped[] | null;
  /**
   * `null` until a crawl has actually been opened. Zero is a different claim:
   * it says the best unsearched score was 0, not that no bound exists.
   */
  theta: number | null;
  max_ub_unsearched: number | null;

  /**
   * Opaque token for the next page, `null` on the last one. Paging is
   * cursor-based: an offset over a partial fan-out would re-run the legs and
   * shift ranks.
   */
  cursor: string | null;

  constructor(data: Record<string, any>) {
    this.query = requireField<string>(data, 'query', 'string', 'CrawlerSearchResponse');
    this.mode = requireField<CrawlerSearchMode>(data, 'mode', 'string', 'CrawlerSearchResponse');
    this.limit = requireField<number>(data, 'limit', 'number', 'CrawlerSearchResponse');
    this.completeness = requireField<'exact' | 'partial'>(
      data,
      'completeness',
      'string',
      'CrawlerSearchResponse',
    );

    const results = requireField<Record<string, any>[]>(data, 'results', 'array', 'CrawlerSearchResponse');
    this.results = results.map((r, i) => {
      const context = `CrawlerSearchResponse.results[${i}]`;
      return {
        rank: requireField<number>(r, 'rank', 'number', context),
        score: requireField<number>(r, 'score', 'number', context),
        scores: optionalField<CrawlerSearchScores>(r, 'scores', 'object', context) ?? {},
        crawler_uuid: requireField<string>(r, 'crawler_uuid', 'string', context),
        url: requireField<string>(r, 'url', 'string', context),
        title: optionalField<string>(r, 'title', 'string', context),
        source_format: optionalField<string>(r, 'source_format', 'string', context),
        content_type: optionalField<string>(r, 'content_type', 'string', context),
        chunk_id: requireField<number>(r, 'chunk_id', 'number', context),
        text: requireField<string>(r, 'text', 'string', context),
        warc_offset: optionalField<number>(r, 'warc_offset', 'number', context),
        warc_end: optionalField<number>(r, 'warc_end', 'number', context),
        contents_url: optionalField<string>(r, 'contents_url', 'string', context),
      };
    });

    this.crawls = optionalField<CrawlerSearchCrawl[]>(data, 'crawls', 'array', 'CrawlerSearchResponse') ?? [];
    this.skipped = optionalField<CrawlerSearchSkipped[]>(data, 'skipped', 'array', 'CrawlerSearchResponse') ?? [];
    this.stats = optionalField<CrawlerSearchStats>(data, 'stats', 'object', 'CrawlerSearchResponse') ?? {};

    this.crawls_requested = optionalField<number>(data, 'crawls_requested', 'number', 'CrawlerSearchResponse');
    this.crawls_searched = optionalField<number>(data, 'crawls_searched', 'number', 'CrawlerSearchResponse');
    this.crawls_pruned_exact = optionalField<number>(data, 'crawls_pruned_exact', 'number', 'CrawlerSearchResponse');
    this.crawls_skipped_deadline = optionalField<string[]>(
      data,
      'crawls_skipped_deadline',
      'array',
      'CrawlerSearchResponse',
    );
    this.crawls_failed = optionalField<CrawlerSearchSkipped[]>(
      data,
      'crawls_failed',
      'array',
      'CrawlerSearchResponse',
    );
    this.theta = optionalField<number>(data, 'theta', 'number', 'CrawlerSearchResponse');
    this.max_ub_unsearched = optionalField<number>(data, 'max_ub_unsearched', 'number', 'CrawlerSearchResponse');

    this.cursor = optionalField<string>(data, 'cursor', 'string', 'CrawlerSearchResponse');
  }

  /** True when the ranking is provably complete for the requested crawls. */
  get isExact(): boolean {
    return this.completeness === 'exact';
  }
}

/** One retrieved chunk the answer may cite. */
export interface CrawlerPromptSource {
  id: number;
  crawler_uuid: string;
  url: string;
  title?: string;
  score?: number;
}


/** Payload of the terminal `done` frame. */
export interface CrawlerPromptDone {
  sources_used?: number[];
  /** Retrieved chunks that did not fit the context and never reached the model. */
  sources_dropped?: number;
  /**
   * True when the model hit its output cap. The answer is still delivered;
   * whether to use it is the caller's call.
   */
  truncated?: boolean;
}

/**
 * One decoded frame of the `POST /crawl/prompt` stream.
 *
 * Frames arrive as `source`*, then `token`*, then one `done`, or one `error`
 * which is thrown rather than yielded because generation can fail after
 * tokens have already been delivered.
 */
export type CrawlerPromptEvent =
  | { event: 'source'; data: CrawlerPromptSource }
  | { event: 'token'; data: string }
  | { event: 'done'; data: CrawlerPromptDone };

/**
 * Decode the `POST /crawl/prompt` SSE body into typed frames.
 *
 * Only `event:` and `data:` lines matter; `:keepalive` comment frames exist
 * to keep intermediaries from closing an idle connection and carry nothing.
 * Token payloads are JSON strings; every other frame is a JSON object.
 *
 * An `event: error` frame throws rather than yields: the caller is already
 * inside a `for await` and a yielded error object is too easy to ignore after
 * tokens have started arriving.
 *
 * Decoding is explicitly UTF-8 with `stream: true`, because a multi-byte
 * character can straddle two chunks of the body.
 */
export async function* parseCrawlerPromptStream(
  body: ReadableStream<Uint8Array>,
): AsyncGenerator<CrawlerPromptEvent, void, undefined> {
  const reader = body.getReader();
  const decoder = new TextDecoder('utf-8');
  let buffer = '';
  let eventName = '';
  let data: string[] = [];

  const decodeFrame = (name: string, raw: string): CrawlerPromptEvent | null => {
    if (name === 'token') {
      let token: string;
      try {
        token = JSON.parse(raw) as string;
      } catch {
        // A server sending bare text instead of a JSON string is still
        // sending a token; do not drop the answer over the quoting.
        token = raw;
      }
      return { event: 'token', data: token };
    }
    if (name === 'source') {
      return { event: 'source', data: JSON.parse(raw) as CrawlerPromptSource };
    }
    if (name === 'done') {
      return { event: 'done', data: JSON.parse(raw) as CrawlerPromptDone };
    }
    if (name === 'error') {
      let payload: Rec<any> = {};
      try {
        payload = JSON.parse(raw) as Rec<any>;
      } catch {
        payload = { message: raw };
      }
      throw new ScrapflyCrawlerError(payload.message ?? raw, {
        code: (payload.code ?? 'ERR::CRAWLER::UNKNOWN') as string,
      });
    }
    return null;
  };

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (value !== undefined) {
        buffer += decoder.decode(value, { stream: true });
      }
      if (done) {
        buffer += decoder.decode();
      }

      let newline = buffer.indexOf('\n');
      while (newline !== -1) {
        const line = buffer.slice(0, newline).replace(/\r$/, '');
        buffer = buffer.slice(newline + 1);
        newline = buffer.indexOf('\n');

        if (line.startsWith(':')) continue;

        // A blank line terminates a frame.
        if (line === '') {
          if (eventName !== '' && data.length > 0) {
            const event = decodeFrame(eventName, data.join('\n'));
            if (event !== null) yield event;
          }
          eventName = '';
          data = [];
          continue;
        }

        if (line.startsWith('event:')) {
          eventName = line.slice('event:'.length).trim();
        } else if (line.startsWith('data:')) {
          data.push(line.slice('data:'.length).replace(/^ /, ''));
        }
      }

      if (done) break;
    }
  } finally {
    // Covers both exhaustion and an early `break` out of the caller's loop.
    await reader.cancel().catch(() => {});
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
 * Verified against the Crawler API webhook payload reference.
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
 * Payload for `crawler_search_ready` and `crawler_search_failed`.
 *
 * The index is published after the crawl's own success classification and can
 * fail without the crawl failing, so these are separate from the lifecycle
 * events. They are also the only crawler webhooks emitted without an `action`
 * tag, hence the `Partial` on the common fields.
 */
export interface CrawlerSearchWebhook {
  event: 'crawler_search_ready' | 'crawler_search_failed';
  payload: Omit<CrawlerWebhookCommon, 'action'> & {
    action?: string;
    seed_url: string;
    links: { status: string };
    search: CrawlerSearchState;
  };
}

/**
 * Payload for `crawler_updated`, emitted once per auto-refresh run that changed
 * at least one page.
 *
 * A run over a site that stood still, and a run that failed outright, change
 * nothing and are not delivered, so receiving this event is by itself proof of
 * a diff.
 */
export interface CrawlerUpdatedWebhook {
  event: 'crawler_updated';
  payload: CrawlerWebhookCommon & {
    seed_url: string;
    links: { status: string };
    /**
     * The run, as the same row the refresh timeline keeps. Its sample lists are
     * absent here: this event carries the URLs in `documents` instead, at a
     * higher cap.
     */
    refresh: CrawlerRefreshEntry;
    documents: {
      /**
       * Re-indexed URLs, added and changed alike. Which of the two a URL was
       * only survives in the counts on `refresh`.
       */
      updated: string[];
      removed: string[];
      /** Either list was cut at Scrapfly's 100-URL cap; the counts stay whole. */
      truncated: boolean;
    };
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
  | CrawlerUrlFailedWebhook
  | CrawlerSearchWebhook
  | CrawlerUpdatedWebhook;

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
    event === 'crawler_url_failed' ||
    event === 'crawler_search_ready' ||
    event === 'crawler_search_failed' ||
    event === 'crawler_updated'
  ) {
    // The body has already been validated to have an `event` and `payload`. The
    // narrower per-event field shapes are runtime-checked by the discriminated union
    // — TypeScript users get the typed view; runtime users get a permissive bag.
    return obj as unknown as CrawlerWebhookPayload;
  }
  throw new Error(`Unknown crawler webhook event: ${event}`);
}
