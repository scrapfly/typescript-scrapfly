export class ScrapflyError extends Error {
    args: Record<string, any>;

    constructor(message: string, args?: Record<string, any>) {
        super(message);
        this.args = args;
 }
}

// raised when scrape config is invalid
export class ScrapeConfigError extends ScrapflyError { }

// raised when scrape parameters cannot be encoded
export class EncodeError extends ScrapflyError { }

// Base error for all http related operations
export class HttpError extends ScrapflyError { }
export class UpstreamHttpError extends HttpError { }
export class UpstreamHttpClientError extends UpstreamHttpError { }
export class UpstreamHttpServerError extends UpstreamHttpClientError { }

export class ApiHttpClientError extends HttpError { }
// raised when API key provided to client is not valid or not existant
export class BadApiKeyError extends ApiHttpClientError { }

export class TooManyRequests extends HttpError { }
export class ApiHttpServerError extends HttpError { }
export class ScrapflyScrapeError extends HttpError { }
export class ScrapflyProxyError extends HttpError { }
export class ScrapflyThrottleError extends HttpError { }
export class ScrapflyAspError extends HttpError { }
export class ScrapflyScheduleError extends HttpError { }
export class ScrapflyWebhookError extends HttpError { }
export class ScrapflySessionError extends HttpError { }
export class TooManyConcurrentRequest extends HttpError { }
export class QuotaLimitReached extends HttpError { }

