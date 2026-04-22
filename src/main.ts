/**
 * # Scrapfly SDK for TypeScript / JavaScript
 *
 * Official client library for the [Scrapfly](https://scrapfly.io) web
 * scraping API. Provides typed wrappers around the Scrape, Screenshot,
 * Extraction, Crawler, Monitoring, and Cloud Browser APIs.
 *
 * ## Quick start
 *
 * ```ts
 * import { ScrapflyClient, ScrapeConfig } from '@scrapfly/scrapfly-sdk';
 *
 * const client = new ScrapflyClient({ key: 'your-api-key' });
 * const result = await client.scrape(new ScrapeConfig({
 *   url: 'https://web-scraping.dev/products',
 *   render_js: true,
 *   asp: true,
 * }));
 * console.log(result.content);
 * ```
 *
 * See the [Scrapfly docs](https://scrapfly.io/docs) for the full API
 * reference.
 *
 * @module
 */
export { ScrapflyClient } from './client.ts';
export {
  Format as ScrapeFormat,
  FormatOption as ScrapeFormatOptions,
  ScrapeConfig,
  ScreenshotFlags,
} from './scrapeconfig.ts';
export {
  Format as ScreenshotFormat,
  Options as ScreenshotOptions,
  ScreenshotConfig,
  VisionDeficiency,
} from './screenshotconfig.ts';
export { ExtractionConfig } from './extractionconfig.ts';
export { BrowserConfig, ProxyPool, OperatingSystem } from './browserconfig.ts';
export type { BrowserConfigOptions } from './browserconfig.ts';
/** Namespace of every error class the SDK can throw. See {@link ScrapflyError}. */
export * as errors from './errors.ts';

export { ExtractionResult, ScrapeResult, ScreenshotResult } from './result.ts';

export type { AccountData, ClassifyOptions, ClassifyResult, ConfigData, ContextData, ResultData, ScreenshotMetadata } from './result.ts';

// Crawler API
export { CrawlerConfig } from './crawlerconfig.ts';
export type { CrawlerConfigOptions, CrawlerContentFormat, CrawlerWebhookEventName } from './crawlerconfig.ts';
export { Crawl } from './crawl.ts';
export {
  CrawlerArtifact,
  CrawlerContents,
  CrawlerStatus,
  CrawlerUrls,
  parseCrawlerWebhook,
} from './crawlerresult.ts';
export type {
  CrawlerArtifactType,
  CrawlerLifecycleWebhook,
  CrawlerState,
  CrawlerStatusValue,
  CrawlerStopReason,
  CrawlerUrlDiscoveredWebhook,
  CrawlerUrlEntry,
  CrawlerUrlFailedWebhook,
  CrawlerUrlSkippedWebhook,
  CrawlerUrlVisitedWebhook,
  CrawlerWebhookCommon,
  CrawlerWebhookPayload,
} from './crawlerresult.ts';

// Monitoring API
export type {
  CloudBrowserMonitoringOptions,
  MonitoringAggregation,
  MonitoringDataFormat,
  MonitoringMetricsOptions,
  MonitoringPeriod,
  MonitoringTargetMetricsOptions,
} from './monitoringconfig.ts';

export { log } from './logger.ts';

export { createServer, verifySignature } from './webhookserver.ts';
