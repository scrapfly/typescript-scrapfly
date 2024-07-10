import { gzip } from 'zlib';
import { ExtractionConfig, CompressionFormat } from '../../src/extractionconfig.js';
import { describe, it, expect } from '@jest/globals';
import { promisify } from 'util';
import { ExtractionConfigError } from '../../src/errors.js';

const gzipPromise = promisify(gzip);
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
    it('basic config', async () => {
        const config = new ExtractionConfig({ body: input_html, content_type: input_content_type });
        const params = await config.toApiParams({ key: '1234' });
        expect(params).toEqual({
            key: '1234',
            content_type: input_content_type,
        });
    });

    it('sets url', async () => {
        const config = new ExtractionConfig({
            body: input_html,
            content_type: input_content_type,
            url: 'https://web-scraping.dev/products',
        });
        const params = await config.toApiParams({ key: '1234' });
        expect(params).toEqual({
            key: '1234',
            content_type: input_content_type,
            url: 'https://web-scraping.dev/products',
        });
    });

    it('sets charset', async () => {
        const config = new ExtractionConfig({
            body: input_html,
            content_type: input_content_type,
            charset: 'utf-8',
        });
        const params = await config.toApiParams({ key: '1234' });
        expect(params).toEqual({
            key: '1234',
            content_type: input_content_type,
            charset: 'utf-8',
        });
    });

    it('sets template', async () => {
        const config = new ExtractionConfig({
            body: input_html,
            content_type: input_content_type,
            template: 'my_template',
        });
        const params = await config.toApiParams({ key: '1234' });
        expect(params).toEqual({
            key: '1234',
            content_type: input_content_type,
            extraction_template: 'my_template',
        });
    });

    it('sets epehemeral_template', async () => {
        const config = new ExtractionConfig({
            body: input_html,
            content_type: input_content_type,
            epehemeral_template: { source: 'html', selectors: [] },
        });
        const params = await config.toApiParams({ key: '1234' });
        expect(params).toEqual({
            key: '1234',
            content_type: input_content_type,
            extraction_template: 'ephemeral:eyJzb3VyY2UiOiJodG1sIiwic2VsZWN0b3JzIjpbXX0',
        });
    });

    it('sets extraction_prompt', async () => {
        const config = new ExtractionConfig({
            body: input_html,
            content_type: input_content_type,
            extraction_prompt: 'summarize the document',
        });
        const params = await config.toApiParams({ key: '1234' });
        expect(params).toEqual({
            key: '1234',
            content_type: input_content_type,
            extraction_prompt: 'summarize the document',
        });
    });

    it('sets extraction_model', async () => {
        const config = new ExtractionConfig({
            body: input_html,
            content_type: input_content_type,
            extraction_model: 'review_list',
        });
        const params = await config.toApiParams({ key: '1234' });
        expect(params).toEqual({
            key: '1234',
            content_type: input_content_type,
            extraction_model: 'review_list',
        });
    });

    it('compresses body', async () => {
        const config = new ExtractionConfig({
            body: input_html,
            content_type: input_content_type,
            document_compression_format: CompressionFormat.GZIP,
            is_document_compressed: false,
        });
        const params = await config.toApiParams({ key: '1234' });
        expect(params).toEqual({
            key: '1234',
            content_type: input_content_type,
        });
        expect(config.body).toEqual(await gzipPromise(Buffer.from(input_html as string, 'utf-8')));
    });

    it('fails to missing compression state with delcated compression format', async () => {
        const config = new ExtractionConfig({
            body: input_html,
            content_type: input_content_type,
            document_compression_format: CompressionFormat.GZIP,
        });

        await expect(async () => {
            await config.toApiParams({ key: '1234' });
        }).rejects.toThrow(ExtractionConfigError);
    });

    it('fails to unsupported auto compression format', async () => {
        const config = new ExtractionConfig({
            body: input_html,
            content_type: input_content_type,
            document_compression_format: CompressionFormat.ZSTD,
            is_document_compressed: false
        });

        await expect(async () => {
            await config.toApiParams({ key: '1234' });
        }).rejects.toThrow(ExtractionConfigError);        
    });    
});
