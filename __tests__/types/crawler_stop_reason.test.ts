// The checks here are the compiler's: `deno test` type-checks this file, and each line fails to compile when the type it
// pins changes. The values of `state.stop_reason` the API returns are the ones CrawlerStopReason names, the values it no
// longer sets stay in it as LegacyCrawlerStopReason, and any other name does not compile.
import type { CrawlerStopReason, LegacyCrawlerStopReason } from '../../src/main.ts';

export function stopReasons() {
  const returned = [
    'backlog_empty',
    'retry_backlog_only',
    'no_more_urls',
    'page_limit',
    'max_duration_reached',
    'max_api_credit',
    'seed_url_failed',
    'user_cancelled',
    'crawler_error',
    'target_not_allowed',
    'webhook_not_found',
    'storage_error',
    'remote_list_fetch_failed',
    'remote_list_too_large',
    'worker_interrupted',
    'internal_error',
  ] as const satisfies readonly CrawlerStopReason[];

  const legacy = [
    'max_duration',
    'no_api_credit_left',
    'worker_interupted',
  ] as const satisfies readonly LegacyCrawlerStopReason[];
  const legacyAreReasons = legacy satisfies readonly CrawlerStopReason[];

  // @ts-expect-error the API never returns it
  const notAStopReason: CrawlerStopReason = 'cancelled';

  void returned;
  void legacyAreReasons;
  void notAStopReason;
}
