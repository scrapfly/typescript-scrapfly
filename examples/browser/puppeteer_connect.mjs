/**
 * Connect Puppeteer to Scrapfly Cloud Browser
 *
 * npm install scrapfly-sdk puppeteer-core
 */
import { ScrapflyClient, BrowserConfig, ProxyPool, OperatingSystem } from 'scrapfly-sdk';
import puppeteer from 'puppeteer-core';

const client = new ScrapflyClient({
    key: 'YOUR_API_KEY',
});

const config = new BrowserConfig({
    proxy_pool: ProxyPool.DATACENTER,
    os: OperatingSystem.LINUX,
});

const wsUrl = client.cloudBrowser(config);

const browser = await puppeteer.connect({
    browserWSEndpoint: wsUrl,
});

const page = await browser.newPage();
await page.goto('https://web-scraping.dev/products');

const title = await page.title();
console.log('Page title:', title);

// Extract product data
const products = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('.product')).map(el => ({
        title: el.querySelector('.product-title')?.textContent?.trim(),
        price: el.querySelector('.product-price')?.textContent?.trim(),
    }));
});
console.log('Products:', products);

await browser.close();
