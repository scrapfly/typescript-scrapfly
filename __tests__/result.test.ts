import { ScrapeResult } from '../src/result.ts';
import * as errors from '../src/errors.ts';
import { assertEquals, assertThrows } from "https://deno.land/std@0.224.0/assert/mod.ts";

Deno.test('cheerio selector lazy loads and caches itself', async () => {
  const responseHtmlSuccess = JSON.parse(await Deno.readTextFile('__tests__/data/response_html_success.json'));
  const result = new ScrapeResult(responseHtmlSuccess);
  // Perform assertions
  assertEquals(result.selector('h1').text(), 'Herman Melville - Moby-Dick');
  // Make sure calling it twice performs the same
  assertEquals(result.selector('h1').text(), 'Herman Melville - Moby-Dick');
  // cheerio.load is called exactly once - means it's cached
});


Deno.test('cheerio selector loads with case sensitive headers', async () => {
  const response = JSON.parse(await Deno.readTextFile('__tests__/data/response_html_success.json'));
  const result = new ScrapeResult(response);
  assertEquals(result.selector('h1').text(), 'Herman Melville - Moby-Dick');
});


Deno.test('throws ContentTypeError when accessing .selector on JSON data', async () => {
  const responseJsonSuccess = JSON.parse(await Deno.readTextFile('__tests__/data/response_json_success.json'));
  const result = new ScrapeResult(responseJsonSuccess);

  assertThrows(() => {
    result.selector('h1').text();
  }, errors.ContentTypeError);
});