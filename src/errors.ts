/**
 * Base class for every error thrown by the Scrapfly SDK.
 *
 * Concrete subclasses distinguish config-level, HTTP-level, and
 * API-specific failures so callers can catch the exact category they
 * care about without string-matching on error messages.
 */
export class ScrapflyError extends Error {
  /** Extra context carried alongside the error message (response body, request params, etc.). */
  args: Record<string, any>;

  /**
   * @param message Human-readable description of the failure.
   * @param args Optional structured context to attach to the error.
   */
  constructor(message: string, args: Record<string, any> = {}) {
    super(message);
    this.args = args;
  }
}

/** Raised when a ScrapeConfig is constructed with invalid parameters. */
export class ScrapeConfigError extends ScrapflyError {}
/** Raised when a ScreenshotConfig is constructed with invalid parameters. */
export class ScreenshotConfigError extends ScrapflyError {}
/** Raised when an ExtractionConfig is constructed with invalid parameters. */
export class ExtractionConfigError extends ScrapflyError {}
/** Raised when a CrawlerConfig is constructed with invalid parameters. */
export class CrawlerConfigError extends ScrapflyError {}

/** Raised when scrape parameters cannot be encoded into a request. */
export class EncodeError extends ScrapflyError {}
/** Raised when a response carries an unexpected or unsupported Content-Type. */
export class ContentTypeError extends ScrapflyError {}

/** Base error for every HTTP-level failure surfaced by the SDK. */
export class HttpError extends ScrapflyError {}
/** Raised when the upstream target returned an error to Scrapfly. */
export class UpstreamHttpError extends HttpError {}
/** Raised when the upstream target returned a 4xx client error. */
export class UpstreamHttpClientError extends UpstreamHttpError {}
/** Raised when the upstream target returned a 5xx server error. */
export class UpstreamHttpServerError extends UpstreamHttpClientError {}

/** Raised when the Scrapfly API itself returned a 4xx client error. */
export class ApiHttpClientError extends HttpError {}
/** Raised when the API key provided to the client is missing, invalid, or revoked. */
export class BadApiKeyError extends ApiHttpClientError {}

/** Raised when the request is rate-limited (HTTP 429). */
export class TooManyRequests extends HttpError {}
/** Raised when the Scrapfly API returned a 5xx server error. */
export class ApiHttpServerError extends HttpError {}
/** Raised when a scrape call fails for a reason not captured by a more specific subclass. */
export class ScrapflyScrapeError extends HttpError {}
/** Raised when proxy settings do not match an available proxy (invalid pool, unsupported country, ...). */
export class ScrapflyProxyError extends HttpError {}
/** Raised when the request is throttled by Scrapfly (e.g. burst limits). */
export class ScrapflyThrottleError extends HttpError {}
/** Raised when Scrapfly failed to bypass anti-scraping protection on the target. */
export class ScrapflyAspError extends HttpError {}
/** Raised when a scheduled scrape cannot be created or fulfilled. */
export class ScrapflyScheduleError extends HttpError {}
/** Raised when a webhook is invalid or cannot be delivered (e.g. full queue). */
export class ScrapflyWebhookError extends HttpError {}
/** Raised when a session is accessed concurrently in a way that violates session semantics. */
export class ScrapflySessionError extends HttpError {}
/** Raised when concurrent requests exceed the account's concurrency limit. */
export class TooManyConcurrentRequests extends HttpError {}
/** Raised when the account is out of scrape credits. */
export class QuotaLimitReached extends HttpError {}
/** Raised for screenshot-API-specific failures. */
export class ScreenshotApiError extends ApiHttpClientError {}
/** Raised for extraction-API-specific failures. */
export class ExtractionApiError extends ApiHttpClientError {}
/**
 * Raised for crawler-API-specific failures.
 *
 * Covers crawler job lifecycle errors such as ALREADY_STARTED,
 * NOT_STARTED, FAILED, CANCELLED, TIMEOUT, etc.
 */
export class ScrapflyCrawlerError extends HttpError {}
