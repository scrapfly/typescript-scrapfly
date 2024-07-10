/*
This example shows how to use Scrapfly's template extraction to use detailed HTML parsing rules
*/
import { ScrapflyClient, ScrapeConfig, ExtractionConfig } from 'scrapfly-sdk';

const key = 'YOUR SCRAPFLY KEY';
const client = new ScrapflyClient({ key });

// First, scrape the web page to retrieve its HTML
const scrapeResult = await client.scrape(
    new ScrapeConfig({
        url: 'https://web-scraping.dev/product/1',
        render_js: true,
    }),
);

// raw HTML content
const html = scrapeResult.result.content;

// extraction template for HTML parsing instructions. It accepts the following:
// selectors: CSS, XPath, JMESPath, Regex, Nested (nesting multiple selector types)
// extractors: extracts commonly accessed data types: price, image, links, emails
// formatters: transforms the extracted data for common methods: lowercase, uppercase, datatime, etc.
// refer to the docs for more details: https://scrapfly.io/docs/extraction-api/rules-and-template#rules
const extraction_template = {
    "source": "html",
    "selectors": [
        {
            "name": "title",
            "query": "h3.product-title::text",
            "type": "css",
            "formatters": [
                {
                    "name": "uppercase"
                }
            ],
        },
        {
            "name": "description",
            "query": "p.product-description::text",
            "type": "css"
        },
        {
            "extractor": {
                "name": "price"
            },
            "name": "price",
            "query": ".product-price::text",
            "type": "css"
        },
        {
            "name": "variants",
          	"query": "div.variants",
            "type": "css",
            "nested": [
                {
                    "name": "name",
                    "query": "//a[@data-variant-id]/@data-variant-id",
                    "type": "xpath",
                    "multiple": true,
                },
                {
                    "name": "link",
                    "query": "//a[@data-variant-id]/@href",
                    "type": "xpath",
                    "multiple": true,
                },
            ]
        },        
        {
            "name": "reviews",
            "query": "div.review>p::text",
            "type": "css",
            "multiple": true,            
        }
    ]
}

const extractionResult = await client.extract(
    new ExtractionConfig({
        body: html, // pass the HTML content
        content_type: 'text/html', // content data type
        charset: 'utf-8', // passed content charset, use `auto` if you aren't sure
        epehemeral_template: extraction_template // declared template defintion
    }),
);

// extraction result
console.log(extractionResult.data.variants)
`
{
  description: "Indulge your sweet tooth with our Box of Chocolate Candy. Each box contains an assortment of rich, flavorful chocolates with a smooth, creamy filling. Choose from a variety of flavors including zesty orange and sweet cherry. Whether you're looking for the perfect gift or just want to treat yourself, our Box of Chocolate Candy is sure to satisfy.",
  price: { amount: '9.99', currency: 'USD', original: '$9.99 ', symbol: '$' },
  reviews: [
    'Absolutely delicious! The orange flavor is my favorite.',
    'I bought these as a gift, and they were well received. Will definitely purchase again.',
    'Nice variety of flavors. The chocolate is rich and smooth.',
    'The cherry flavor is amazing. Will be buying more.',
    'A bit pricey, but the quality of the chocolate is worth it.'
  ],
  title: 'BOX OF CHOCOLATE CANDY',
  variants: [
  {
    link: [
      'https://web-scraping.dev/product/1?variant=orange-small',
      ....
    ],
    name: [
      'orange-small',
      ....
    ]
  }
]
}
`

// result content type
console.log(extractionResult.content_type)
'application/json'
