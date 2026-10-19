# Scrapfly SDK

`npm install scrapfly-sdk`  
`deno add jsr:@scrapfly/scrapfly-sdk`  
`bunx jsr add @scrapfly/scrapfly-sdk`  

Typescript/Javascript SDK for [Scrapfly.io](https://scrapfly.io/) web scraping API which allows to:

-   Scrape the web without being blocked.
-   Use headless browsers to access Javascript-powered page data.
-   Scale up web scraping.
-   ... and [much more](https://scrapfly.io/docs/scrape-api/getting-started)!

For web scraping guides see [our blog](https://scrapfly.io/blog/) and [#scrapeguide](https://scrapfly.io/blog/tag/scrapeguide/) tag for how to scrape specific targets.

The SDK is distributed through:
- [npmjs.com/package/scrapfly-sdk](https://www.npmjs.com/package/scrapfly-sdk)
- [jsr.io/@scrapfly/scrapfly-sdk](https://jsr.io/@scrapfly/scrapfly-sdk)

## Quick Intro

1. Register a [Scrapfly account for free](https://scrapfly.io/register)
2. Get your API Key on [scrapfly.io/dashboard](https://scrapfly.io/dashboard)
3. Start scraping: 🚀

```javascript
// node 
import { ScrapflyClient, ScrapeConfig } from 'scrapfly-sdk';
// bun
import { ScrapflyClient, ScrapeConfig} from '@scrapfly/scrapfly-sdk';
// deno: 
import { ScrapflyClient, ScrapeConfig } from 'jsr:@scrapfly/scrapfly-sdk';

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
        // proxy pool: basic, unblocker (anti-bot bypass), unblocker_ultra or auto
        proxy_pool: ScrapeConfig.UNBLOCKER,
        // etc.
    }),
);
console.log(apiResponse.result.content); // html content
// Parse HTML directly with SDK (through cheerio)
console.log(apiResponse.result.selector('h3').text());
```

For more see [/examples](/examples/) directory.  
For more on Scrapfly API see our [getting started documentation](https://scrapfly.io/docs/scrape-api/getting-started)
For Python see [Scrapfly Python SDK](https://github.com/scrapfly/python-scrapfly)

### Proxy pools

`proxy_pool` picks one of four proxy pools. The pool sets both the proxy
network and the anti-bot bypass (the Unblocker):

| Static | Value | What it runs |
|---|---|---|
| `ScrapeConfig.BASIC` | `'basic'` | datacenter proxies, Unblocker off |
| `ScrapeConfig.UNBLOCKER` | `'unblocker'` | residential proxies and the Unblocker |
| `ScrapeConfig.UNBLOCKER_ULTRA` | `'unblocker_ultra'` | residential proxies and the Unblocker, the only pool accepted by the targets and anti-bot protections that have a price of their own |
| `ScrapeConfig.AUTO` | `'auto'` | the API picks the pool before the request, from the target's profile: the Unblocker on datacenter proxies, or the pool the target needs; accepted on every target, the ones that require `unblocker_ultra` included, where their price is added; priced as the pool it runs on |

```javascript
const result = await client.scrape(
    new ScrapeConfig({ url: 'https://web-scraping.dev/product/1', proxy_pool: ScrapeConfig.UNBLOCKER }),
);
new CrawlerConfig({ url: 'https://web-scraping.dev/', proxy_pool: ScrapeConfig.UNBLOCKER });
```

A request on `basic` or `unblocker` against a target or protection that has a
price of its own fails with `ERR::PROXY::UNBLOCKER_ULTRA_REQUIRED` (HTTP 422,
not billed); retry it with `ScrapeConfig.UNBLOCKER_ULTRA`. `basic` is billed at
the datacenter price and both Unblocker pools at the residential price;
`unblocker_ultra` adds the target's or protection's own price where it has one.
The SDK sends no default `proxy_pool`.

`ScreenshotConfig` takes the same four pools, at the same price on every pool;
any other value is ignored there. The Cloud Browser (`BrowserConfig`)
keeps its own pools: `datacenter`, `residential`, `tor` and `byop`.

### Deprecated: `unblocker` and `asp`

`unblocker` and its alias `asp`, in both `ScrapeConfig` and `CrawlerConfig`, are
deprecated: use `proxy_pool` (`ScrapeConfig.UNBLOCKER_ULTRA` for the Unblocker).
The [migration guide](https://scrapfly.io/new-pricing#legacy-spellings) covers
the requests written before the proxy pools, the pool names
`ScrapeConfig.PUBLIC_DATACENTER_POOL` and `ScrapeConfig.PUBLIC_RESIDENTIAL_POOL`
included.

```javascript
new ScrapeConfig({ url: 'https://web-scraping.dev/product/1', unblocker: true }); // deprecated
new ScrapeConfig({ url: 'https://web-scraping.dev/product/1', asp: true }); // same thing
```

Both names address one value, so `config.unblocker` and `config.asp` always
read the same and either can be assigned after construction. When both are
supplied to the constructor, `asp` wins - but only when it was actually
supplied: `asp: undefined` is not a supplied value, so `{ ...opts, asp: opts.asp }`
spread-forwarding cannot silently veto an explicit `unblocker: true`.

The request still carries the parameter as `asp` on the wire, in the `/scrape`
query and in the `POST /crawl` body, and only when the feature is ON - both
"off" and "not supplied" drop the key, so the request is byte-identical to the
one the Python, Go and Rust SDKs build for the same intent.

The matching error class is `ScrapflyUnblockerError`, the same class object as
`ScrapflyAspError`, so either name works in a `catch`:

```javascript
import { ScrapflyUnblockerError } from 'scrapfly-sdk';

if (err instanceof ScrapflyUnblockerError) {
    // the unblocker could not get through the target's protection
}
```

## Debugging

To enable debug logs set Scrapfly's log level to `"DEBUG"`:

```javascript
import { log } from 'scrapfly-sdk';

log.setLevel('DEBUG');
```

Additionally, set `debug=true` in `ScrapeConfig` to access debug information in [Scrapfly web dashboard](https://scrapfly.io/dashboard):

```typescript
import { ScrapflyClient } from 'scrapfly-sdk';

new ScrapeConfig({
    url: 'https://web-scraping.dev/product/1',
    debug: true,
    // ^ enable debug information - this will show extra details on web dashboard
});
```

## Development

This is a Deno Typescript project that builds to NPM through [DNT](https://github.com/denoland/dnt).

- `/src` directory contains all of the source code with `main.ts` being the entry point.
- `__tests__` directory contains tests for the source code.
- `deno.json` contains meta information
- `build.ts` is the build script that builds the project to nodejs ESM package.
- `/npm` directory will be produced when `built.ts` is executed for building node package.

```bash
# make modifications and run tests
$ deno task test
# format
$ deno fmt
# lint
$ deno lint
# publish JSR:
$ deno publish
# build NPM package:
$ deno task build-npm
# publish NPM:
$ cd npm && npm publish
```