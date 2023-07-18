import { ScrapflyClient, ScrapeConfig } from "scrapfly-sdk";

const key = "YOUR_SCRAPFLY_KEY";
const client = new ScrapflyClient({key});
const result = await client.asyncScrape(new ScrapeConfig({
    "url": "https://web-scraping.dev/product/1",
    "render_js": true,
    "wait_for_selector": ".review",
    "js": "return [...document.querySelectorAll('.review p')].map(p=>p.outerText)"
}))
console.log(result.result.browser_data.javascript_evaluation_result)