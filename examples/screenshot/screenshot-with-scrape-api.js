/*
This example shows how to capture page screenshots with images and additional configuration in scrapfly
*/
import { ScrapflyClient, ScrapeConfig } from 'scrapfly-sdk';

const key = 'YOUR SCRAPFLY KEY';
const client = new ScrapflyClient({ key });
const result = await client.scrape(
    new ScrapeConfig({
        url: 'https://web-scraping.dev/products/',
        // enable headless browsers for screenshots
        render_js: true,
        // optional: you can wait for page to load before capturing
        screenshots: {
            everything: 'fullpage',
            reviews: '#reviews',
        },
        screenshot_flags: [
            "load_images", // Enable image rendering with the request, adds extra usage for the bandwidth consumed
            "dark_mode", // Enable dark mode display
            "block_banners", // Block cookies banners and overlay that cover the screen
            "high_quality", // No compression on the output image
            "print_media_format" // Render the page in the print mode            
        ]
    }),
);
console.log(result.result.screenshots);
