/*
This example shows how to POST JSON using scrapfly
*/
import { ScrapflyClient, ScrapeConfig } from 'scrapfly-sdk';

const key = 'YOUR SCRAPFLY KEY';
const client = new ScrapflyClient({ key });
const result = await client.scrape(
    new ScrapeConfig({
        url: 'https://httpbin.dev/post',
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        data: { foo: 'bar' },
    }),
);
console.log(JSON.parse(result.result.content));
