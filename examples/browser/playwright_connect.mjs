/**
 * Connect Playwright to Scrapfly Cloud Browser
 *
 * npm install scrapfly-sdk playwright
 */
import { ScrapflyClient, BrowserConfig } from 'scrapfly-sdk';
import { chromium } from 'playwright';

const client = new ScrapflyClient({
    key: 'YOUR_API_KEY',
});

const config = new BrowserConfig({
    proxy_pool: 'datacenter',
    os: 'linux',
});

const wsUrl = client.cloudBrowser(config);

const browser = await chromium.connectOverCDP(wsUrl);
const context = browser.contexts()[0];
const page = context.pages()[0] || await context.newPage();

await page.goto('https://web-scraping.dev/products');

const title = await page.title();
console.log('Page title:', title);

// Extract product data using Playwright locators
const products = await page.locator('.product').evaluateAll(elements =>
    elements.map(el => ({
        title: el.querySelector('.product-title')?.textContent?.trim(),
        price: el.querySelector('.product-price')?.textContent?.trim(),
    }))
);
console.log('Products:', products);

await browser.close();
