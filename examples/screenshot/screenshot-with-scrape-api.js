/*
This example shows how to capture page screenshots with images and additional configuration in scrapfly
*/
import { ScrapflyClient, ScrapeConfig, ScreenshotFlags } from 'scrapfly-sdk';

const key = 'YOUR SCRAPFLY KEY';
const client = new ScrapflyClient({ key });
const result = await client.scrape(
    new ScrapeConfig({
        url: 'https://web-scraping.dev/product/2',
        // enable headless browsers for screenshots
        render_js: true,
        // optional: you can wait for page to load before capturing
        screenshots: {
            everything: 'fullpage',
            reviews: '#reviews',
        },
        screenshot_flags: [
            ScreenshotFlags.LOAD_IMAGES, // Enable image rendering with the request, adds extra usage for the bandwidth consumed
            ScreenshotFlags.BLOCK_BANNERS, // Block cookies banners and overlay that cover the screen
            ScreenshotFlags.HIGH_QUALITY, // No compression on the output image
            ScreenshotFlags.LOAD_IMAGES, // Render the page in the print mode
        ],
    }),
);
console.log(result.result.screenshots);

// To save screenshot to file you can download the screenshot from the result urls
import fs from 'fs';
for (let [name, screenshot] of Object.entries(result.result.screenshots)) {
    const url = new URL(screenshot.url);
    // note: don't forget to add your API key parameter:
    url.searchParams.append('key', key);
    const response = await fetch(url.href);
    const content = Buffer.from(await response.arrayBuffer());
    fs.writeFileSync(`screenshots/example-screenshot-${name}.${screenshot.extension}`, content, 'binary');
}
