/*
This example shows how to enable headless browser use
in scrapfly and how to execute custom javascript code
*/
import { ScrapflyClient, ScrapeConfig } from "scrapfly-sdk";

const key = "YOUR_SCRAPFLY_KEY";
const client = new ScrapflyClient({key});
const result = await client.scrape(new ScrapeConfig({
    "url": "https://web-scraping.dev/product/1",
    // enable headless browsers
    "render_js": true,
    // wait for reviews to load on the page
    "wait_for_selector": ".review",
    // execute custom javascript code
    // which returns all review texts on the page
    "js": "return [...document.querySelectorAll('.review p')].map(p=>p.outerText)"
}))
console.log(result.result.browser_data.javascript_evaluation_result)