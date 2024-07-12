/*
This example shows how to use the webhook feature with Scrapfly's extraction API
*/
import { ScrapflyClient, ScrapeConfig, ExtractionConfig } from 'scrapfly-sdk';

const key = 'YOUR SCRAPFLY KEY';
const client = new ScrapflyClient({ key });

// First, scrape the web page to retrieve its HTML
const scrapeResult = await client.scrape(
    new ScrapeConfig({
        url: 'https://web-scraping.dev/products',
        render_js: true,
    }),
);

// raw HTML content
const html = scrapeResult.result.content;

// Second, pass the HTML and an extraction prompt
// In this example, we'll ask a question about the data
const extractionResult = await client.extract(
    new ExtractionConfig({
        body: html, // pass the HTML content
        content_type: 'text/html', // data content type
        charset: 'utf-8', // passed content charset, use `auto` if you aren't sure
        extraction_prompt: 'what is the flavor of the dark energy potion?', // LLM extraction prompt
        webhook: 'my-webhook'
    }),
);

// raw result
console.log(extractionResult.result)
`
{
    job_uuid: '7a3aa96d-fb0e-4c45-9b01-7c42f295dcac',
    success: true,
    webhook_name: 'my-webhook',
    webhook_queue_limit: 10000,
    webhook_queued_element: 7,
    webhook_uuid: 'd7131802-1eba-4cc4-a6fd-5da6c8cf1f35'    
}
`
