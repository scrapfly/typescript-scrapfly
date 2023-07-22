/*
This example shows how to set custom headers in scrapfly requests
*/
import { ScrapflyClient, ScrapeConfig } from '../build/src/main.js';

const key = 'YOUR SCRAPFLY KEY';
const client = new ScrapflyClient({ key });
const result = await client.scrape(
    new ScrapeConfig({
        url: 'https://httpbin.dev/post',
        headers: {
            referer: 'https://foo.com',
            'x-csrf-token': '12345',
            // note: some headers can be overriden by scrapfly
        },
    }),
);
console.log(JSON.parse(result.result.content));
