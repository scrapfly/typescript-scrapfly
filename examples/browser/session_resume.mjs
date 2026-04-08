/**
 * Session Resume with Scrapfly Cloud Browser
 *
 * npm install scrapfly-sdk puppeteer-core
 */
import { ScrapflyClient, BrowserConfig } from 'scrapfly-sdk';
import puppeteer from 'puppeteer-core';

const client = new ScrapflyClient({
    key: 'YOUR_API_KEY',
});

const SESSION_ID = 'my-persistent-session';

const config = new BrowserConfig({
    proxy_pool: 'datacenter',
    os: 'linux',
    session: SESSION_ID,
    auto_close: false,  // Keep browser alive after disconnect
});

const wsUrl = client.cloudBrowser(config);

// First connection: navigate and set cookies
console.log('=== First Connection ===');
let browser = await puppeteer.connect({ browserWSEndpoint: wsUrl });
let page = await browser.newPage();
await page.goto('https://web-scraping.dev');
await page.setCookie({
    name: 'session_token',
    value: 'abc123',
    domain: 'web-scraping.dev',
});
console.log('Cookies set, disconnecting...');
await browser.disconnect();  // Keep browser alive

// Wait a bit
await new Promise(r => setTimeout(r, 2000));

// Second connection: cookies are preserved
console.log('=== Second Connection ===');
browser = await puppeteer.connect({ browserWSEndpoint: wsUrl });
const pages = await browser.pages();
page = pages[0] || await browser.newPage();
const cookies = await page.cookies('https://web-scraping.dev');
console.log('Cookies from previous session:', cookies);

await browser.close();

// Stop the session when done
await client.cloudBrowserSessionStop(SESSION_ID);
console.log('Session stopped');
