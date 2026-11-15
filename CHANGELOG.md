# Changelog

## 1.0.0 (2026-11-15)

Nothing changes at runtime: every request and answer is the one 0.12 sends and returns. The major version is for
TypeScript: some code that compiled against 0.12 needs a change to compile against 1.0.

### Breaking changes (TypeScript only)

- **`client.scrape()` is typed by its config.** `ScrapeConfig` is now generic over the options it was built from, and
  `scrape()` answers `Promise<ScrapeResult>` for a config without `proxified_response` (or with `false`),
  `Promise<Response>` with `proxified_response: true`, and `Promise<ScrapeResult | Response>` when the options do not
  say which (a `boolean` variable, `any`, or a value typed as plain `ScrapeConfig`). `result.result.content` now
  compiles without a cast.
  - **A cast or a narrowing between the two answers no longer compiles** where the type is now known:
    `(await client.scrape(new ScrapeConfig({ url }))) as Response` is refused (the answer is a `ScrapeResult`), and
    after `if (r instanceof ScrapeResult) { ... } else { ... }` (or `'result' in r`) the `else` branch is `never`, so
    reading `r.status` or `r.headers` there fails. Remove the cast or the dead branch, or type the config as plain
    `ScrapeConfig` to keep the union.
  - **A subclass or a typed mock that overrides `scrape`** with `scrape(config: ScrapeConfig): Promise<ScrapeResult |
    Response>` no longer matches. Declare it as `scrape<O extends ScrapeConfigOptions>(config: ScrapeConfig<O>):
    Promise<ScrapeAnswer<O>>` (both types are exported), and return `super.scrape(config)` (a subclass) or a value
    cast to `ScrapeAnswer<O>` (a mock).
  - **A variable that holds both a proxified and a plain config** takes the type of the first one assigned: type it as
    plain `ScrapeConfig` (`let config: ScrapeConfig = ...`) so `scrape()` answers the union.
- **An options object holding a key `ScrapeConfig` does not take fails to compile** when passed as a variable or a
  spread (`const options = { url, wait_for: 5000 }; new ScrapeConfig(options)`), as it already failed at runtime
  with `ScrapeConfigError: Invalid option provided` (a literal was already refused in 0.12). Options built with
  computed keys are still checked at runtime only.

### Added

- `ScrapeAnswer<O>` and `ScrapeConfigOptions` are exported.
- `deno task test` also type-checks the typed answers with strict mode off.

## 0.12.2 (2026-11-15)

### Changed

- The docs name only the proxy pools the API accepts: `ScrapeConfig.PUBLIC_DATACENTER_POOL` (the default),
  `PUBLIC_RESIDENTIAL_POOL` and `PUBLIC_TOR_POOL`. `BASIC`, `UNBLOCKER`, `UNBLOCKER_ULTRA` and `AUTO` stay exported
  and are not accepted by the API yet: a request naming one fails with `ERR::PROXY::POOL_NOT_FOUND`. The anti-bot
  bypass is the `unblocker` option, no longer marked deprecated; `asp` stays its deprecated alias.
- `ScreenshotConfig`'s `proxy_pool` is documented as ignored by the Screenshot API, which picks its pool itself.
- `ResultData` types `extracted_data`.

### Fixed

- README, JSDoc and examples: `apiResponse.selector`, `result.result.content`, the webhook servers' `createServer(secret,
  callback)`, `result.args.code`, the Deno and Bun specifiers, the examples' usage text.

## 0.12.1 (2026-11-15)

### Fixed

- The README imported `ScrapflyUnblockerError` from the package root; the error classes are under `errors`
  (`errors.ScrapflyUnblockerError`). A test now checks every name a README, example or JSDoc snippet imports from
  the package.
- `deno task test` runs the tests that write temporary files.

### Added (since 0.12.0)

- `crawlPromptAnswer` and `crawlExtract`; Cloud Browser download helpers (`CloudBrowserDownloads`, `parseDownloads`).
- A batch entry sends its config's `method` and `body` (a POST config ran as a GET).
- The API key is masked in fetch errors.
