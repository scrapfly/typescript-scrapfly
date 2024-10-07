import { ScrapeConfig, ScreenshotFlags, Format, FormatOption } from '../../src/scrapeconfig.ts';
import { HttpMethod } from '../../src/types.ts';
import { ScrapeConfigError } from '../../src/errors.ts';
import { assertEquals, assertThrows } from "https://deno.land/std@0.224.0/assert/mod.ts";


Deno.test('scrapeconfig loads', () => {
    const config = new ScrapeConfig({ url: 'http://httpbin.dev/get' });
    assertEquals(config.url, 'http://httpbin.dev/get');
});

Deno.test('scrapeconfig throws on unknown options', () => {
    assertThrows(() => {
        new ScrapeConfig({ url: 'http://httpbin.dev/get', foobar: 'baz' } as any);
    }, ScrapeConfigError, "Invalid option provided: foobar");
});



Deno.test('scrapeconfig allowed methods', () => {
    (['GET', 'POST', 'PUT', 'PATCH', 'HEAD'] as HttpMethod[]).forEach((method) => {
        const config = new ScrapeConfig({
            url: 'http://httpbin.dev/get',
            method: method,
        });
        assertEquals(config.method, method);
    });
});

Deno.test('scrapeconfig defaults', () => {
    const config = new ScrapeConfig({ url: 'http://httpbin.dev/get' });
    assertEquals(config.method, 'GET');
    assertEquals(config.render_js, false);
});

Deno.test('scrapeconfig POST/PUT/PATCH data->body conversion defaults to form', async () => {
    const config = new ScrapeConfig({
        url: 'http://httpbin.dev/get',
        method: 'POST',
        data: { foo: '123', bar: 456 },
        headers: {},
    });
    assertEquals((config.headers || {})['content-type'], 'application/x-www-form-urlencoded');
    assertEquals(config.body, 'foo=123&bar=456');
});

Deno.test('scrapeconfig POST/PUT/PATCH data->body conversion as json', async () => {
    const config = new ScrapeConfig({
        url: 'http://httpbin.dev/get',
        method: 'POST',
        data: { foo: '123', bar: 456 },
        headers: { 'content-type': 'application/json' },
    });
    assertEquals((config.headers || {})['content-type'], 'application/json');
    assertEquals(config.body, '{"foo":"123","bar":456}');
});

Deno.test('scrapeconfig POST/PUT/PATCH body defaults as content-type text/plain', async () => {
    const config = new ScrapeConfig({
        url: 'http://httpbin.dev/get',
        method: 'POST',
        body: 'foo+bar',
    });
    assertEquals((config.headers || {})['content-type'], 'text/plain');
    assertEquals(config.body, 'foo+bar');
});

Deno.test('scrapeconfig POST/PUT/PATCH body does not override content-type when set', async () => {
    const config = new ScrapeConfig({
        url: 'http://httpbin.dev/get',
        method: 'POST',
        body: 'foo+bar',
        headers: { 'content-type': 'application/json' },
    });
    assertEquals((config.headers || {})['content-type'], 'application/json');
    assertEquals(config.body, 'foo+bar');
});

Deno.test('scrapeconfig POST/PUT/PATCH data encodes when formdata content-type is set', async () => {
    const config = new ScrapeConfig({
        url: 'http://httpbin.dev/get',
        method: 'POST',
        data: { foo: 1, bar: 'mojito please' },
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
    });
    assertEquals((config.headers || {})['content-type'], 'application/x-www-form-urlencoded');
    assertEquals(config.body, 'foo=1&bar=mojito+please');
});

Deno.test('scrapeconfig POST/PUT/PATCH data throws when unsupported content-type is set', async () => {
    assertThrows(() => {
        new ScrapeConfig({
            url: 'http://httpbin.dev/get',
            method: 'POST',
            data: { foo: 1, bar: 'mojito please' },
            headers: { 'content-type': 'does/not/exist' },
        });
    }, ScrapeConfigError);
});

