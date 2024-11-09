import { ExtractionConfig, CompressionFormat } from '../../src/extractionconfig.ts';
import { ExtractionConfigError } from '../../src/errors.ts';
import { gzipSync } from "node:zlib";
import { Buffer } from "node:buffer";
import { assertEquals, assertThrows } from "https://deno.land/std@0.224.0/assert/mod.ts";

const input_html = 'very long html file';
const input_content_type = 'text/html';

Deno.test('extractionconfig loads', () => {
    const config = new ExtractionConfig({ body: input_html, content_type: input_content_type });
    assertEquals(config.body, input_html);
    assertEquals(config.content_type, input_content_type);
});

Deno.test('extractionconfig throws on unknown options', () => {
    assertThrows(() => {
      new ExtractionConfig({ url: 'http://httpbin.dev/get', foobar: 'baz' } as any);
    }, ExtractionConfigError, "Invalid option provided: foobar");
});



Deno.test('url param generation: basic config', async () => {
    const config = new ExtractionConfig({ body: input_html, content_type: input_content_type });
    const params = config.toApiParams({ key: '1234' });
    assertEquals(params, {
        key: '1234',
        content_type: input_content_type,
    });
});

Deno.test('url param generation: sets url', async () => {
    const config = new ExtractionConfig({
        body: input_html,
        content_type: input_content_type,
        url: 'https://web-scraping.dev/products',
    });
    const params = config.toApiParams({ key: '1234' });
    assertEquals(params, {
        key: '1234',
        content_type: input_content_type,
        url: 'https://web-scraping.dev/products',
    });
});

Deno.test('url param generation: sets charset', async () => {
    const config = new ExtractionConfig({
        body: input_html,
        content_type: input_content_type,
        charset: 'utf-8',
    });
    const params = config.toApiParams({ key: '1234' });
    assertEquals(params, {
        key: '1234',
        content_type: input_content_type,
        charset: 'utf-8',
    });
});

Deno.test('url param generation: sets extraction_template', async () => {
    const config = new ExtractionConfig({
        body: input_html,
        content_type: input_content_type,
        extraction_template: 'my_template',
    });
    const params = config.toApiParams({ key: '1234' });
    assertEquals(params, {
        key: '1234',
        content_type: input_content_type,
        extraction_template: 'my_template',
    });
});

Deno.test('url param generation: sets extraction_ephemeral_template', async () => {
    const config = new ExtractionConfig({
        body: input_html,
        content_type: input_content_type,
        extraction_ephemeral_template: { source: 'html', selectors: [] },
    });
    const params = config.toApiParams({ key: '1234' });
    assertEquals(params, {
        key: '1234',
        content_type: input_content_type,
        extraction_template: 'ephemeral:eyJzb3VyY2UiOiJodG1sIiwic2VsZWN0b3JzIjpbXX0',
    });
});

Deno.test('url param generation: sets extraction_prompt', async () => {
    const config = new ExtractionConfig({
        body: input_html,
        content_type: input_content_type,
        extraction_prompt: 'summarize the document',
    });
    const params = config.toApiParams({ key: '1234' });
    assertEquals(params, {
        key: '1234',
        content_type: input_content_type,
        extraction_prompt: 'summarize the document',
    });
});

Deno.test('url param generation: sets extraction_model', async () => {
    const config = new ExtractionConfig({
        body: input_html,
        content_type: input_content_type,
        extraction_model: 'review_list',
    });
    const params = config.toApiParams({ key: '1234' });
    assertEquals(params, {
        key: '1234',
        content_type: input_content_type,
        extraction_model: 'review_list',
    });
});

// XXX: could add auto compression but support is difficult
/* Deno.test({
    name: 'url param generation: compresses body', 
    async fn() {
        const config = new ExtractionConfig({
            body: input_html,
            content_type: input_content_type,
            document_compression_format: CompressionFormat.GZIP,
            is_document_compressed: false,
        });
        const params = config.toApiParams({ key: '1234' });
        assertEquals(params, {
            key: '1234',
            content_type: input_content_type,
        });
        function compressStringSync(input: string): Uint8Array {
          const buffer = Buffer.from(input, "utf-8");
          const compressed = gzipSync(buffer);
          return new Uint8Array(compressed);
        }
        const compressedBody = compressStringSync(input_html);
        assertEquals(config.body, compressedBody);
    },
    sanitizeResources: false,
    sanitizeOps: false,
});
 */
Deno.test('url param generation: fails to missing compression state with declared compression format', async () => {
    const config = new ExtractionConfig({
        body: input_html,
        content_type: input_content_type,
        document_compression_format: CompressionFormat.GZIP,
    });

    assertThrows(() => {
        config.toApiParams({ key: '1234' });
    }, ExtractionConfigError);
});

Deno.test('url param generation: fails to unsupported auto compression format', async () => {
    const config = new ExtractionConfig({
        body: input_html,
        content_type: input_content_type,
        document_compression_format: CompressionFormat.ZSTD,
        is_document_compressed: false,
    });

    assertThrows(() => {
        config.toApiParams({ key: '1234' });
    }, ExtractionConfigError);
});