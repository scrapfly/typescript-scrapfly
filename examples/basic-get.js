import { ScrapflyClient, ScrapeConfig } from "scrapfly-sdk";

const key = "YOUR_SCRAPFLY_KEY";
const client = new ScrapflyClient({key});
const result = await client.asyncScrape(new ScrapeConfig({
    "url": "https://httpbin.dev/html",
}))
console.log(result.result)