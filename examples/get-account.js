import { ScrapflyClient, ScrapeConfig } from "../build/src/main.js";
import { BadApiKeyError } from "../build/src/errors.js";

const key = "YOUR_SCRAPFLY_KEY";
const client = new ScrapflyClient({key});
try{
    const acc = await client.account();
    console.log(acc);
} catch (e) {
    if (e instanceof BadApiKeyError) {
        console.log('A specific error occurred:', e.message);
    } else {
        console.log('An unknown error occurred:', e.message);
    }
}

const result = await client.asyncScrape(new ScrapeConfig({
    "url": "https://httpbin.dev/html",
}))
console.log(result)