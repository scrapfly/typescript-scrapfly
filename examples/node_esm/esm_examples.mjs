import { ScrapflyClient, ScrapeConfig, ScreenshotConfig, ExtractionConfig, log } from 'scrapfly-sdk';
// You can enable debug logs to see more details
log.setLevel('DEBUG');


/* To start, you can always get your account information using the .account() method
 */
export async function getAccount(apiKey) {
  const client = new ScrapflyClient({ key: apiKey});
  const account = await client.account();
  console.log('account');
  console.log(account);
}

/* For a basic scrape the only required parameter is the URL
 */
export async function basicGet(apiKey) {
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
export async function JSRender(apiKey) {
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

/* Scrapfly Extraction API offers LLM (Language Learning Model) based extraction
 * This example demonstrates how to use LLM query HTML files
 * https://scrapfly.io/docs/extraction-api/llm-prompt
 */
export async function extractionLLM(apiKey) {
  const client = new ScrapflyClient({ key: apiKey});

  // First, get HTML either from Web Scraping API or your own storage
  let html = (await client.scrape(
    new ScrapeConfig({
      url: 'https://web-scraping.dev/product/1',
    }),
  )).result.content;
  
  // LLM Parsing - extract content using LLM queries
  let llm_result = await client.extract(
    new ExtractionConfig({
      // identify content type like text/html or text/markdown etc.
      content_type: "text/html",
      body: html,
      // use any prompt 
      extraction_prompt: "get product price only"
    })
  )
  
  console.log('llm extraction');
  console.log(llm_result);
  
  // You can also request LLM to output specific formats like JSON or CSV
  let llm_format_result = await client.extract(
    new ExtractionConfig({
      content_type: "text/html",
      body: html,
      // directly request format
      extraction_prompt: "get product price and currency in JSON"
    })
  )

  console.log('llm extraction in JSON');
  console.log(llm_format_result);
}

/* Scrapfly Extraction API offers Auto Extract engine
 * Which can extract common web objects like products, articles etc.
 * https://scrapfly.io/docs/extraction-api/automatic-ai
 */
export async function extractionAutoExtract(apiKey){
  const client = new ScrapflyClient({ key: apiKey});

  // First, get HTML either from Web Scraping API or your own storage
  let html = (await client.scrape(
    new ScrapeConfig({
      url: 'https://web-scraping.dev/product/1',
    }),
  )).result.content;
  
  // LLM Parsing - extract content using LLM queries
  let product_result = await client.extract(
    new ExtractionConfig({
      // identify content type like text/html or text/markdown etc.
      content_type: "text/html",
      body: html,
      // define model type: product, article etc. 
      // see https://scrapfly.io/docs/extraction-api/automatic-ai#models
      extraction_model: "product"
    })
  )
  
  console.log('product auto extract');
  console.log(product_result);
}

/* Scrapfly Extraction API offers Template extraction engine
 * Use JSON schemas to markup extraction rules using XPath or CSS selectors
 * https://scrapfly.io/docs/extraction-api/rules-and-template
 */
export async function extractionTemplates(apiKey){
  const client = new ScrapflyClient({ key: apiKey});

  // First, get HTML either from Web Scraping API or your own storage
  let html = (await client.scrape(
    new ScrapeConfig({
      url: 'https://web-scraping.dev/reviews',
      render_js: true,
      wait_for_selector: '.review',
    }),
  )).result.content;

  // Define your template, see https://scrapfly.io/docs/extraction-api/rules-and-template
  let template = {  
    "source": "html",
    "selectors": [
      {
        "name": "date_posted",
        "type": "css",
        "query": "[data-testid='review-date']::text",
        "multiple": true,
        "formatters": [ {
          "name": "datetime",
          "args": {"format": "%Y, %b %d — %A"}
        } ]
      }
    ]
  }
  let template_result = await client.extract(
    new ExtractionConfig({
      body: html,
      content_type: "text/html",
      // provide template:
      ephemeral_template: template,
    })
  );
  console.log('product  extract');
  console.log(template_result);
}

/* Scrapfly Screenshot API made for super easy screenshot capture
 * capture screenshots of full pages or specific sections
 * https://scrapfly.io/docs/screenshot-api/getting-started
 */
export async function screenshot(apiKey) {
  const client = new ScrapflyClient({ key: apiKey});

  let screenshot_result = await client.screenshot(
    new ScreenshotConfig({
      url: 'https://web-scraping.dev/product/1',
      // by default 1920x1080 will be captured but resolution can take any value
      resolution: '540x1200',  // for example - tall smartphone viewport
      // to capture all visible parts use capture with full page
      capture: "fullpage",

      // you can also capture specific elements with css or xpath
      // wait_for_selector: "#reviews", // wait for review to load
      // capture: "#reviews",  // capture only reviews element
      
      // for pages that require scrolling to load elements (like endless paging) use 
      auto_scroll: true,

      // simulate vision deficiency for accessibility testing
      // vision_deficiency: 'deuteranopia',
    }),
  );

  console.log("captured screenshot:");
  console.log(screenshot_result);
  
  // use the shortcut to save screenshots to file:
  client.saveScreenshot(screenshot_result, 'screenshot');
  console.log("saved screenshot to ./screenshot.jpg");
}


// CLI entry point
async function main() {
    if (process.argv.length < 4) {
        console.log(
            `Usage: node esm_examples.mjs <functionName> <apiKey>\n` +
            `getAccount - Get account information\n` +
            `basicGet - Basic scrape\n` +
            `JSRender - Scrape with JS rendering\n` +
            `extractionLLM - Extract content using LLM queries\n` +
            `extractionAutoExtract - Extract common web objects using Auto Extract\n` + 
            `extractionTemplates - Extract content using Template engine\n` + 
            `screenshots - Capture screenshots using Screenshot API\n`

        );
        return;
    }
    const args = process.argv.slice(2);
    const functionName = args[0];
    const apiKey = args[1];

    // Dynamically import the current module
    const module = await import('./esm_examples.mjs');

    if (module[functionName]) {
        module[functionName](apiKey);
    } else {
        console.log(`Function ${functionName} not found.`);
    }
}

// Check if the script is being run directly
if (import.meta.url === `file://${process.argv[1]}`) {
    main();
}