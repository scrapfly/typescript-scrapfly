export class ScrapflyError extends Error {
    args: Record<string, any>;

    constructor(message: string, args?: Record<string, any>) {
        super(message);
        this.args = args;
    }
}

// raised when scrape config is invalid
export class ScrapeConfigError extends ScrapflyError {}
// raised when screenshot config is invalid
export class ScreenshotConfigError extends ScrapflyError {}
// raised when extraction config is invalid
export class ExtractionConfigError extends ScrapflyError {}

// raised when scrape parameters cannot be encoded
export class EncodeError extends ScrapflyError {}
export class ContentTypeError extends ScrapflyError {}

// Base error for all http related operations
export class HttpError extends ScrapflyError {}
export class UpstreamHttpError extends HttpError {}
export class UpstreamHttpClientError extends UpstreamHttpError {}
export class UpstreamHttpServerError extends UpstreamHttpClientError {}

export class ApiHttpClientError extends HttpError {}
// raised when API key provided to client is not valid or not existant
export class BadApiKeyError extends ApiHttpClientError {}

export class TooManyRequests extends HttpError {}
export class ApiHttpServerError extends HttpError {}
export class ScrapflyScrapeError extends HttpError {}
// raised when proxy settings don't match available proxies (e.g. invalid proxy pool, country setting)
export class ScrapflyProxyError extends HttpError {}
export class ScrapflyThrottleError extends HttpError {}
// raised when ScrapFly fails to bypass anti-scraping protection
export class ScrapflyAspError extends HttpError {}
export class ScrapflyScheduleError extends HttpError {}
// raised when Webhook is invalid or cannot be fulfilled (i.e. full queue)
export class ScrapflyWebhookError extends HttpError {}
// raised when session is access concurrently
export class ScrapflySessionError extends HttpError {}
// raised when concurrent requests exceed account limits
export class TooManyConcurrentRequests extends HttpError {}
// raised when account is out of scrape credits
export class QuotaLimitReached extends HttpError {}
// raised with Scrapfly screenshot API related errors
export class ScreenshotApiError extends ApiHttpClientError {}
// raised with Scrapfly extraction API related errors
export class ExtractionApiError extends ApiHttpClientError {}
