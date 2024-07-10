import * as errors from '../../src/errors.js';
import { ScrapflyClient } from '../../src/client.js';
import { ExtractionConfig } from '../../src/extractionconfig.js'
import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { responseFactory } from '../utils.js';

describe('extract', () => {
    const KEY = '__API_KEY__';
    const client = new ScrapflyClient({ key: KEY });

    beforeEach(() => {
        jest.spyOn(client, 'fetch').mockClear(); // clear all mock meta on each test
    });

    it('succeeds', async () => {
        const spy = jest.spyOn(client, 'fetch');
        const html = 'very long html file';
        jest.spyOn(client, 'fetch').mockImplementation(async (config: Request): Promise<any> => {
            const configUrl = config[Object.getOwnPropertySymbols(config)[1]].url;
            const configBody = config[Object.getOwnPropertySymbols(config)[1]].body.source;
            // Ensure the URL matches the pattern
            expect(configUrl.origin + configUrl.pathname).toEqual(client.HOST + '/extraction');
            expect(config.method).toEqual('POST');
            expect(configUrl.searchParams.get('key')).toMatch(KEY);
            expect(configBody).toEqual(html);
            const body = { data: 'a document summary', content_type: 'text/html' };
            return responseFactory(body, {
                status: 200,
            });
        });

        const result = await client.extract(new ExtractionConfig({ body: html, content_type: 'text/html' }));
        expect(result).toBeDefined();
        expect(result.content_type).toBe('text/html');
        expect(result.data).toBe('a document summary');
        expect(spy).toHaveBeenCalledTimes(1);
    });

    it('fails due to failing to invalid config', async () => {
        const html = 'very long html file';
        await expect(
            client.extract(
                new ExtractionConfig({
                    body: html,
                    content_type: 'text/html',
                    epehemeral_template: { source: 'html' },
                    template: 'template',
                }),
            ),
        ).rejects.toThrow(errors.ExtractionConfigError);
    });

    it('fails to invalid API key', async () => {
        const html = 'very long html file';
        jest.spyOn(client, 'fetch').mockImplementation(async (): Promise<any> => {
            const result = {
                status: 'error',
                http_code: 401,
                reason: 'Unauthorized',
                error_id: '301e2d9e-b4f5-4289-85ea-e452143338df',
                message: 'Invalid API key',
            };
            return responseFactory(result, {
                status: 401,
                headers: {
                    'Content-Type': 'application/json',
                },
            });
        });
        await expect(client.extract(new ExtractionConfig({ body: html, content_type: 'text/html' }))).rejects.toThrow(
            errors.BadApiKeyError,
        );
    });

    it('fails to any extraction related error', async () => {
        const html = 'very long html file';
        jest.spyOn(client, 'fetch').mockImplementation(async (): Promise<any> => {
            const result = {
                code: 'ERR::EXTRACTION::CONTENT_TYPE_NOT_SUPPORTED',
                error_id: 'f0e9a6af-846a-49ab-8321-e21bb12bf494',
                http_code: 422,
                links: {
                    'Related Error Doc':
                        'https://scrapfly.io/docs/extraction-api/error/ERR::EXTRACTION::CONTENT_TYPE_NOT_SUPPORTED',
                },
                message: 'ERR::EXTRACTION::CONTENT_TYPE_NOT_SUPPORTED',
            };
            return responseFactory(result, {
                status: 422,
                headers: {
                    'Content-Type': 'application/json',
                },
            });
        });
        await expect(client.extract(new ExtractionConfig({ body: html, content_type: 'text/html' }))).rejects.toThrow(
            errors.ExtractionApiError,
        );
    });
});