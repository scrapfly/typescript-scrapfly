/*
Most basic scrapfly request - GET a provided url
*/
import { ScrapflyClient, ScrapeConfig } from 'scrapfly-sdk';

const key = 'YOUR_SCRAPFLY_KEY';
const client = new ScrapflyClient({ key });
const result = await client.scrape(
    new ScrapeConfig({
        url: 'https://httpbin.dev/html',
    }),
);
console.log(result.result.content); // html content
