import { ScrapflyClient, ScrapeConfig } from "scrapfly-sdk";

const key = "YOUR_SCRAPFLY_KEY";
const client = new ScrapflyClient({ key });
const result = await client.asyncScrape(new ScrapeConfig({
    "url": "https://web-scraping.dev/product/1",
    "render_js": true,
    "debug": true,
    "js_scenario": [
        { "wait_for_selector": { "selector": ".review" } },
        { "execute": { "script": "return navigator.userAgent" } },
        { "click": { "selector": "#load-more-reviews" } },
        { "wait_for_navigation": {} },
        { "execute": { "script": "[...document.querySelectorAll('.review p')].map(p=>p.outerText)" } }
    ]
}))
console.log(result.result.browser_data.js_scenario)