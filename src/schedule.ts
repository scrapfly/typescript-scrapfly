/**
 * Public schedule client for the Scrapfly API.
 *
 * Wraps `/scrape/schedules`, `/screenshot/schedules`, `/crawl/schedules`
 * and the cross-kind `/schedules` endpoints. The server returns fully-formed
 * Schedule objects; we surface them as-is so callers always see the live
 * server shape.
 */

/** Bounds a recurring schedule by either a date or a fire count. */
export interface ScheduleEnd {
  type: 'date' | 'count';
  date?: string;
  count?: number;
}

/**
 * When a schedule fires next. Cron mode wins when `cron` is set; otherwise
 * `interval` + `unit` drive the cadence.
 */
export interface ScheduleRecurrence {
  cron?: string;
  interval?: number;
  unit?: 'minute' | 'hour' | 'day' | 'week' | 'month';
  days?: string[];
  ends?: ScheduleEnd;
}

/**
 * Public-facing request envelope for creating a schedule. The kind-specific
 * config (`scrape_config` / `screenshot_config` / `crawler_config`) is
 * supplied as a separate argument by the matching `create*Schedule` method.
 */
export interface CreateScheduleRequest {
  webhook_name: string;
  recurrence?: ScheduleRecurrence;
  scheduled_date?: string;
  allow_concurrency?: boolean;
  retry_on_failure?: boolean;
  max_retries?: number;
  notes?: string;
}

/** PATCH payload. Only fields explicitly set are forwarded. */
export interface UpdateScheduleRequest {
  recurrence?: ScheduleRecurrence;
  scheduled_date?: string;
  allow_concurrency?: boolean;
  retry_on_failure?: boolean;
  max_retries?: number;
  notes?: string;
  scrape_config?: Record<string, unknown>;
  screenshot_config?: Record<string, unknown>;
  crawler_config?: Record<string, unknown>;
}

/** Server-side schedule record. Returned by every read or mutation endpoint. */
export interface Schedule {
  id: string;
  kind: string;
  status: string;
  next_scheduled_date?: string;
  scheduled_date?: string;
  recurrence?: ScheduleRecurrence;
  metadata?: Record<string, unknown>;
  notes?: string | null;
  created_by?: string | null;
  created_at: string;
  updated_at: string;
  cancelled_at?: string | null;
  allow_concurrency: boolean;
  retry_on_failure: boolean;
  max_retries: number;
  webhook_uuid?: string | null;
  user_uuid?: string | null;
  consecutive_failures?: number;
}

export interface ListSchedulesOptions {
  status?: string;
  kind?: string;
}

/**
 * Raised on any non-2xx response from a `/schedules/*` endpoint. The
 * `code` property carries the public `ERR::SCHEDULER::*` identifier so
 * callers can branch on it without parsing the message string.
 */
export class ScheduleAPIError extends Error {
  code: string;
  httpStatusCode: number;
  details: unknown;

  constructor(args: { code: string; message: string; httpStatusCode: number; details?: unknown }) {
    super(args.message);
    this.name = 'ScheduleAPIError';
    this.code = args.code;
    this.httpStatusCode = args.httpStatusCode;
    this.details = args.details;
  }
}
