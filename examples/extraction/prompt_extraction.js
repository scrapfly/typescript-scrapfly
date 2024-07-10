/*
This example shows how to use Scrapfly's extraction prompts for doument RAG processing (question answering)
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
    }),
);

// extraction result
console.log(extractionResult.data);
`The document mentions the flavor of the Dark Red Energy Potion is **bold cherry cola**.`;

// result content type
console.log(extractionResult.content_type);
`text/plain`;
