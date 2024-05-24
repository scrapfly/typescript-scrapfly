import { ScrapeConfig } from '../src/scrapeconfig.js';
import { HttpMethod } from '../src/types.js';
import { ScrapeConfigError } from '../src/errors.js';
import { describe, it, expect } from '@jest/globals';

describe('scrapeconfig', () => {
    it('loads', () => {
        const config = new ScrapeConfig({ url: 'http://httpbin.dev/get' });
        expect(config.url).toBe('http://httpbin.dev/get');
    });

    it('allowed methods', () => {
        (['GET', 'POST', 'PUT', 'PATCH', 'HEAD'] as HttpMethod[]).forEach((method) => {
            const config = new ScrapeConfig({
                url: 'http://httpbin.dev/get',
                method: method,
            });
            expect(config.method).toBe(method);
        });
    });

    it('defaults', () => {
        const config = new ScrapeConfig({ url: 'http://httpbin.dev/get' });
        expect(config.method).toBe('GET');
        expect(config.render_js).toBe(false);
    });

    it('POST/PUT/PATCH data->body conversion defaults to form', async () => {
        const config = new ScrapeConfig({
            url: 'http://httpbin.dev/get',
            method: 'POST',
            data: { foo: '123', bar: 456 },
        });
        expect(config.headers['content-type']).toBe('application/x-www-form-urlencoded');
        expect(config.body).toBe('foo=123&bar=456');
    });

    it('POST/PUT/PATCH data->body conversion as json', async () => {
        const config = new ScrapeConfig({
            url: 'http://httpbin.dev/get',
            method: 'POST',
            data: { foo: '123', bar: 456 },
            headers: { 'content-type': 'application/json' },
        });
        expect(config.headers['content-type']).toBe('application/json');
        expect(config.body).toBe('{"foo":"123","bar":456}');
    });

    it('POST/PUT/PATCH body defaults as content-type text/plain', async () => {
        const config = new ScrapeConfig({
            url: 'http://httpbin.dev/get',
            method: 'POST',
            body: 'foo+bar',
        });
        expect(config.headers['content-type']).toBe('text/plain');
        expect(config.body).toBe('foo+bar');
    });
    it('POST/PUT/PATCH data encodes when formdata content-type is set', async () => {
        const config = new ScrapeConfig({
            url: 'http://httpbin.dev/get',
            method: 'POST',
            data: { foo: 1, bar: 'mojito please' },
            headers: { 'content-type': 'application/x-www-form-urlencoded' },
        });
        expect(config.headers['content-type']).toBe('application/x-www-form-urlencoded');
        expect(config.body).toBe('foo=1&bar=mojito+please');
    });
    it('POST/PUT/PATCH data throws when unsupported content-type is set', async () => {
        expect(() => {
            new ScrapeConfig({
                url: 'http://httpbin.dev/get',
                method: 'POST',
                data: { foo: 1, bar: 'mojito please' },
                headers: { 'content-type': 'does/not/exist' },
            });
        }).toThrow(ScrapeConfigError);
    });
});

describe('config invalid', () => {
    it('data and body set together', async () => {
        expect(() => {
            new ScrapeConfig({
                url: 'http://httpbin.dev/get',
                method: 'POST',
                data: { foo: '123' },
                body: '{"foo": "123"}',
            });
        }).toThrow(ScrapeConfigError);
    });
});

