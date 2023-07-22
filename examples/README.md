# Scrapfly Typescript SDK Examples

This directory contains commonly used examples for the Scrapfly Typescript SDK.

## Quick Guide

Install the library using npm:

```shell
$ npm install scrapfly-sdk
```

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

for more see [/examples](/examples/) directory.
