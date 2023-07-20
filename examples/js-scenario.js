/*
This example shows how to use Javascript Scenarios feature
which allows to control real web browser:
https://scrapfly.io/docs/scrape-api/javascript-scenario
*/
import { ScrapflyClient, ScrapeConfig } from 'scrapfly-sdk';

const key = 'YOUR_SCRAPFLY_KEY';
const client = new ScrapflyClient({ key });
const result = await client.scrape(
    new ScrapeConfig({
        url: 'https://web-scraping.dev/product/1',
        debug: true,
        // js rendering has to be enabled!
        render_js: true,
        // scenario is an array of actions listed in the docs:
        // https://scrapfly.io/docs/scrape-api/javascript-scenario
        js_scenario: [
            // wait for reviews to load on the page
            { wait_for_selector: { selector: '.review' } },
            // retrieve browser's user agent
            { execute: { script: 'return navigator.userAgent' } },
            // click load more reviews button
            { click: { selector: '#load-more-reviews' } },
            // wait for more reviews to load
            { wait_for_navigation: {} },
            // retrieve all reviews using javascript DOM parser:
            {
                execute: {
                    script: "[...document.querySelectorAll('.review p')].map(p=>p.outerText)",
                },
            },
        ],
    }),
);
console.log(result.result.browser_data.js_scenario);
