# Scrapfly SDK

`npm install scrapfly-sdk`

## Quick Intro

Get your API Key on [scrapfly.io/dashboard](https://scrapfly.io/dashboard) and start scraping:

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
For more on Scrapfly API see full documentation: <https://scrapfly.io/docs>  
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