Deno.test('config invalid: data and body set together', async () => {
    assertThrows(() => {
        new ScrapeConfig({
            url: 'http://httpbin.dev/get',
            method: 'POST',
            data: { foo: '123' },
            body: '{"foo": "123"}',
        });
    }, ScrapeConfigError);
});

Deno.test('url param generation: basic config', () => {
    const config = new ScrapeConfig({ url: 'http://httpbin.dev/get' });
    const params = config.toApiParams({ key: '1234' });
    assertEquals(params, {
        key: '1234',
        url: 'http://httpbin.dev/get',
    });
});

Deno.test('url param generation: country keeps formatting as is', () => {
    const countries = ['us', 'us,ca,mx', 'us:1,ca:5,mx:3,-gb'];
    countries.forEach((country) => {
        const config = new ScrapeConfig({
            url: 'http://httpbin.dev/get',
            country: country,
        });
        assertEquals(config.toApiParams({ key: '1234' }).country, country);
    });
});

Deno.test('url param generation: headers formatted as headers[key]=value', () => {
    const config = new ScrapeConfig({
        url: 'http://httpbin.dev/get',
        headers: { 'x-test': 'test', 'Content-Type': 'mock' },
    });
    assertEquals(config.toApiParams({ key: '1234' }), {
        key: '1234',
        url: 'http://httpbin.dev/get',
        'headers[x-test]': 'test',
        'headers[content-type]': 'mock',
    });
});

Deno.test('url param generation: headers override duplicates', () => {
    const config = new ScrapeConfig({
        url: 'http://httpbin.dev/get',
        headers: { 'x-test': 'test', 'X-Test': 'mock' },
    });
    assertEquals(config.toApiParams({ key: '1234' }), {
        key: '1234',
        url: 'http://httpbin.dev/get',
        'headers[x-test]': 'mock',
    });
});

Deno.test('url param generation: headers are not case sensitive', () => {
    const config = new ScrapeConfig({
        url: 'http://httpbin.dev/get',
        headers: { 'x-test': 'test', 'X-Test': 'mock' },
    });
    assertEquals(config.toApiParams({ key: '1234' }), {
        key: '1234',
        url: 'http://httpbin.dev/get',
        'headers[x-test]': 'mock',
    });
});

Deno.test('url param generation: cookies added to Cookie header', () => {
    const config = new ScrapeConfig({
        url: 'http://httpbin.dev/get',
        cookies: { 'x-test': 'test', 'X-Test': 'mock' },
    });
    assertEquals(config.toApiParams({ key: '1234' }), {
        key: '1234',
        url: 'http://httpbin.dev/get',
        'headers[cookie]': 'x-test=mock',
    });
});

Deno.test('url param generation: cookies extend Cookie header', () => {
    const config = new ScrapeConfig({
        url: 'http://httpbin.dev/get',
        cookies: { 'x-test': 'test', 'X-Test': 'mock' },
        headers: { cookie: 'foo=bar' },
    });
    assertEquals(config.toApiParams({ key: '1234' }), {
        key: '1234',
        url: 'http://httpbin.dev/get',
        'headers[cookie]': 'foo=bar; x-test=mock',
    });
});

Deno.test('url param generation: complex urls pass as is', () => {
    const config = new ScrapeConfig({
        url: 'https://httpbin.dev/anything/?website=https://httpbin.dev/anything',
    });
    assertEquals(config.toApiParams({ key: '1234' }), {
        key: '1234',
        url: 'https://httpbin.dev/anything/?website=https://httpbin.dev/anything',
    });
});

Deno.test('url param generation: screenshots converted to params', () => {
    const config = new ScrapeConfig({
        url: 'http://httpbin.dev/get',
        screenshots: { everything: 'fullpage' },
        render_js: true,
    });
    assertEquals(config.toApiParams({ key: '1234' }), {
        key: '1234',
        render_js: true,
        url: 'http://httpbin.dev/get',
        'screenshots[everything]': 'fullpage',
    });
});

