# Scrapfly SDK

`npm install scrapfly-sdk`

Typescript/NodeJS SDK for [Scrapfly.io](https://scrapfly.io/) web scraping API which allows to:
- Scrape the web without being blocked.
- Use headless browsers to access Javascript-powered page data.
- Scale up web scraping.
- ... and [much more](https://scrapfly.io/docs/scrape-api/getting-started)!

For web scraping guides see [our blog](https://scrapfly.io/blog/) and [#scrapeguide](https://scrapfly.io/blog/tag/scrapeguide/) tag for how to scrape specific targets.

## Quick Intro

1. Register a [Scrapfly account for free](https://scrapfly.io/register)
2. Get your API Key on [scrapfly.io/dashboard](https://scrapfly.io/dashboard) 
3. Start scraping: 🚀

```javascript
import { ScrapflyClient, ScrapeConfig } from 'scrapfly-sdk';

const key = 'YOUR SCRAPFLY KEY';
const client = new ScrapflyClient({ key });
const apiResponse = await client.scrape(
    new ScrapeConfig({
        url: 'https://web-scraping.dev/product/1',
        // optional parameters:
        // enable javascript rendering
        render_js: true,
        // set proxy country
        country: 'us',
        // enable anti-scraping protection bypass
        asp: true,
        // set residential proxies
        proxy_pool: 'public_residential_pool',
        // etc.
    }),
);
console.log(apiResponse.result.content); // html content
```

For more see [/examples](/examples/) directory.  
For more on Scrapfly API see our [getting started documentation](https://scrapfly.io/docs/scrape-api/getting-started)
For Python see [Scrapfly Python SDK](https://github.com/scrapfly/python-scrapfly)

## Development

Install and setup environment:

```shell
$ npm install
```

Build and test:

```shell
$ npm task build
$ npm task tests
```
