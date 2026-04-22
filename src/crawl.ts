import * as errors from './errors.ts';
import { log } from './logger.ts';
import type { ScrapflyClient } from './client.ts';
import type { CrawlerConfig, CrawlerContentFormat } from './crawlerconfig.ts';
import type {
  CrawlerArtifact,
  CrawlerArtifactType,
  CrawlerContents,
  CrawlerStatus,
  CrawlerUrls,
} from './crawlerresult.ts';

/**
 * High-level fluent wrapper around a single crawler job lifecycle.
 *
 * Mirrors the Python SDK's `Crawl` class. Internally calls into `ScrapflyClient`'s
 * lower-level crawler methods, but adds:
 *
 * - polling helpers (`wait()`)
 * - per-instance caching of the most recent status and downloaded artifacts
 * - convenience methods that pre-fill the crawler UUID
 *
 * Use this when you want a simple `start → wait → read` flow. Use the lower-level
 * `client.crawl*` methods directly if you need finer control (e.g. polling at
 * irregular intervals or reusing a status response across calls).
 *
 * @example
 * ```ts
 * const crawl = new Crawl(client, new CrawlerConfig({
 *   url: 'https://web-scraping.dev/products',
 *   page_limit: 10,
 *   content_formats: ['markdown'],
 * }));
 *
 * await crawl.start();
 * await crawl.wait({ pollInterval: 2 });
 *
 * for (const entry of (await crawl.urls({ status: 'visited' })).urls) {
 *   const md = await crawl.read(entry.url, 'markdown');
 *   console.log(entry.url, md?.length);
 * }
 * ```
 */
export class Crawl {
  private _uuid?: string;
  private _status?: CrawlerStatus;
  private readonly _artifactCache: Map<CrawlerArtifactType, CrawlerArtifact> = new Map();

  /**
   * @param client Configured {@link ScrapflyClient} that performs the HTTP calls.
   * @param config Crawler configuration to submit on {@link Crawl.start}.
   */
  constructor(private readonly client: ScrapflyClient, private readonly config: CrawlerConfig) {}

  /** The crawler UUID returned by the API after `start()`, or undefined before. */
  get uuid(): string | undefined {
    return this._uuid;
  }

  /** True once `start()` has been called and the crawler has a UUID. */
  get started(): boolean {
    return this._uuid !== undefined;
  }

  /**
   * Schedule the crawl on the Scrapfly API.
   *
   * Returns `this` for chaining. Throws `ScrapflyCrawlerError` if `start()` has
   * already been called on this instance.
   */
  async start(): Promise<this> {
    if (this._uuid) {
      throw new errors.ScrapflyCrawlerError('Crawl already started', { code: 'ALREADY_STARTED' });
    }
    const response = await this.client.crawl(this.config);
    this._uuid = response.crawler_uuid;
    log.debug('crawl started', { crawler_uuid: this._uuid });
    return this;
  }

  private requireUuid(): string {
    if (!this._uuid) {
      throw new errors.ScrapflyCrawlerError(
        'Crawl has not been started yet. Call start() first.',
        { code: 'NOT_STARTED' },
      );
    }
    return this._uuid;
  }

  /**
   * Fetch (or return cached) status for this crawl.
   *
   * @param refresh — when true (default), always re-query the API. When false,
   *   return the cached status from the previous call (or fetch fresh if none).
   */
  async status(refresh = true): Promise<CrawlerStatus> {
    const uuid = this.requireUuid();
    if (refresh || !this._status) {
      this._status = await this.client.crawlStatus(uuid);
    }
    return this._status;
  }

