/*
This example shows how to use utilize document compression with Scrapfly's extration api
*/
import { ScrapflyClient, ScrapeConfig, ExtractionConfig } from 'scrapfly-sdk';

const key = 'YOUR SCRAPFLY KEY';
const client = new ScrapflyClient({ key });

// First, scrape the web page to retrieve its HTML
const scrapeResult = await client.scrape(
    new ScrapeConfig({
        url: 'https://web-scraping.dev/reviews',
        render_js: true,
        auto_scroll: true
    }),
);

const html = scrapeResult.result.content;

const extractionResult = await client.extract(
    new ExtractionConfig({
        body: html, // pass the scraped HTML content
        content_type: 'text/html',
        charset: 'utf-8',
        extraction_model: 'review_list',
        is_document_compressed: false, // specify that the sent document is not compressed to compress it
        document_compression_format: CompressionFormat.GZIP // specify that compression format
        // If both is_document_compressed and document_compression_format are ignored, the raw HTML sould be sent
        // If is_document_compressed is set to false and CompressionFormat set to GZIP, the SDK will automatically compress the document to gzip
        // is_document_compressed is set to false and CompressionFormat set to ZSTD or DEFLATE, the document passed to ExtractionConfig must be manually compressed
    }),
);

// extraction result
console.log(extractionResult.data);

// result content type
console.log(extractionResult.content_type);
