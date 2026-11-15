// Strict mode only (what `deno test` checks): a typo in an option, and the answers strict null checks can tell
// apart. Without strict mode an `undefined` value widens to `any`, which answers the union.
import { ScrapeConfig, ScrapflyClient } from '../../src/main.ts';
import type { ScrapeResult } from '../../src/main.ts';

export function strictOnly(client: ScrapflyClient, flag: boolean) {
  // @ts-expect-error an option the constructor does not take fails to compile
  new ScrapeConfig({ url: 'https://web-scraping.dev/product/1', wait_for: 5000 });
  return async () => {
    const either = await client.scrape(new ScrapeConfig({ url: 'https://web-scraping.dev/product/1', proxified_response: flag }));
    // @ts-expect-error a boolean variable does not say which answer comes back
    either.result;
    const ternary = await client.scrape(
      new ScrapeConfig(flag ? { url: 'https://web-scraping.dev/product/1', proxified_response: true } : { url: 'https://web-scraping.dev/product/1' }),
    );
    // @ts-expect-error a ternary of options does not say which answer comes back
    ternary.headers;
    // @ts-expect-error nor does a conditional spread
    (await client.scrape(new ScrapeConfig({ url: 'https://web-scraping.dev/product/1', ...(flag ? { proxified_response: true } : {}) }))).result;
    const unset: ScrapeResult = await client.scrape(
      new ScrapeConfig({ url: 'https://web-scraping.dev/product/1', proxified_response: undefined }),
    );
    unset.result.content;
  };
}


Deno.test('types: strict mode refuses an unknown option and narrows an unset proxified_response', () => {
  void strictOnly;
});
