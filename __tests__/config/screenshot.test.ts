import { ScreenshotConfig, Format, Options } from '../../src/screenshotconfig.ts';
import { ScreenshotConfigError } from '../../src/errors.ts';
import { assertEquals, assertThrows } from "https://deno.land/std@0.224.0/assert/mod.ts";

const input_url = 'http://httpbin.dev/get';

Deno.test('screenshotconfig loads', () => {
    const config = new ScreenshotConfig({ url: input_url });
    assertEquals(config.url, input_url);
});

Deno.test('screenshotconfig throws on unknown options', () => {
    assertThrows(() => {
        new ScreenshotConfig({ url: 'http://httpbin.dev/get', foobar: 'baz' } as any);
    }, ScreenshotConfigError, "Invalid option provided: foobar");
});



Deno.test('config invalid: sets invalid format', () => {
    assertThrows(() => {
        new ScreenshotConfig({
            url: input_url,
            format: 'invalid' as any,
        });
    }, ScreenshotConfigError);
});

Deno.test('config invalid: sets invalid options', () => {
    assertThrows(() => {
        new ScreenshotConfig({
            url: input_url,
            options: ['invalid', 'invalid_too'] as any,
        });
    }, ScreenshotConfigError);
});

Deno.test('url param generation: basic config', () => {
    const config = new ScreenshotConfig({ url: input_url });
    const params = config.toApiParams({ key: '1234' });
    assertEquals(params, {
        key: '1234',
        url: input_url,
    });
});

Deno.test('url param generation: sets format', () => {
    const config = new ScreenshotConfig({
        url: input_url,
        format: Format.PNG,
    });
    const params = config.toApiParams({ key: '1234' });
    assertEquals(params, {
        key: '1234',
        url: input_url,
        format: 'png',
    });
});

Deno.test('url param generation: sets capture', () => {
    const config = new ScreenshotConfig({
        url: input_url,
        capture: 'fullpage',
    });
    const params = config.toApiParams({ key: '1234' });
    assertEquals(params, {
        key: '1234',
        url: input_url,
        capture: 'fullpage',
    });
});

Deno.test('url param generation: sets resolution', () => {
    const config = new ScreenshotConfig({
        url: input_url,
        resolution: '1920x1080',
    });
    const params = config.toApiParams({ key: '1234' });
    assertEquals(params, {
        key: '1234',
        url: input_url,
        resolution: '1920x1080',
    });
});

Deno.test('url param generation: sets country', () => {
    const config = new ScreenshotConfig({
        url: input_url,
        country: 'us,ca,mx',
    });
    const params = config.toApiParams({ key: '1234' });
    assertEquals(params, {
        key: '1234',
        url: input_url,
        country: 'us,ca,mx',
    });
});

Deno.test('url param generation: sets timeout', () => {
    const config = new ScreenshotConfig({
        url: input_url,
        timeout: 60000,
    });
    const params = config.toApiParams({ key: '1234' });
    assertEquals(params, {
        key: '1234',
        url: input_url,
        timeout: 60000,
    });
});

Deno.test('url param generation: sets rendering_wait', () => {
    const config = new ScreenshotConfig({
        url: input_url,
        rendering_wait: 5000,
    });
    const params = config.toApiParams({ key: '1234' });
    assertEquals(params, {
        key: '1234',
        url: input_url,
        rendering_wait: 5000,
    });
});

Deno.test('url param generation: sets wait_for_selector', () => {
    const config = new ScreenshotConfig({
        url: input_url,
        wait_for_selector: '//div[@class="product"]',
    });
    const params = config.toApiParams({ key: '1234' });
    assertEquals(params, {
        key: '1234',
        url: input_url,
        wait_for_selector: '//div[@class="product"]',
    });
});

Deno.test('url param generation: sets options', () => {
    const config = new ScreenshotConfig({
        url: input_url,
        options: [Options.BLOCK_BANNERS, Options.DARK_MODE, Options.LOAD_IMAGES, Options.PRINT_MEDIA_FORMAT],
    });
    const params = config.toApiParams({ key: '1234' });
    assertEquals(params, {
        key: '1234',
        url: input_url,
        options: 'block_banners,dark_mode,load_images,print_media_format',
    });
});

Deno.test('url param generation: sets auto_scroll', () => {
    const config = new ScreenshotConfig({
        url: input_url,
        auto_scroll: true,
    });
    const params = config.toApiParams({ key: '1234' });
    assertEquals(params, {
        key: '1234',
        url: input_url,
        auto_scroll: true,
    });
});

Deno.test('url param generation: sets js', () => {
    const config = new ScreenshotConfig({
        url: input_url,
        js: 'return document.querySelectorAll(".review p").map(p => p.outerText)',
    });
    const params = config.toApiParams({ key: '1234' });
    assertEquals(params, {
        key: '1234',
        url: input_url,
        js: 'cmV0dXJuIGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3JBbGwoIi5yZXZpZXcgcCIpLm1hcChwID0-IHAub3V0ZXJUZXh0KQ',
    });
});

Deno.test('url param generation: sets cache', () => {
    const config = new ScreenshotConfig({
        url: input_url,
        cache: true,
    });
    const params = config.toApiParams({ key: '1234' });
    assertEquals(params, {
        key: '1234',
        url: input_url,
        cache: true,
    });
});

Deno.test('url param generation: sets cache_ttl', () => {
    const config = new ScreenshotConfig({
        url: input_url,
        cache: true,
        cache_ttl: 3600,
    });
    const params = config.toApiParams({ key: '1234' });
    assertEquals(params, {
        key: '1234',
        url: input_url,
        cache: true,
        cache_ttl: 3600,
    });
});

Deno.test('url param generation: sets cache_clear', () => {
    const config = new ScreenshotConfig({
        url: input_url,
        cache: true,
        cache_clear: true,
    });
    const params = config.toApiParams({ key: '1234' });
    assertEquals(params, {
        key: '1234',
        url: input_url,
        cache: true,
        cache_clear: true,
    });
});

Deno.test('url param generation: ignores cache_ttl and cache_clear with cache disabled', () => {
    const config = new ScreenshotConfig({
        url: input_url,
        cache: false,
        cache_ttl: 3600,
        cache_clear: true,
    });
    const params = config.toApiParams({ key: '1234' });
    assertEquals(params, {
        key: '1234',
        url: input_url,
    });
});