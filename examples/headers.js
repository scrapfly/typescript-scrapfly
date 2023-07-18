import { ScrapflyClient, ScrapeConfig } from "../build/src/main.js";

const key = "YOUR_SCRAPFLY_KEY";
const client = new ScrapflyClient({key});
const result = await client.asyncScrape(new ScrapeConfig({
    url: "https://httpbin.dev/post",
    headers: {
        "referer": "https://foo.com",
        "x-csrf-token": "12345",
    }
}))
console.log(JSON.parse(result.result.content))