/*
This example shows how to POST a form using scrapfly
*/
import { ScrapflyClient, ScrapeConfig } from '../build/src/main.js';

const key = 'YOUR SCRAPFLY KEY';
const client = new ScrapflyClient({ key });
const result = await client.scrape(
    new ScrapeConfig({
        url: 'https://httpbin.dev/post',
        method: 'POST',
        data: { foo: 'bar' },
    }),
);
console.log(JSON.parse(result.result.content));
