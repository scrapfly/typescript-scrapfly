import * as fs from 'fs';
import { ScrapeResult } from '../src/result.js';
import * as errors from '../src/errors.js';
import { describe, it, expect } from '@jest/globals';

describe('cheerio selector', () => {
    it('lazy loads and caches itself', () => {
        const response = JSON.parse(fs.readFileSync('__tests__/data/response_html_success.json', 'utf8'));
        const result = new ScrapeResult(response);
        expect(result.selector('h1').text()).toEqual('Herman Melville - Moby-Dick');
        // make sure calling it twice performs the same
        expect(result.selector('h1').text()).toEqual('Herman Melville - Moby-Dick');
    });
    it('throws ContentTypeError when accessing .selector on JSON data', () => {
        const response = JSON.parse(fs.readFileSync('__tests__/data/response_json_success.json', 'utf8'));
        const result = new ScrapeResult(response);
        expect(() => {
            result.selector('h1').text();
        }).toThrow(errors.ContentTypeError);
    });
});
