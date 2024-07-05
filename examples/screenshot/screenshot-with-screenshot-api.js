/*
This example shows how to capture a screenshot using Scrapfly's screenshot API
*/
import { ScrapflyClient, ScreenshotConfig, ScreenshotFormat, ScreenshotOptions } from 'scrapfly-sdk';

const key = 'YOUR SCRAPFLY KEY';
const client = new ScrapflyClient({ key });

const result = await client.screenshot(
    new ScreenshotConfig({
        url: 'https://web-scraping.dev/products',
        format: ScreenshotFormat.PNG, // screenshot format
        options: [
            ScreenshotOptions.LOAD_IMAGES, // Enable image rendering with the request, add extra usage for the bndwidth consumed
            ScreenshotOptions.DARK_MODE, // Enable dark mode display
            ScreenshotOptions.BLOCK_BANNERS, // Block cookies banners and overlay that cover the screen
            ScreenshotOptions.PRINT_MEDIA_FORMAT, // Render the page in the print mode
        ],
        resolution: '1920x1080', // Screenshot resolution
        capture: 'fullpage', // Area to captrue in the screenshot
        rendering_wait: 5000, // Delay in milliseconds to wait after the page was loaded
        wait_for_selector: 'div.products-wrap', // XPath or CSS selector to wait for
        auto_scroll: true, // Whether to automatically scroll down to the bottom of the page
    }),
);

// screenshot metadata (format, upstream_status_code, upstream_url)
const metadata = result.metadata;

// screenshot binary
const binary = result.image;

// save the screenshot binary to a file
client.saveScreenshot(result, 'products', 'screenshots');
