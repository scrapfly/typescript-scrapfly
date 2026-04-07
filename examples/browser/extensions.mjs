/**
 * Use browser extensions with Scrapfly Cloud Browser
 *
 * npm install scrapfly-sdk puppeteer-core
 */
import { ScrapflyClient, BrowserConfig } from 'scrapfly-sdk';
import puppeteer from 'puppeteer-core';

const client = new ScrapflyClient({
    key: 'YOUR_API_KEY',
});

// List current extensions
const { extensions, quota } = await client.cloudBrowserExtensionList();
console.log(`Extensions: ${quota.used}/${quota.limit}`);

if (extensions) {
    for (const ext of extensions) {
        console.log(`  ${ext.id} - ${ext.name} v${ext.version}`);
    }
}

// Connect with extensions enabled
const EXTENSION_IDS = extensions?.map(e => e.id) || [];

if (EXTENSION_IDS.length > 0) {
    const config = new BrowserConfig({
        proxy_pool: 'datacenter',
        os: 'linux',
        extensions: EXTENSION_IDS,
    });

    const wsUrl = client.cloudBrowser(config);
    const browser = await puppeteer.connect({ browserWSEndpoint: wsUrl });

    const page = await browser.newPage();
    await page.goto('https://web-scraping.dev');
    console.log('Page title:', await page.title());

    await browser.close();
} else {
    console.log('No extensions uploaded. Upload one first via the dashboard or SDK.');
}
