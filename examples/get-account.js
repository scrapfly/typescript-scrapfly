import { ScrapflyClient, ScrapeConfig } from 'scrapfly-sdk';

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
