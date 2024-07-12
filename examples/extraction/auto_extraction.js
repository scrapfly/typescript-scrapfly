/*
This example shows how to use Scrapfly's auto extraction using defined extraction models
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

// raw HTML content
const html = scrapeResult.result.content;

// use the AI auto extraction models for common web pages types:
// for the available models, refer to https://scrapfly.io/docs/extraction-api/automatic-ai#models
const extractionResult = await client.extract(
    new ExtractionConfig({
        body: html, // pass the scraped HTML content
        content_type: 'text/html', // content data type
        charset: 'utf-8', // passed content charset, use `auto` if you aren't sure
        url: 'https://web-scraping.dev/reviews', // when passed, used to transform relative URLs in the document into absolute URLs automatically
        extraction_model: 'review_list',
    }),
);

// extraction result
console.log(extractionResult.data);
`
{
  ....
  reviews: [
    {
      author_name: null,
      content: "Unique flavor and great energy boost. It's the perfect gamer's drink!",
      date_published_formatted: '2023-05-18',
      date_published_raw: '2023-05-18',
      rating: null,
      sentiment: 'POSITIVE',
      sentiment_probability: 0.85,
      title: null,
      verified: null
    },
    ....
]
`

// result content type
console.log(extractionResult.content_type);
`application/json`