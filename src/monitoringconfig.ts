/**
 * Option types for the Scrapfly Monitoring API endpoints.
 *
 * The Monitoring API exposes dashboard metrics for each product (scrape,
 * screenshot, extraction, crawler, cloud browser). The types here mirror
 * the query parameters accepted by those endpoints.
 */

/** Output format of the monitoring payload. */
export type MonitoringDataFormat = 'structured' | 'prometheus';

/** Rolling time window to aggregate metrics over. */
export type MonitoringPeriod = 'subscription' | 'last7d' | 'last24h' | 'last1h' | 'last5m';

/** Grouping level for aggregated metrics. */
export type MonitoringAggregation = 'account' | 'project' | 'target';

/** Options common to the per-product Monitoring metrics endpoints. */
export interface MonitoringMetricsOptions {
  /** Payload format. Defaults to `structured`. */
  format?: MonitoringDataFormat;
  /** Time window to aggregate over. */
  period?: MonitoringPeriod;
  /** Grouping levels. */
  aggregation?: MonitoringAggregation[];
  /**
   * Fold WEBHOOK-origin events (callbacks executed by the webhook
   * worker) into this product's totals. Defaults to false to match the
   * dashboard's default view.
   */
  includeWebhook?: boolean;
}

/** Options for the per-target ("per domain") Monitoring endpoints. */
export interface MonitoringTargetMetricsOptions {
  /** Domain to query metrics for. Required. */
  domain: string;
  /** Collapse subdomains into the parent domain. */
  groupSubdomain?: boolean;
  /** Time window to aggregate over. */
  period?: MonitoringPeriod;
  /** Window start (takes precedence over `period` when set together). */
  start?: Date;
  /** Window end. */
  end?: Date;
  /** Fold WEBHOOK-origin events into this product's totals. */
  includeWebhook?: boolean;
}

/**
 * Options for the Cloud Browser monitoring endpoints.
 *
 * Cloud Browser is session-based (one allocation = one long-lived
 * browser, billed by runtime + bandwidth) and exposes a distinct shape
 * from the request-based products. There is no `domain`/`target` and
 * no `includeWebhook`.
 */
export interface CloudBrowserMonitoringOptions {
  /** Time window to aggregate over. */
  period?: MonitoringPeriod;
  /**
   * Optional filter to a single proxy pool
   * (e.g. `public_datacenter_pool`, `public_residential_pool`, `byop`).
   */
  proxyPool?: string;
  /** Window start. */
  start?: Date;
  /** Window end. */
  end?: Date;
}

/**
 * Format a Date as a UTC string accepted by the Monitoring API date
 * filters (`YYYY-MM-DD HH:MM:SS`).
 *
 * @param d Date to format.
 * @returns UTC timestamp string.
 */
export function formatMonitoringDate(d: Date): string {
  const pad = (n: number): string => n.toString().padStart(2, '0');
  const y = d.getUTCFullYear();
  const mo = pad(d.getUTCMonth() + 1);
  const da = pad(d.getUTCDate());
  const h = pad(d.getUTCHours());
  const mi = pad(d.getUTCMinutes());
  const s = pad(d.getUTCSeconds());
  return `${y}-${mo}-${da} ${h}:${mi}:${s}`;
}
