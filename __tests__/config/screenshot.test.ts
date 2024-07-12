import { ScreenshotConfig, Format, Options } from '../../src/screenshotconfig.js';
import { ScreenshotConfigError } from '../../src/errors.js';
import { describe, it, expect } from '@jest/globals';

describe('scrapeconfig', () => {
    it('loads', () => {
        const config = new ScreenshotConfig({ url: 'http://httpbin.dev/get' });
        expect(config.url).toBe('http://httpbin.dev/get');
    });
});

describe('config invalid', () => {
    it('sets invalid format', async () => {
        expect(() => {
            new ScreenshotConfig({
                url: 'http://httpbin.dev/get',
                format: 'invalid' as any,
            });
        }).toThrow(ScreenshotConfigError);
    });

    it('sets invalid options', async () => {
        expect(() => {
            new ScreenshotConfig({
                url: 'http://httpbin.dev/get',
                options: ['invalid', 'invalid_too'] as any,
            });
        }).toThrow(ScreenshotConfigError);
    });
});

describe('url param generation', () => {
    it('basic config', () => {
        const config = new ScreenshotConfig({ url: 'http://httpbin.dev/get' });
        const params = config.toApiParams({ key: '1234' });
        expect(params).toEqual({
            key: '1234',
            url: 'http://httpbin.dev/get',
        });
    });

    it('sets format', () => {
        const config = new ScreenshotConfig({
            url: 'http://httpbin.dev/get',
            format: Format.PNG,
        });
        const params = config.toApiParams({ key: '1234' });
        expect(params).toEqual({
            key: '1234',
            url: 'http://httpbin.dev/get',
            format: 'png',
        });
    });

    it('sets capture', () => {
        const config = new ScreenshotConfig({
            url: 'http://httpbin.dev/get',
            capture: 'fullpage',
        });
        const params = config.toApiParams({ key: '1234' });
        expect(params).toEqual({
            key: '1234',
            url: 'http://httpbin.dev/get',
            capture: 'fullpage',
        });
    });

    it('sets resolution', () => {
        const config = new ScreenshotConfig({
            url: 'http://httpbin.dev/get',
            resolution: '1920x1080',
        });
        const params = config.toApiParams({ key: '1234' });
        expect(params).toEqual({
            key: '1234',
            url: 'http://httpbin.dev/get',
            resolution: '1920x1080',
        });
    });

    it('sets country', () => {
        const config = new ScreenshotConfig({
            url: 'http://httpbin.dev/get',
            country: 'us,ca,mx',
        });
        const params = config.toApiParams({ key: '1234' });
        expect(params).toEqual({
            key: '1234',
            url: 'http://httpbin.dev/get',
            country: 'us,ca,mx',
        });
    });

    it('sets timeout', () => {
        const config = new ScreenshotConfig({
            url: 'http://httpbin.dev/get',
            timeout: 60000,
        });
        const params = config.toApiParams({ key: '1234' });
        expect(params).toEqual({
            key: '1234',
            url: 'http://httpbin.dev/get',
            timeout: 60000,
        });
    });

    it('sets rendering_wait', () => {
        const config = new ScreenshotConfig({
            url: 'http://httpbin.dev/get',
            rendering_wait: 5000,
        });
        const params = config.toApiParams({ key: '1234' });
        expect(params).toEqual({
            key: '1234',
            url: 'http://httpbin.dev/get',
            rendering_wait: 5000,
        });
    });

    it('sets wait_for_selector', () => {
        const config = new ScreenshotConfig({
            url: 'http://httpbin.dev/get',
            wait_for_selector: '//div[@class="prouct"]',
        });
        const params = config.toApiParams({ key: '1234' });
        expect(params).toEqual({
            key: '1234',
            url: 'http://httpbin.dev/get',
            wait_for_selector: '//div[@class="prouct"]',
        });
    });

    it('sets options', () => {
        const config = new ScreenshotConfig({
            url: 'http://httpbin.dev/get',
            options: [Options.BLOCK_BANNERS, Options.DARK_MODE, Options.LOAD_IMAGES, Options.PRINT_MEDIA_FORMAT],
        });
        const params = config.toApiParams({ key: '1234' });
        expect(params).toEqual({
            key: '1234',
            url: 'http://httpbin.dev/get',
            options: 'block_banners,dark_mode,load_images,print_media_format',
        });
    });

    it('sets auto_scroll', () => {
        const config = new ScreenshotConfig({
            url: 'http://httpbin.dev/get',
            auto_scroll: true,
        });
        const params = config.toApiParams({ key: '1234' });
        expect(params).toEqual({
            key: '1234',
            url: 'http://httpbin.dev/get',
            auto_scroll: true,
        });
    });

    it('sets js', () => {
        const config = new ScreenshotConfig({
            url: 'http://httpbin.dev/get',
            js: 'return document.querySelectorAll(".review p").map(p=>p.outerText))',
        });
        const params = config.toApiParams({ key: '1234' });
        expect(params).toEqual({
            key: '1234',
            url: 'http://httpbin.dev/get',
            js: 'cmV0dXJuIGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3JBbGwoIi5yZXZpZXcgcCIpLm1hcChwPT5wLm91dGVyVGV4dCkp',
        });
    });

    it('sets cache', () => {
        const config = new ScreenshotConfig({
            url: 'http://httpbin.dev/get',
            cache: true,
        });
        const params = config.toApiParams({ key: '1234' });
        expect(params).toEqual({
            key: '1234',
            url: 'http://httpbin.dev/get',
            cache: true,
        });
    });

    it('sets cache_ttl', () => {
        const config = new ScreenshotConfig({
            url: 'http://httpbin.dev/get',
            cache: true,
            cache_ttl: true,
        });
        const params = config.toApiParams({ key: '1234' });
        expect(params).toEqual({
            key: '1234',
            url: 'http://httpbin.dev/get',
            cache: true,
            cache_ttl: true,
        });
    });

    it('sets cache_clear', () => {
        const config = new ScreenshotConfig({
            url: 'http://httpbin.dev/get',
            cache: true,
            cache_clear: true,
        });
        const params = config.toApiParams({ key: '1234' });
        expect(params).toEqual({
            key: '1234',
            url: 'http://httpbin.dev/get',
            cache: true,
            cache_clear: true,
        });
    });

    it('ignores cache_ttl and cache_clear with cache disabled', () => {
        const config = new ScreenshotConfig({
            url: 'http://httpbin.dev/get',
            cache: false,
            cache_ttl: true,
            cache_clear: true,
        });
        const params = config.toApiParams({ key: '1234' });
        expect(params).toEqual({
            key: '1234',
            url: 'http://httpbin.dev/get',
        });
    });
});
