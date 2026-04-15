export type MonitoringDataFormat = 'structured' | 'prometheus';

export type MonitoringPeriod = 'subscription' | 'last7d' | 'last24h' | 'last1h' | 'last5m';

export type MonitoringAggregation = 'account' | 'project' | 'target';

export interface MonitoringMetricsOptions {
  format?: MonitoringDataFormat;
  period?: MonitoringPeriod;
  aggregation?: MonitoringAggregation[];
  /** Fold WEBHOOK origin events (callbacks executed by the webhook
   * worker) into this product's totals. Defaults to false to match
   * the dashboard's default view. */
  includeWebhook?: boolean;
}

export interface MonitoringTargetMetricsOptions {
  domain: string;
  groupSubdomain?: boolean;
  period?: MonitoringPeriod;
  start?: Date;
  end?: Date;
  /** Fold WEBHOOK origin events into this product's totals. */
  includeWebhook?: boolean;
}

/** Options for the Cloud Browser monitoring endpoints. Cloud Browser
 * is session-based (one allocation = one long-lived browser, billed
 * by runtime + bandwidth) and exposes a distinct shape from the
 * request-based products. There is no `domain`/`target` and no
 * `includeWebhook`. */
export interface CloudBrowserMonitoringOptions {
  period?: MonitoringPeriod;
  /** Optional filter to a single proxy pool
   *  (e.g. `public_datacenter_pool`, `public_residential_pool`, `byop`). */
  proxyPool?: string;
  start?: Date;
  end?: Date;
}

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
