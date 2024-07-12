/*
This example shows how to use Scrapfly's extraction prompts to parse scraped HTML documents
*/
import { ScrapflyClient, ScrapeConfig, ExtractionConfig } from 'scrapfly-sdk';

const key = 'YOUR SCRAPFLY KEY';
const client = new ScrapflyClient({ key });

// First, scrape the web page to retrieve its HTML
const scrapeResult = await client.scrape(
    new ScrapeConfig({
        url: 'https://web-scraping.dev/products',
        render_js: true,
        cache: true,
    })
);

// raw HTML content
const html = scrapeResult.result.content;

// In this example, we'll pass a detailed extraction prompt
const extractionResult = await client.extract(
    new ExtractionConfig({
        body: html, // pass the HTML content
        content_type: 'text/html', // content data type
        charset: 'utf-8', // passed content charset, use `auto` if you aren't sure
        extraction_prompt: `
        extract product data in JSON for the following fields:
        name: product name.
        image: product image.
        description: product description.
        flavor: this field doesn't exist in the HTML, extract it from the product description.
        price: product price.             
        `
    })
)

// extraction result
console.log(extractionResult.data);
`
[
  {
    description: "Indulge your sweet tooth with our Box of Chocolate Candy. Each box contains an assortment of rich, flavorful chocolates with a smooth, creamy filling. Choose from a variety of flavors including zesty orange and sweet cherry. Whether you're looking for the perfect gift or just want to treat yourself, our Box of Chocolate Candy is sure to satisfy.",
    flavor: 'zesty orange and sweet cherry',
    image: 'https://www.web-scraping.dev/assets/products/orange-chocolate-box-medium-1.webp',
    name: 'Box of Chocolate Candy',
    price: '24.99'
  },
  ....
]
`

// result content type
console.log(extractionResult.content_type);
`application/json`