describe('url param generation', () => {
    it('basic config', () => {
        const config = new ScrapeConfig({ url: 'http://httpbin.dev/get' });
        const params = config.toApiParams({ key: '1234' });
        expect(params).toEqual({
            key: '1234',
            url: 'http://httpbin.dev/get',
        });
    });

    it('country keeps formatting as is', () => {
        const countries = ['us', 'us,ca,mx', 'us:1,ca:5,mx:3,-gb'];
        countries.forEach((country) => {
            const config = new ScrapeConfig({
                url: 'http://httpbin.dev/get',
                country: country,
            });
            expect(config.toApiParams({ key: '1234' }).country).toBe(country);
        });
    });

    it('headers formatted as headers[key]=value', () => {
        const config = new ScrapeConfig({
            url: 'http://httpbin.dev/get',
            headers: { 'x-test': 'test', 'Content-Type': 'mock' },
        });
        expect(config.toApiParams({ key: '1234' })).toEqual({
            key: '1234',
            url: 'http://httpbin.dev/get',
            'headers[x-test]': 'test',
            'headers[content-type]': 'mock',
        });
    });

    it('headers override duplicates', () => {
        const config = new ScrapeConfig({
            url: 'http://httpbin.dev/get',
            headers: { 'x-test': 'test', 'X-Test': 'mock' },
        });
        expect(config.toApiParams({ key: '1234' })).toEqual({
            key: '1234',
            url: 'http://httpbin.dev/get',
            'headers[x-test]': 'mock',
        });
    });

    it('headers are not case sensitive', () => {
        const config = new ScrapeConfig({
            url: 'http://httpbin.dev/get',
            headers: { 'x-test': 'test', 'X-Test': 'mock' },
        });
        expect(config.toApiParams({ key: '1234' })).toEqual({
            key: '1234',
            url: 'http://httpbin.dev/get',
            'headers[x-test]': 'mock',
        });
    });

    it('cookies added to Cookie header', () => {
        const config = new ScrapeConfig({
            url: 'http://httpbin.dev/get',
            cookies: { 'x-test': 'test', 'X-Test': 'mock' },
        });
        expect(config.toApiParams({ key: '1234' })).toEqual({
            key: '1234',
            url: 'http://httpbin.dev/get',
            'headers[cookie]': 'x-test=mock',
        });
    });

    it('cookies extend Cookie header', () => {
        const config = new ScrapeConfig({
            url: 'http://httpbin.dev/get',
            cookies: { 'x-test': 'test', 'X-Test': 'mock' },
            headers: { cookie: 'foo=bar' },
        });
        expect(config.toApiParams({ key: '1234' })).toEqual({
            key: '1234',
            url: 'http://httpbin.dev/get',
            'headers[cookie]': 'foo=bar; x-test=mock',
        });
    });
    it('complex urls pass as is', () => {
        const config = new ScrapeConfig({
            url: 'https://httpbin.dev/anything/?website=https://httpbin.dev/anything',
        });
        expect(config.toApiParams({ key: '1234' })).toEqual({
            key: '1234',
            url: 'https://httpbin.dev/anything/?website=https://httpbin.dev/anything',
        });
    });
    it('screenshots converted to params', () => {
        const config = new ScrapeConfig({
            url: 'http://httpbin.dev/get',
            screenshots: { everything: 'fullpage' },
            render_js: true,
        });
        expect(config.toApiParams({ key: '1234' })).toEqual({
            key: '1234',
            render_js: true,
            url: 'http://httpbin.dev/get',
            'screenshots[everything]': 'fullpage',
        });
    });
    it('screenshot flags converted to params', () => {
        const config = new ScrapeConfig({
            url: 'http://httpbin.dev/get',
            screenshots: { everything: 'fullpage' },
            screenshot_flags: [
                "load_images",
                "dark_mode",
                "block_banners",
                "high_quality",
                "print_media_format"
            ],
            render_js: true,
        });
        expect(config.toApiParams({ key: '1234' })).toEqual({
            key: '1234',
            url: 'http://httpbin.dev/get',
            'screenshots[everything]': 'fullpage',
            screenshot_flags: "load_images,dark_mode,block_banners,high_quality,print_media_format",            
            render_js: true,
        });
    });    
    it('asp enables', () => {
        const config = new ScrapeConfig({
            url: 'http://httpbin.dev/get',
            asp: true,
        });
        expect(config.toApiParams({ key: '1234' })).toEqual({
            key: '1234',
            url: 'http://httpbin.dev/get',
            asp: true,
        });
    });
    it('dns enables', () => {
        const config = new ScrapeConfig({
            url: 'http://httpbin.dev/get',
            dns: true,
        });
        expect(config.toApiParams({ key: '1234' })).toEqual({
            key: '1234',
            url: 'http://httpbin.dev/get',
            dns: true,
        });
    });
    it('ssl enables', () => {
        const config = new ScrapeConfig({
            url: 'http://httpbin.dev/get',
            ssl: true,
        });
        expect(config.toApiParams({ key: '1234' })).toEqual({
            key: '1234',
            url: 'http://httpbin.dev/get',
            ssl: true,
        });
    });
    it('tags set', () => {
        const config = new ScrapeConfig({
            url: 'http://httpbin.dev/get',
            tags: ['foo', 'bar', 'gaz'],
        });
        expect(config.toApiParams({ key: '1234' })).toEqual({
            key: '1234',
            url: 'http://httpbin.dev/get',
            tags: 'foo,bar,gaz',
        });
    });
    it('format set', () => {
        const config = new ScrapeConfig({
            url: 'http://httpbin.dev/get',
            format: "markdown",
        });
        expect(config.toApiParams({ key: '1234' })).toEqual({
            key: '1234',
            url: 'http://httpbin.dev/get',
            format: "markdown",
        });
    });    
    it('debug sets', () => {
        const config = new ScrapeConfig({
            url: 'http://httpbin.dev/get',
            debug: true,
        });
        expect(config.toApiParams({ key: '1234' })).toEqual({
            key: '1234',
            url: 'http://httpbin.dev/get',
            debug: true,
        });
    });
    it('lang sets', () => {
        const config = new ScrapeConfig({
            url: 'http://httpbin.dev/get',
            lang: ['en', 'fr', 'lt'],
        });
        expect(config.toApiParams({ key: '1234' })).toEqual({
            key: '1234',
            url: 'http://httpbin.dev/get',
            lang: 'en,fr,lt',
        });
    });
    it('os sets', () => {
        const config = new ScrapeConfig({
            url: 'http://httpbin.dev/get',
            os: 'linux',
        });
        expect(config.toApiParams({ key: '1234' })).toEqual({
            key: '1234',
            url: 'http://httpbin.dev/get',
            os: 'linux',
        });
    });
    it('proxy_pool sets', () => {
        const config = new ScrapeConfig({
            url: 'http://httpbin.dev/get',
            proxy_pool: 'public_residential_pool',
        });
        expect(config.toApiParams({ key: '1234' })).toEqual({
            key: '1234',
            url: 'http://httpbin.dev/get',
            proxy_pool: 'public_residential_pool',
        });
    });
    it('session sets', () => {
        const config = new ScrapeConfig({
            url: 'http://httpbin.dev/get',
            session: 'foo123',
        });
        expect(config.toApiParams({ key: '1234' })).toEqual({
            key: '1234',
            url: 'http://httpbin.dev/get',
            session: 'foo123',
        });
    });
    it('session_sticky_proxy sets', () => {
        const config = new ScrapeConfig({
            url: 'http://httpbin.dev/get',
            session: 'foo123',
            session_sticky_proxy: true,
        });
        expect(config.toApiParams({ key: '1234' })).toEqual({
            key: '1234',
            url: 'http://httpbin.dev/get',
            session: 'foo123',
            session_sticky_proxy: true,
        });
    });
    it('session_sticky_proxy ignored with no session', () => {
        const config = new ScrapeConfig({
            url: 'http://httpbin.dev/get',
            session_sticky_proxy: true,
        });
        expect(config.toApiParams({ key: '1234' })).toEqual({
            key: '1234',
            url: 'http://httpbin.dev/get',
        });
    });

    it('correlation id sets', () => {
        const config = new ScrapeConfig({
            url: 'http://httpbin.dev/get',
            correlation_id: '1234',
        });
        expect(config.toApiParams({ key: '1234' })).toEqual({
            key: '1234',
            url: 'http://httpbin.dev/get',
            correlation_id: '1234',
        });
    });
    it('webhook enables', () => {
        const config = new ScrapeConfig({
            url: 'http://httpbin.dev/get',
            webhook: 'snailmail',
        });
        expect(config.toApiParams({ key: '1234' })).toEqual({
            key: '1234',
            url: 'http://httpbin.dev/get',
            webhook_name: 'snailmail',
        });
    });

    it('timeout enables', () => {
        const config = new ScrapeConfig({
            url: 'http://httpbin.dev/get',
            timeout: 10,
        });
        expect(config.toApiParams({ key: '1234' })).toEqual({
            key: '1234',
            url: 'http://httpbin.dev/get',
            timeout: 10,
        });
    });
    it('retry disables', () => {
        const config = new ScrapeConfig({
            url: 'http://httpbin.dev/get',
            retry: false,
        });
        expect(config.toApiParams({ key: '1234' })).toEqual({
            key: '1234',
            url: 'http://httpbin.dev/get',
            retry: false,
        });
    });
    it('cache enables', () => {
        const config = new ScrapeConfig({
            url: 'http://httpbin.dev/get',
            cache: true,
            cache_ttl: 60,
            cache_clear: true,
        });
        expect(config.toApiParams({ key: '1234' })).toEqual({
            key: '1234',
            url: 'http://httpbin.dev/get',
            cache: true,
            cache_ttl: 60,
            cache_clear: true,
        });
    });

    it('auto_scroll enables', () => {
        const config = new ScrapeConfig({
            url: 'http://httpbin.dev/get',
            auto_scroll: true,
            render_js: true,
        });
        expect(config.toApiParams({ key: '1234' })).toEqual({
            key: '1234',
            url: 'http://httpbin.dev/get',
            auto_scroll: true,
            render_js: true,
        });
    });
    it('wait_for_selector sets', () => {
        const config = new ScrapeConfig({
            url: 'http://httpbin.dev/get',
            wait_for_selector: '#foo',
            render_js: true,
        });
        expect(config.toApiParams({ key: '1234' })).toEqual({
            key: '1234',
            url: 'http://httpbin.dev/get',
            wait_for_selector: '#foo',
            render_js: true,
        });
    });
    it('rendering_wait sets', () => {
        const config = new ScrapeConfig({
            url: 'http://httpbin.dev/get',
            rendering_wait: 10,
            render_js: true,
        });
        expect(config.toApiParams({ key: '1234' })).toEqual({
            key: '1234',
            url: 'http://httpbin.dev/get',
            rendering_wait: 10,
            render_js: true,
        });
    });
    it('render_js optionals ignored when disabled', () => {
        const config = new ScrapeConfig({
            url: 'http://httpbin.dev/get',
            wait_for_selector: '.foo',
            screenshots: { all: 'fullpage' },
            js_scenario: [],
            js: '',
            rendering_wait: 10,
        });
        expect(config.toApiParams({ key: '1234' })).toEqual({
            key: '1234',
            url: 'http://httpbin.dev/get',
        });
    });

    it('cache args are ignored when cache disabled', () => {
        const config = new ScrapeConfig({
            url: 'http://httpbin.dev/get',
            cache: false,
            cache_ttl: 60,
            cache_clear: true,
        });
        expect(config.toApiParams({ key: '1234' })).toEqual({
            key: '1234',
            url: 'http://httpbin.dev/get',
        });
    });

    it('js encodes', () => {
        const code = 'return document.querySelectorAll(".review p").map(p=>p.outerText))';
        const config = new ScrapeConfig({
            url: 'https://web-scraping.dev/product/1',
            js: code,
            render_js: true,
        });
        expect(config.toApiParams({ key: '1234' })).toEqual({
            url: 'https://web-scraping.dev/product/1',
            key: '1234',
            render_js: true,
            js: 'cmV0dXJuIGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3JBbGwoIi5yZXZpZXcgcCIpLm1hcChwPT5wLm91dGVyVGV4dCkp',
        });
    });
    it('js scenario encodes', () => {
        const scenario = [
            { wait_for_selector: { selector: '.review' } },
            { click: { selector: '#load-more-reviews' } },
            { wait_for_navigation: {} },
            {
                execute: {
                    script: "[...document.querySelectorAll('.review p')].map(p=>p.outerText)",
                },
            },
        ];
        const config = new ScrapeConfig({
            url: 'https://web-scraping.dev/product/1',
            js_scenario: scenario,
            render_js: true,
        });
        expect(config.toApiParams({ key: '1234' })).toEqual({
            url: 'https://web-scraping.dev/product/1',
            key: '1234',
            render_js: true,
            js_scenario:
                'W3sid2FpdF9mb3Jfc2VsZWN0b3IiOnsic2VsZWN0b3IiOiIucmV2aWV3In19LHsiY2xpY2siOnsic2VsZWN0b3IiOiIjbG9hZC1tb3JlLXJldmlld3MifX0seyJ3YWl0X2Zvcl9uYXZpZ2F0aW9uIjp7fX0seyJleGVjdXRlIjp7InNjcmlwdCI6IlsuLi5kb2N1bWVudC5xdWVyeVNlbGVjdG9yQWxsKCcucmV2aWV3IHAnKV0ubWFwKHA9PnAub3V0ZXJUZXh0KSJ9fV0',
        });
    });
});