Deno.test('url param generation: screenshot flags converted to params', () => {
    const config = new ScrapeConfig({
        url: 'http://httpbin.dev/get',
        screenshots: { everything: 'fullpage' },
        screenshot_flags: [
            ScreenshotFlags.LOAD_IMAGES,
            ScreenshotFlags.DARK_MODE,
            ScreenshotFlags.BLOCK_BANNERS,
            ScreenshotFlags.HIGH_QUALITY,
            ScreenshotFlags.LOAD_IMAGES,
        ],
        render_js: true,
    });
    assertEquals(config.toApiParams({ key: '1234' }), {
        key: '1234',
        url: 'http://httpbin.dev/get',
        'screenshots[everything]': 'fullpage',
        screenshot_flags: 'load_images,dark_mode,block_banners,high_quality,load_images',
        render_js: true,
    });
});

Deno.test('url param generation: format options converted to format extension', () => {
    const config = new ScrapeConfig({
        url: 'http://httpbin.dev/get',
        format: Format.MARKDOWN,
        format_options: [FormatOption.NO_IMAGES, FormatOption.NO_LINKS],
    });
    assertEquals(config.toApiParams({ key: '1234' }), {
        key: '1234',
        url: 'http://httpbin.dev/get',
        format: "markdown:no_images,no_links"
    });
});



Deno.test('url param generation: asp enables', () => {
    const config = new ScrapeConfig({
        url: 'http://httpbin.dev/get',
        asp: true,
    });
    assertEquals(config.toApiParams({ key: '1234' }), {
        key: '1234',
        url: 'http://httpbin.dev/get',
        asp: true,
    });
});

Deno.test('url param generation: dns enables', () => {
    const config = new ScrapeConfig({
        url: 'http://httpbin.dev/get',
        dns: true,
    });
    assertEquals(config.toApiParams({ key: '1234' }), {
        key: '1234',
        url: 'http://httpbin.dev/get',
        dns: true,
    });
});

Deno.test('url param generation: ssl enables', () => {
    const config = new ScrapeConfig({
        url: 'http://httpbin.dev/get',
        ssl: true,
    });
    assertEquals(config.toApiParams({ key: '1234' }), {
        key: '1234',
        url: 'http://httpbin.dev/get',
        ssl: true,
    });
});

Deno.test('url param generation: tags set', () => {
    const config = new ScrapeConfig({
        url: 'http://httpbin.dev/get',
        tags: ['foo', 'bar', 'gaz'],
    });
    assertEquals(config.toApiParams({ key: '1234' }), {
        key: '1234',
        url: 'http://httpbin.dev/get',
        tags: 'foo,bar,gaz',
    });
});

Deno.test('url param generation: format set', () => {
    const config = new ScrapeConfig({
        url: 'http://httpbin.dev/get',
        format: Format.MARKDOWN,
    });
    assertEquals(config.toApiParams({ key: '1234' }), {
        key: '1234',
        url: 'http://httpbin.dev/get',
        format: 'markdown',
    });
});

Deno.test('url param generation: debug sets', () => {
    const config = new ScrapeConfig({
        url: 'http://httpbin.dev/get',
        debug: true,
    });
    assertEquals(config.toApiParams({ key: '1234' }), {
        key: '1234',
        url: 'http://httpbin.dev/get',
        debug: true,
    });
});

Deno.test('url param generation: lang sets', () => {
    const config = new ScrapeConfig({
        url: 'http://httpbin.dev/get',
        lang: ['en', 'fr', 'lt'],
    });
    assertEquals(config.toApiParams({ key: '1234' }), {
        key: '1234',
        url: 'http://httpbin.dev/get',
        lang: 'en,fr,lt',
    });
});

