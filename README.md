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
        // enable anti-bot bypass
        unblocker: true,
        // set residential proxies
        proxy_pool: 'public_residential_pool',
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

### `unblocker` (formerly `asp`)

The anti-bot bypass is called `unblocker`. `asp` is its deprecated alias and
keeps working forever, in both `ScrapeConfig` and `CrawlerConfig` - only the
documented name changed, so no existing code needs updating:

```javascript
new ScrapeConfig({ url: 'https://web-scraping.dev/product/1', unblocker: true });
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