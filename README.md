# Scrapfly SDK

`npm install scrapfly-sdk`

Quick use:

```javascript
import { ScrapflyClient, ScrapeConfig } from "scrapfly-sdk";

const client = new ScrapflyClient({key: "YOUR SCRAPFLY KEY"});
const result = await client.scrape(new ScrapeConfig({
    url: "https://httpbin.dev/html",
    // optional:
    aps: true,  // enable anti-scraping protection bypass
    render_js: true, // enable headless browsers for javascript rendering
    country: "us",  // use a US proxy
    method: "GET",  // use GET, POST or other type of requests
    data: {},  // what data to send if POST is used
    ...
}))
console.log(result.result.content)  // html content
```

See [/examples](./examples/) for more.

## Get Your API Key

You can create a free account on [Scrapfly](https://scrapfly.io/register) to get your API Key.

* [Usage](https://scrapfly.io/docs/sdk/python)
* [Python API](https://scrapfly.github.io/python-scrapfly/scrapfly)
* [Open API 3 Spec](https://scrapfly.io/docs/openapi#get-/scrape) 
* [Scrapy Integration](https://scrapfly.io/docs/sdk/scrapy)

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