Deno.test('url param generation: os sets', () => {
    const config = new ScrapeConfig({
        url: 'http://httpbin.dev/get',
        os: 'linux',
    });
    assertEquals(config.toApiParams({ key: '1234' }), {
        key: '1234',
        url: 'http://httpbin.dev/get',
        os: 'linux',
    });
});

Deno.test('url param generation: proxy_pool sets', () => {
    const config = new ScrapeConfig({
        url: 'http://httpbin.dev/get',
        proxy_pool: 'public_residential_pool',
    });
    assertEquals(config.toApiParams({ key: '1234' }), {
        key: '1234',
        url: 'http://httpbin.dev/get',
        proxy_pool: 'public_residential_pool',
    });
});

Deno.test('url param generation: session sets', () => {
    const config = new ScrapeConfig({
        url: 'http://httpbin.dev/get',
        session: 'foo123',
    });
    assertEquals(config.toApiParams({ key: '1234' }), {
        key: '1234',
        url: 'http://httpbin.dev/get',
        session: 'foo123',
    });
});

Deno.test('url param generation: session_sticky_proxy sets', () => {
    const config = new ScrapeConfig({
        url: 'http://httpbin.dev/get',
        session: 'foo123',
        session_sticky_proxy: true,
    });
    assertEquals(config.toApiParams({ key: '1234' }), {
        key: '1234',
        url: 'http://httpbin.dev/get',
        session: 'foo123',
        session_sticky_proxy: true,
    });
});

Deno.test('url param generation: session_sticky_proxy ignored with no session', () => {
    const config = new ScrapeConfig({
        url: 'http://httpbin.dev/get',
        session_sticky_proxy: true,
    });
    assertEquals(config.toApiParams({ key: '1234' }), {
        key: '1234',
        url: 'http://httpbin.dev/get',
    });
});

Deno.test('url param generation: correlation id sets', () => {
    const config = new ScrapeConfig({
        url: 'http://httpbin.dev/get',
        correlation_id: '1234',
    });
    assertEquals(config.toApiParams({ key: '1234' }), {
        key: '1234',
        url: 'http://httpbin.dev/get',
        correlation_id: '1234',
    });
});

Deno.test('url param generation: webhook enables', () => {
    const config = new ScrapeConfig({
        url: 'http://httpbin.dev/get',
        webhook: 'snailmail',
    });
    assertEquals(config.toApiParams({ key: '1234' }), {
        key: '1234',
        url: 'http://httpbin.dev/get',
        webhook_name: 'snailmail',
    });
});

Deno.test('url param generation: timeout enables', () => {
    const config = new ScrapeConfig({
        url: 'http://httpbin.dev/get',
        timeout: 10,
    });
    assertEquals(config.toApiParams({ key: '1234' }), {
        key: '1234',
        url: 'http://httpbin.dev/get',
        timeout: 10,
    });
});

Deno.test('url param generation: retry disables', () => {
    const config = new ScrapeConfig({
        url: 'http://httpbin.dev/get',
        retry: false,
    });
    assertEquals(config.toApiParams({ key: '1234' }), {
        key: '1234',
        url: 'http://httpbin.dev/get',
        retry: false,
    });
});

Deno.test('url param generation: cache enables', () => {
    const config = new ScrapeConfig({
        url: 'http://httpbin.dev/get',
        cache: true,
        cache_ttl: 60,
        cache_clear: true,
    });
    assertEquals(config.toApiParams({ key: '1234' }), {
        key: '1234',
        url: 'http://httpbin.dev/get',
        cache: true,
        cache_ttl: 60,
        cache_clear: true,
    });
});

Deno.test('url param generation: auto_scroll enables', () => {
    const config = new ScrapeConfig({
        url: 'http://httpbin.dev/get',
        auto_scroll: true,
        render_js: true,
    });
    assertEquals(config.toApiParams({ key: '1234' }), {
        key: '1234',
        url: 'http://httpbin.dev/get',
        auto_scroll: true,
        render_js: true,
    });
});