  /**
   * Block until the crawler reaches a terminal state, polling status periodically.
   *
   * Returns `this` for chaining when the job completes successfully. Throws
   * `ScrapflyCrawlerError` if the job fails, is cancelled, or `maxWait` is exceeded.
   *
   * @param opts.pollInterval — seconds between polls (default 5)
   * @param opts.maxWait — maximum total seconds to wait (default: no limit)
   * @param opts.verbose — log progress on every poll
   * @param opts.allowCancelled — when `true`, return normally if the crawler
   *   reaches CANCELLED instead of throwing. Useful for the cancel-then-wait
   *   pattern where the caller already triggered the cancellation. Defaults
   *   to `false`, preserving the prior throw-on-cancel behavior for callers
   *   that observe external interrupts.
   */
  async wait(opts?: {
    pollInterval?: number;
    maxWait?: number;
    verbose?: boolean;
    allowCancelled?: boolean;
  }): Promise<this> {
    const pollInterval = opts?.pollInterval ?? 5;
    const maxWait = opts?.maxWait;
    const verbose = opts?.verbose ?? false;
    const allowCancelled = opts?.allowCancelled ?? false;
    const start = Date.now();

    while (true) {
      const status = await this.status(true);
      if (verbose) {
        log.info(
          `crawl ${this._uuid} status=${status.status} visited=${status.state.urls_visited}/${status.state.urls_extracted}`,
        );
      }
      if (status.is_finished || status.status === 'CANCELLED') {
        if (status.isFailed) {
          throw new errors.ScrapflyCrawlerError(
            `Crawl ${this._uuid} failed: ${status.state.stop_reason ?? 'unknown reason'}`,
            { code: 'FAILED', stop_reason: status.state.stop_reason, status },
          );
        }
        if (status.isCancelled) {
          if (allowCancelled) {
            if (verbose) {
              log.info(`crawl ${this._uuid} was cancelled (allowCancelled=true)`);
            }
            return this;
          }
          throw new errors.ScrapflyCrawlerError(
            `Crawl ${this._uuid} was cancelled (reason: ${status.state.stop_reason ?? 'unknown'})`,
            { code: 'CANCELLED', stop_reason: status.state.stop_reason, status },
          );
        }
        // status.isComplete
        return this;
      }

      if (maxWait !== undefined) {
        const elapsedSeconds = (Date.now() - start) / 1000;
        if (elapsedSeconds + pollInterval > maxWait) {
          throw new errors.ScrapflyCrawlerError(
            `Timed out waiting for crawl ${this._uuid} after ${maxWait}s`,
            { code: 'TIMEOUT', status },
          );
        }
      }

      await new Promise((resolve) => setTimeout(resolve, pollInterval * 1000));
    }
  }

  /** Cancel the crawl. Returns `true` on success. */
  async cancel(): Promise<boolean> {
    const uuid = this.requireUuid();
    return await this.client.crawlCancel(uuid);
  }

  /**
   * List crawled URLs (paginated, optionally filtered by status).
   *
   * Convenience wrapper around `client.crawlUrls(uuid, opts)`. **New endpoint** —
   * not available in the Python SDK as of 0.8.27.
   */
  async urls(opts?: {
    status?: 'visited' | 'pending' | 'failed';
    page?: number;
    per_page?: number;
  }): Promise<CrawlerUrls> {
    const uuid = this.requireUuid();
    return await this.client.crawlUrls(uuid, opts);
  }

  /**
   * Read raw content for a single crawled URL using `plain=true` mode.
   *
   * Returns `null` if the URL has no content for that format. Throws
   * `ScrapflyCrawlerError` for any non-404 error. **New mode** — not available in
   * the Python SDK as of 0.8.27.
   */
  async read(url: string, format: CrawlerContentFormat = 'html'): Promise<string | null> {
    const uuid = this.requireUuid();
    try {
      const result = await this.client.crawlContents(uuid, { url, format, plain: true });
      // crawlContents in plain mode always returns string
      return typeof result === 'string' ? result : JSON.stringify(result);
    } catch (e) {
      // Treat 404 as "no content for this URL" rather than re-throwing
      if (e instanceof errors.ScrapflyError && (e.args?.http_status_code === 404)) {
        return null;
      }
      throw e;
    }
  }

  /**
   * Batch-read content for multiple URLs in one round-trip.
   *
   * Convenience wrapper around `client.crawlContentsBatch`. Limited to 100 URLs.
   */
  async readBatch(
    urls: string[],
    formats: CrawlerContentFormat[] = ['html'],
  ): Promise<Record<string, Record<string, string>>> {
    const uuid = this.requireUuid();
    return await this.client.crawlContentsBatch(uuid, urls, formats);
  }

  /**
   * Download the WARC artifact (cached after first call).
   */
  async warc(): Promise<CrawlerArtifact> {
    const uuid = this.requireUuid();
    const cached = this._artifactCache.get('warc');
    if (cached) return cached;
    const artifact = await this.client.crawlArtifact(uuid, 'warc');
    this._artifactCache.set('warc', artifact);
    return artifact;
  }

  /**
   * Download the HAR artifact (cached after first call).
   */
  async har(): Promise<CrawlerArtifact> {
    const uuid = this.requireUuid();
    const cached = this._artifactCache.get('har');
    if (cached) return cached;
    const artifact = await this.client.crawlArtifact(uuid, 'har');
    this._artifactCache.set('har', artifact);
    return artifact;
  }
}
