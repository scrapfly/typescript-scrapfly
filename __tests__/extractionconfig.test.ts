import { ExtractionConfig } from '../src/extractionconfig.js';
// import { ScreenshotConfigError } from '../src/errors.js';
import { describe, it, expect } from '@jest/globals';

const input_html = 'very long html file';
const input_content_type = 'text/html';

describe('extactionconfig', () => {
    it('loads', () => {
        const config = new ExtractionConfig({ body: input_html, content_type: input_content_type });
        expect(config.body).toBe(input_html);
        expect(config.content_type).toBe(input_content_type);
    });
});

describe('url param generation', () => {
    it('loads', () => {
        const config = new ExtractionConfig({ body: input_html, content_type: input_content_type });
        expect(config.body).toBe(input_html);
        expect(config.content_type).toBe(input_content_type);
    });

    it('basic config', () => {
        const config = new ExtractionConfig({ body: input_html, content_type: input_content_type });
        const params = config.toApiParams({ key: '1234' });
        expect(params).toEqual({
            key: '1234',
            body: input_html,
            content_type: input_content_type,
        });
    });

    it('sets url', () => {
        const config = new ExtractionConfig({
            body: input_html,
            content_type: input_content_type,
            url: 'https://web-scraping.dev/products',
        });
        const params = config.toApiParams({ key: '1234' });
        expect(params).toEqual({
            key: '1234',
            body: input_html,
            content_type: input_content_type,
            url: 'https://web-scraping.dev/products',
        });
    });

    it('sets charset', () => {
        const config = new ExtractionConfig({
            body: input_html,
            content_type: input_content_type,
            charset: 'utf-8',
        });
        const params = config.toApiParams({ key: '1234' });
        expect(params).toEqual({
            key: '1234',
            body: input_html,
            content_type: input_content_type,
            charset: 'utf-8',
        });
    });

    it('sets template', () => {
        const config = new ExtractionConfig({
            body: input_html,
            content_type: input_content_type,
            template: 'my_template',
        });
        const params = config.toApiParams({ key: '1234' });
        expect(params).toEqual({
            key: '1234',
            body: input_html,
            content_type: input_content_type,
            template: 'my_template',
        });
    });

    it('sets epehemeral_template', () => {
        const config = new ExtractionConfig({
            body: input_html,
            content_type: input_content_type,
            epehemeral_template: { source: 'html', selectors: [] },
        });
        const params = config.toApiParams({ key: '1234' });
        expect(params).toEqual({
            key: '1234',
            body: input_html,
            content_type: input_content_type,
            epehemeral_template: 'ephemeral:eyJzb3VyY2UiOiJodG1sIiwic2VsZWN0b3JzIjpbXX0',
        });
    });

    it('sets extraction_prompt', () => {
        const config = new ExtractionConfig({
            body: input_html,
            content_type: input_content_type,
            extraction_prompt: 'summarize the document'
        });
        const params = config.toApiParams({ key: '1234' });
        expect(params).toEqual({
            key: '1234',
            body: input_html,
            content_type: input_content_type,
            extraction_prompt: 'summarize the document'
        });
    });

    it('sets extraction_model', () => {
        const config = new ExtractionConfig({
            body: input_html,
            content_type: input_content_type,
            extraction_model: 'review_list'
        });
        const params = config.toApiParams({ key: '1234' });
        expect(params).toEqual({
            key: '1234',
            body: input_html,
            content_type: input_content_type,
            extraction_model: 'review_list'
        });
    });               
});
