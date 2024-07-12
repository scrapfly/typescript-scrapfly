/*
 * This example shows how to download binary data from scrapfly responses.
*/
import { ScrapflyClient, ScrapeConfig } from 'scrapfly-sdk';
import fs from 'fs';
const key = 'YOUR SCRAPFLY KEY';
const client = new ScrapflyClient({ key });
const result = await client.scrape(
    new ScrapeConfig({
        url: 'https://web-scraping.dev/product/1',
        render_js: true,
        js: 'return document.title',
    }),
);
// then stream content as base64 buffer:
const data = Buffer.from(result.result.content, 'base64');
fs.writeFileSync('image.png', data);