Deno.test('url param generation: wait_for_selector sets', () => {
    const config = new ScrapeConfig({
        url: 'http://httpbin.dev/get',
        wait_for_selector: '#foo',
        render_js: true,
    });
    assertEquals(config.toApiParams({ key: '1234' }), {
        key: '1234',
        url: 'http://httpbin.dev/get',
        wait_for_selector: '#foo',
        render_js: true,
    });
});

Deno.test('url param generation: rendering_wait sets', () => {
    const config = new ScrapeConfig({
        url: 'http://httpbin.dev/get',
        rendering_wait: 10,
        render_js: true,
    });
    assertEquals(config.toApiParams({ key: '1234' }), {
        key: '1234',
        url: 'http://httpbin.dev/get',
        rendering_wait: 10,
        render_js: true,
    });
});

Deno.test('url param generation: rendering_wait sets', () => {
    const config = new ScrapeConfig({
        url: 'http://httpbin.dev/get',
        rendering_wait: 10,
        render_js: true,
    });
    assertEquals(config.toApiParams({ key: '1234' }), {
        key: '1234',
        url: 'http://httpbin.dev/get',
        rendering_wait: 10,
        render_js: true,
    });
});

Deno.test('url param generation: rendering_wait sets', () => {
    const config = new ScrapeConfig({
        url: 'http://httpbin.dev/get',
        rendering_wait: 10,
        render_js: true,
    });
    assertEquals(config.toApiParams({ key: '1234' }), {
        key: '1234',
        url: 'http://httpbin.dev/get',
        rendering_wait: 10,
        render_js: true,
    });
});

Deno.test('url param generation: render_js optionals ignored when disabled', () => {
    const config = new ScrapeConfig({
        url: 'http://httpbin.dev/get',
        wait_for_selector: '.foo',
        screenshots: { all: 'fullpage' },
        js_scenario: [],
        js: '',
        rendering_wait: 10,
    });
    assertEquals(config.toApiParams({ key: '1234' }), {
        key: '1234',
        url: 'http://httpbin.dev/get',
    });
});

Deno.test('url param generation: cache args are ignored when cache disabled', () => {
    const config = new ScrapeConfig({
        url: 'http://httpbin.dev/get',
        cache: false,
        cache_ttl: 60,
        cache_clear: true,
    });
    assertEquals(config.toApiParams({ key: '1234' }), {
        key: '1234',
        url: 'http://httpbin.dev/get',
    });
});

Deno.test('url param generation: js encodes', () => {
    const code = 'return document.querySelectorAll(".review p").map(p=>p.outerText))';
    const config = new ScrapeConfig({
        url: 'https://web-scraping.dev/product/1',
        js: code,
        render_js: true,
    });
    assertEquals(config.toApiParams({ key: '1234' }), {
        url: 'https://web-scraping.dev/product/1',
        key: '1234',
        render_js: true,
        js: 'cmV0dXJuIGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3JBbGwoIi5yZXZpZXcgcCIpLm1hcChwPT5wLm91dGVyVGV4dCkp',
    });
});

Deno.test('url param generation: js scenario encodes', () => {
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
    assertEquals(config.toApiParams({ key: '1234' }), {
        url: 'https://web-scraping.dev/product/1',
        key: '1234',
        render_js: true,
        js_scenario:
            'W3sid2FpdF9mb3Jfc2VsZWN0b3IiOnsic2VsZWN0b3IiOiIucmV2aWV3In19LHsiY2xpY2siOnsic2VsZWN0b3IiOiIjbG9hZC1tb3JlLXJldmlld3MifX0seyJ3YWl0X2Zvcl9uYXZpZ2F0aW9uIjp7fX0seyJleGVjdXRlIjp7InNjcmlwdCI6IlsuLi5kb2N1bWVudC5xdWVyeVNlbGVjdG9yQWxsKCcucmV2aWV3IHAnKV0ubWFwKHA9PnAub3V0ZXJUZXh0KSJ9fV0',
    });
});