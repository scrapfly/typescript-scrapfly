import { ScrapflyClient, ScrapeConfig } from '../build/src/main.js';
import { BadApiKeyError } from '../build/src/errors.js';

const key = 'YOUR SCRAPFLY KEY';
const client = new ScrapflyClient({ key });
const acc = await client.account();
console.log(acc);

const result = await client.scrape(
    new ScrapeConfig({
        url: 'https://httpbin.dev/html',
    }),
);
console.log(result);
