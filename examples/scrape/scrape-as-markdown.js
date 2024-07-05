/*
This example shows how to capture page screenshots with images and additional configuration in scrapfly
*/
import { ScrapflyClient, ScrapeConfig } from 'scrapfly-sdk';

const key = 'YOUR SCRAPFLY KEY';
const client = new ScrapflyClient({ key });
const result = await client.scrape(
    new ScrapeConfig({
        url: 'https://web-scraping.dev/products/',
        // scrape the page data as markdown format supproted by LLMs.
        // None=raw(unchanged), other supported formats are: json, text, clean_html         
        format: "markdown"
    }),
);
console.log(result.result.content);
