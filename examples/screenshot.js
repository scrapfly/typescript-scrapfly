/*
This example shows how to capture page screenshots in scrapfly
*/
import { ScrapflyClient, ScrapeConfig } from 'scrapfly-sdk';

const key = 'YOUR SCRAPFLY KEY';
const client = new ScrapflyClient({ key });
const result = await client.scrape(
  new ScrapeConfig({
    url: 'https://web-scraping.dev/product/1',
    // enable headless browsers for screenshots
    render_js: true,
    // optional: you can wait for page to load before capturing
    wait_for_selector: '.review',
    screenshots: {
      // name: what-to-capture
      // fullpage - will capture everything
      // css selector (e.g. #reviews) - will capture just that element
      everything: 'fullpage',
      reviews: '#reviews',
    },
  }),
);
console.log(result.result.screenshots);
/*
{
  everything: {
    css_selector: null,
    extension: 'jpg',
    format: 'fullpage',
    size: 63803,
    url: 'https://api.scrapfly.io/scrape/screenshot/01H5S96DFN48V5RH32ZM9WM8WQ/everything'
  },
  reviews: {
    css_selector: '#reviews',
    extension: 'jpg',
    format: 'element',
    size: 12602,
    url: 'https://api.scrapfly.io/scrape/screenshot/01H5S96DFN48V5RH32ZM9WM8WQ/reviews'
  }
}
*/

// To save screenshot to file you can download the screenshot from the result urls
import axios from "axios";
import fs from "fs";
for (let [name, screenshot] of Object.entries(result.result.screenshots)) {
  let response = await axios.get(screenshot.url, { 
    // note: don't forget to add your API key parameter:
    params: { "key": key }, 
    // this indicates that response is binary data:
    responseType: "arraybuffer",
  }
  );
  // write to screenshot data to a file in currenct directory:
  fs.writeFileSync(`example-screenshot-${name}.${screenshot.extension}`, response.data);
}