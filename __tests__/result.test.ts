import * as cheerio from 'cheerio';
import * as fs from 'fs';
import { ScrapeResult } from '../src/result.js';
import * as errors from '../src/errors.js';
import { describe, it, expect, jest } from '@jest/globals';

describe('cheerio selector', () => {
    it('lazy loads and caches itself', () => {
        const response = JSON.parse(fs.readFileSync('__tests__/data/response_html_success.json', 'utf8'));
        const result = new ScrapeResult(response);
        const spy = jest.spyOn(cheerio, 'load');
        expect(result.selector('h1').text()).toEqual('Herman Melville - Moby-Dick');
        // make sure calling it twice performs the same
        expect(result.selector('h1').text()).toEqual('Herman Melville - Moby-Dick');
        // cheerio.load is called exactly once - means it's cached
        expect(spy).toHaveBeenCalledTimes(1);
        spy.mockRestore();
    });
    it('throws ContentTypeError when accessing .selector on JSON data', () => {
        const response = JSON.parse(fs.readFileSync('__tests__/data/response_json_success.json', 'utf8'));
        const result = new ScrapeResult(response);
        expect(() => {
            result.selector('h1').text();
        }).toThrow(errors.ContentTypeError);
    });
});
