/*
This example shows how to use concurrentScrape
which allows to execute multiple scraping tasks concurrently

note: 
    each scrapfly tier has concurrency limit see here:
    https://scrapfly.io/pricing
    the client will automatically set the limit to your maximum
    if you set the limit to high expect errors.TooManyConcurrentRequests
*/
import { ScrapflyClient, ScrapeConfig } from 'scrapfly-sdk';

const key = 'YOUR SCRAPFLY KEY';
const client = new ScrapflyClient({ key });
const configs = [
    // these two will succeed:
    ...new Array(2).fill(null).map(() => new ScrapeConfig({ url: 'https://httpbin.dev/status/200' })),
    // these two will fail:
    ...new Array(2).fill(null).map(() => new ScrapeConfig({ url: 'https://httpbin.dev/status/403' })),
];
const results = [];
const errors = [];
for await (const resultOrError of client.concurrentScrape(configs)) {
    if (resultOrError instanceof Error) {
        errors.push(resultOrError);
    } else {
        results.push(resultOrError);
    }
}
console.log(`got ${results.length} results:`);
console.log(results);
console.log(`got ${errors.length} errors:`);
console.log(errors);
