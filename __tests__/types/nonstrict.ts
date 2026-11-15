// Type-checked with strict mode off (`deno task check-types-nonstrict`): what a customer's tsconfig without
// `strict` sees. A plain config must still answer ScrapeResult there, and `any` options the union.
import { answers, compatibility } from './scrape_answer.test.ts';

void answers;
void compatibility;
