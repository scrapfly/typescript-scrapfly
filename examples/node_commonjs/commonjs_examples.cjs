const { ScrapflyClient, ScrapeConfig, ScreenshotConfig, ExtractionConfig } = require('scrapfly-sdk');


/* To start, you can always get your account information using the .account() method
 */
async function getAccount(apiKey) {
  const client = new ScrapflyClient({ key: apiKey});
  const account = await client.account();
  console.log('account');
  console.log(account);
}

/* For a basic scrape the only required parameter is the URL
 */
async function basicGet(apiKey) {
  const client = new ScrapflyClient({ key: apiKey});

  let scrape_result = await client.scrape(
    new ScrapeConfig({
      url: 'https://httpbin.dev/html',
      // Anti Scraping Protection bypass - enable this when scraping protected targets
      asp: true,
      // server side cache - great for repeated requests
      cache: true,
      cache_ttl: 3600,  // in seconds
      // cache_clear: true,  // you can always clear the cache explicitly!
    }),
  );

  // the scrape_result.result contains all result details
  console.log("web log url:");  // you can check web UI for request details:
  console.log(scrape_result.result.log_url);

  console.log("page content:");
  console.log(scrape_result.result.content);

  console.log("response headers:");
  console.log(scrape_result.result.response_headers);

  console.log("response cookies:");
  console.log(scrape_result.result.cookies);
}

/* Enabling js_render enabled scrapfly cloud browsers and enables
 * a bunch of other features like browser control, js execution, screenshots, etc.
 */
async function JSRender(apiKey) {
  const client = new ScrapflyClient({ key: apiKey});

  let scrape_result = await client.scrape(
    new ScrapeConfig({
      url: 'https://web-scraping.dev/product/1',
      // enable browsers:
      render_js: true,
      // this enables more options
      // you can wait for some element to appear:
      wait_for_selector: '.review',
      // you can wait explicitly for N seconds
      rendering_wait: 3000,  // 3 seconds
      // you can control the browser through scenarios:
      // https://scrapfly.io/docs/scrape-api/javascript-scenario
      js_scenario: [
        { click: { selector: '#load-more-reviews' }}, 
        { wait: 2000}, 
      ],
      // or even run any custom JS code!
      js: 'return document.querySelector(".review").innerText',
    }),
  );

  // the scrape_result.result contains all result details:
  console.log("web log url:");  // you can check web UI for request details:
  console.log(scrape_result.result.log_url);

  console.log("page content:");
  console.log(scrape_result.result.content.substring(0, 1000) + '...');
  
  console.log("browser data capture");
  console.log(scrape_result.result.browser_data);
}

module.exports = {
  getAccount,
  basicGet,
  JSRender,
};


// CLI entry point
async function main() {
  if (require.main === module) {
    if (process.argv.length < 4) {
      console.log(
        `Usage: node commonjs_examples.js <functionName> <apiKey>\n` +
        `getAccount - Get account information\n` +
        `basicGet - Basic scrape\n` +
        `JSRender - Scrape with JS rendering\n`
      );
    }
    const args = process.argv.slice(2);
    const functionName = args[0];
    const apiKey = args[1];

    if (module.exports[functionName]) {
      module.exports[functionName](apiKey);
    } else {
      console.log(`Function ${functionName} not found.`);
    }
  }
}
main();