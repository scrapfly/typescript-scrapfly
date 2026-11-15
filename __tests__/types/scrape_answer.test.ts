// The checks here are the compiler's: `deno test` type-checks this file, and each line fails to compile
// when the type it pins changes. `nonstrict.json` checks the same answers with strict mode off.
import { ScrapeConfig, ScrapflyClient } from '../../src/main.ts';
import type { ScrapeResult } from '../../src/main.ts';

export async function answers(client: ScrapflyClient, flag: boolean, loose: any) {
  const plain: ScrapeResult = await client.scrape(new ScrapeConfig({ url: 'https://web-scraping.dev/product/1' }));
  plain.result.content;

  const off: ScrapeResult = await client.scrape(
    new ScrapeConfig({ url: 'https://web-scraping.dev/product/1', proxified_response: false, format: 'markdown' }),
  );
  off.selector;

  const raw: Response = await client.scrape(
    new ScrapeConfig({ url: 'https://web-scraping.dev/product/1', proxified_response: true }),
  );
  raw.headers;

  const either = await client.scrape(new ScrapeConfig({ url: 'https://web-scraping.dev/product/1', proxified_response: flag }));
  const eitherType: ScrapeResult | Response = either;
  if (either instanceof Response) {
    either.headers;
  } else {
    either.result.content;
  }

  const ternary = await client.scrape(
    new ScrapeConfig(flag ? { url: 'https://web-scraping.dev/product/1', proxified_response: true } : { url: 'https://web-scraping.dev/product/1' }),
  );
  const ternaryType: ScrapeResult | Response = ternary;
  const spread = await client.scrape(
    new ScrapeConfig({ url: 'https://web-scraping.dev/product/1', ...(flag ? { proxified_response: true } : {}) }),
  );
  const spreadType: ScrapeResult | Response = spread;
  const ternaryAsResult = ternary as ScrapeResult;
  const spreadAsResponse = spread as Response;
  void ternaryType; void spreadType; void ternaryAsResult; void spreadAsResponse;

  const fromAny = await client.scrape(new ScrapeConfig(loose));
  const fromAnyAsResult = fromAny as ScrapeResult;
  const fromAnyAsResponse = fromAny as Response;
  void eitherType; void fromAnyAsResult; void fromAnyAsResponse;
}

export async function compatibility(client: ScrapflyClient) {
  const typed: ScrapeConfig = new ScrapeConfig({ url: 'https://web-scraping.dev/product/1', proxified_response: true });
  const answer: ScrapeResult | Response = await client.scrape(typed);
  const castResult = (await client.scrape(typed)) as ScrapeResult;
  const castResponse = (await client.scrape(typed)) as Response;
  const list: ScrapeConfig[] = [
    new ScrapeConfig({ url: 'https://web-scraping.dev/product/1' }),
    new ScrapeConfig({ url: 'https://web-scraping.dev/product/2', proxified_response: true }),
  ];
  for await (const result of client.concurrentScrape(list, 2)) {
    void result;
  }
  let reassigned = new ScrapeConfig({ url: 'https://web-scraping.dev/product/1', render_js: true });
  reassigned = new ScrapeConfig({ url: 'https://web-scraping.dev/product/2' });
  let widened = new ScrapeConfig({ url: 'https://web-scraping.dev/product/1' });
  widened = new ScrapeConfig({ url: 'https://web-scraping.dev/product/2', render_js: true });
  class Mine extends ScrapeConfig {}
  const sub = await client.scrape(new Mine({ url: 'https://web-scraping.dev/product/1' }));
  void answer; void castResult; void castResponse; void reassigned; void widened; void sub;
}

Deno.test('types: scrape answers the type its config says', () => {
  void answers;
  void compatibility;
});
