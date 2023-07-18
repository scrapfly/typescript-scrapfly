// raised when API key provided to client is not valid or not existant
export class BadApiKeyError extends Error { }
// raised when scrape config is invalid
export class ScrapeConfigError extends Error { }