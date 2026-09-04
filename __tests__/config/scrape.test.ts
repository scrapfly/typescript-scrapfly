import { ScrapeConfig, ScreenshotFlags, Format, FormatOption } from '../../src/scrapeconfig.ts';
import { HttpMethod } from '../../src/types.ts';
import { ScrapeConfigError } from '../../src/errors.ts';
import { assertEquals, assertThrows } from "https://deno.land/std@0.224.0/assert/mod.ts";

const input_content_type = 'text/html';

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

// `unblocker` is the customer-facing name for the anti-bot bypass; `asp` is the
// permanently supported deprecated alias. The wire key stays `asp` for both:
// these assertEquals compare the whole param object, so an `unblocker` key
// leaking onto the wire fails them.
Deno.test('url param generation: unblocker enables and is sent as asp', () => {
    const config = new ScrapeConfig({
        url: 'http://httpbin.dev/get',
        unblocker: true,
    });
    assertEquals(config.unblocker, true);
    assertEquals(config.asp, true);
    assertEquals(config.toApiParams({ key: '1234' }), {
        key: '1234',
        url: 'http://httpbin.dev/get',
        asp: true,
    });
});

Deno.test('url param generation: unblocker false leaves the feature off', () => {
    const config = new ScrapeConfig({
        url: 'http://httpbin.dev/get',
        unblocker: false,
    });
    assertEquals(config.unblocker, false);
    assertEquals(config.toApiParams({ key: '1234' }), {
        key: '1234',
        url: 'http://httpbin.dev/get',
    });
});

Deno.test('url param generation: explicit asp wins over unblocker', () => {
    // asp:false is an explicit "off" and must not be overridden by unblocker.
    const off = new ScrapeConfig({
        url: 'http://httpbin.dev/get',
        asp: false,
        unblocker: true,
    });
    assertEquals(off.asp, false);
    assertEquals(off.unblocker, false);
    assertEquals(off.toApiParams({ key: '1234' }), {
        key: '1234',
        url: 'http://httpbin.dev/get',
    });

    const on = new ScrapeConfig({
        url: 'http://httpbin.dev/get',
        asp: true,
        unblocker: false,
    });
    assertEquals(on.asp, true);
    assertEquals(on.unblocker, true);
    assertEquals(on.toApiParams({ key: '1234' }), {
        key: '1234',
        url: 'http://httpbin.dev/get',
        asp: true,
    });
});

Deno.test('scrapeconfig accepts unblocker as a constructor option', () => {
    // validateOptions builds its allow-list from Object.keys(this), which never
    // contains an accessor. Without the alias allow-list this throws
    // "Invalid option provided: unblocker".
    const config = new ScrapeConfig({ url: 'http://httpbin.dev/get', unblocker: true });
    assertEquals(config.asp, true);
});

Deno.test('scrapeconfig unblocker and asp are one value after construction', () => {
    // Both names address a single storage slot, so a mutation through either
    // one is visible on the other and reaches the wire.
    const config = new ScrapeConfig({ url: 'http://httpbin.dev/get' });
    config.unblocker = true;
    assertEquals(config.asp, true);
    assertEquals(config.toApiParams({ key: '1234' }).asp, true);

    // Turning it back off through the deprecated name must still turn it off.
    config.asp = false;
    assertEquals(config.unblocker, false);
    assertEquals(config.toApiParams({ key: '1234' }).asp, undefined);

    config.unblocker = false;
    const enabled = new ScrapeConfig({ url: 'http://httpbin.dev/get', asp: true });
    enabled.unblocker = false;
    assertEquals(enabled.asp, false);
    assertEquals(enabled.toApiParams({ key: '1234' }).asp, undefined);
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

Deno.test('url param generation: sets extraction_template', async () => {
    const config = new ScrapeConfig({
        url: 'http://httpbin.dev/get',
        extraction_template: 'my_template',
    });
    const params = config.toApiParams({ key: '1234' });
    assertEquals(params, {
        key: '1234',
        url: 'http://httpbin.dev/get',
        // Sent as persistent:<slug>, matching the python, go and rust SDKs.
        extraction_template: 'persistent:my_template',
    });
});

Deno.test('url param generation: sets extraction_ephemeral_template', async () => {
    const config = new ScrapeConfig({
        url: 'http://httpbin.dev/get',
        extraction_ephemeral_template: { source: 'html', selectors: [] },
    });
    const params = config.toApiParams({ key: '1234' });
    assertEquals(params, {
        key: '1234',
        url: 'http://httpbin.dev/get',
        extraction_template: 'ephemeral:eyJzb3VyY2UiOiJodG1sIiwic2VsZWN0b3JzIjpbXX0',
    });
});

Deno.test('url param generation: sets extraction_prompt', async () => {
    const config = new ScrapeConfig({
        url: 'http://httpbin.dev/get',
        extraction_prompt: 'summarize the document',
    });
    const params = config.toApiParams({ key: '1234' });
    assertEquals(params, {
        key: '1234',
        url: 'http://httpbin.dev/get',
        extraction_prompt: 'summarize the document',
    });
});

Deno.test('url param generation: sets extraction_model', async () => {
    const config = new ScrapeConfig({
        url: 'http://httpbin.dev/get',
        extraction_model: 'review_list',
    });
    const params = config.toApiParams({ key: '1234' });
    assertEquals(params, {
        key: '1234',
        url: 'http://httpbin.dev/get',
        extraction_model: 'review_list',
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
        // Defaults to true and is emitted whenever a session is set, matching the
        // python SDK.
        session_sticky_proxy: true,
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

Deno.test('url param generation: session_sticky_proxy defaults to true', () => {
    const config = new ScrapeConfig({
        url: 'http://httpbin.dev/get',
        session: 'foo123',
    });
    assertEquals(config.toApiParams({ key: '1234' }), {
        key: '1234',
        url: 'http://httpbin.dev/get',
        session: 'foo123',
        session_sticky_proxy: true,
    });
});

Deno.test('url param generation: session_sticky_proxy=false is sent explicitly', () => {
    // false must reach the wire — omitting it lets the API default to
    // sticky=true with a session, so the user could never disable it.
    const config = new ScrapeConfig({
        url: 'http://httpbin.dev/get',
        session: 'foo123',
        session_sticky_proxy: false,
    });
    assertEquals(config.toApiParams({ key: '1234' }), {
        key: '1234',
        url: 'http://httpbin.dev/get',
        session: 'foo123',
        session_sticky_proxy: false,
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
// ===========================================================================
// unblocker <-> asp PARITY MATRIX
//
// The guarantee a customer migrating from `asp` to `unblocker` relies on is
// stronger than "unblocker sets the flag": FOR EVERY CASE THE TWO NAMES MUST
// BEHAVE EXACTLY THE SAME. A targeted assertion on the `asp` key cannot prove
// that — the two names could still diverge in another emitted key, in stored
// instance state, or in whether validateOptions accepts them. Every test below
// compares WHOLE outputs of two configs that differ only in which name was
// used, so a divergence anywhere fails it.
// ===========================================================================

const PARITY_KEY = '1234';

/**
 * `toApiParams()` as a key-sorted entry list. Sorting is only so that a
 * difference in key ORDER cannot raise a false failure; a difference in any
 * key or any value still fails.
 */
function scrapeParamEntries(config: ScrapeConfig): Array<[string, unknown]> {
    return Object.entries(config.toApiParams({ key: PARITY_KEY })).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
}

/**
 * A whole-output comparison is only as strong as the output has fields to
 * diverge in. If a fixture is ever trimmed, or the serializer regresses to
 * emitting almost nothing, every equality below would still pass while its name
 * claimed it compared "byte-identical params". This floor stops that; the Go
 * SDK's matrix carries the same guard (`len(legacy) < 25`).
 */
const MIN_LOADED_PARAMS = 25;

function assertNotVacuous(entries: Array<[string, unknown]>, what: string) {
    assertEquals(
        entries.length >= MIN_LOADED_PARAMS,
        true,
        `${what} emits only ${entries.length} keys (${entries.map(([k]) => k).join(', ')}); a whole-output ` +
            `comparison over that proves almost nothing. Expected at least ${MIN_LOADED_PARAMS}.`,
    );
}

/**
 * One deliberately rich option set — everything ScrapeConfig serializes except
 * the anti-bot toggle — plus whatever the caller passes for the toggle. Rich
 * rather than minimal on purpose: whole-output equality between two of these
 * then covers every other field the rename could have disturbed, not just the
 * one key under test.
 */
function scrapeConfigWith(toggle: { asp?: boolean; unblocker?: boolean }): ScrapeConfig {
    return new ScrapeConfig({
        url: 'http://httpbin.dev/get',
        render_js: true,
        country: 'us',
        proxy_pool: ScrapeConfig.PUBLIC_RESIDENTIAL_POOL,
        session: 'parity-session',
        session_sticky_proxy: true,
        cache: true,
        cache_ttl: 3600,
        cache_clear: true,
        cost_budget: 25,
        retry: false,
        dns: true,
        ssl: true,
        debug: true,
        tags: ['alpha', 'beta'],
        headers: { 'X-Parity': 'yes' },
        cookies: { cart: '42' },
        js: 'return document.title',
        js_scenario: [{ wait_for_selector: { selector: '#done' } }],
        rendering_wait: 250,
        rendering_stage: 'domcontentloaded',
        wait_for_selector: '#done',
        auto_scroll: true,
        geolocation: '48.856614,2.3522219',
        screenshots: { all: 'fullpage' },
        screenshot_flags: [ScreenshotFlags.LOAD_IMAGES],
        format: Format.MARKDOWN,
        format_options: [FormatOption.NO_LINKS],
        extraction_prompt: 'extract the title',
        extraction_model: 'product',
        correlation_id: 'parity-corr',
        webhook: 'parity-hook',
        timeout: 30000,
        proxified_response: true,
        os: 'linux',
        lang: ['en', 'fr'],
        browser_brand: 'chrome',
        ...toggle,
    });
}

Deno.test('parity: asp and unblocker emit byte-identical params (enabled)', () => {
    const viaAsp = scrapeConfigWith({ asp: true });
    const viaUnblocker = scrapeConfigWith({ unblocker: true });
    assertNotVacuous(scrapeParamEntries(viaAsp), 'loaded scrape params');
    // Whole emitted output, not just the one key.
    assertEquals(scrapeParamEntries(viaUnblocker), scrapeParamEntries(viaAsp));
    // The wire value the whole comparison hinges on, pinned explicitly so a
    // both-sides-broken regression (neither emits it) cannot pass silently.
    assertEquals(viaAsp.toApiParams({ key: PARITY_KEY }).asp, true);
    assertEquals(viaUnblocker.toApiParams({ key: PARITY_KEY }).asp, true);
});

Deno.test('parity: asp and unblocker emit byte-identical params (disabled)', () => {
    const viaAsp = scrapeConfigWith({ asp: false });
    const viaUnblocker = scrapeConfigWith({ unblocker: false });
    assertNotVacuous(scrapeParamEntries(viaAsp), 'loaded scrape params');
    assertEquals(scrapeParamEntries(viaUnblocker), scrapeParamEntries(viaAsp));
    // Off means the key is absent, under BOTH names.
    assertEquals(Object.keys(viaAsp.toApiParams({ key: PARITY_KEY })).includes('asp'), false);
    assertEquals(Object.keys(viaUnblocker.toApiParams({ key: PARITY_KEY })).includes('asp'), false);
});

Deno.test('parity: asp and unblocker leave identical stored state', () => {
    // Emitted params are one view of the config; the instance itself is
    // another. A second storage slot for the new name, or a key present under
    // one name and absent under the other, shows up here and nowhere else.
    for (const value of [true, false]) {
        const viaAsp = scrapeConfigWith({ asp: value });
        const viaUnblocker = scrapeConfigWith({ unblocker: value });
        assertEquals(Object.keys(viaUnblocker).sort(), Object.keys(viaAsp).sort());
        assertEquals(viaUnblocker, viaAsp);
        // `unblocker` is an accessor on the prototype, so it must never show up
        // as an own key — a serializer iterating own keys would otherwise ship
        // a duplicate of `asp`.
        assertEquals(Object.keys(viaUnblocker).includes('unblocker'), false);
    }
});

/**
 * The full truth table with BOTH names in play.
 *
 * Precedence: an explicitly supplied `asp` wins; `unblocker` is consulted only
 * when `asp` was not supplied. Never OR-ed — an explicit `false` on the winning
 * name turns the feature off even when the other name says true.
 *
 * `wireAsp` is the value expected under the `asp` key, `undefined` meaning the
 * key is absent from the emitted params entirely.
 *
 * CROSS-SDK NOTE on the two conflict rows. Python, TypeScript and Rust all
 * resolve `asp: false, unblocker: true` to OFF, as pinned here. GO ANSWERS ON
 * for that one row: its `ASP` field is a plain `bool`, so a supplied `false` is
 * byte-identical to the zero value and cannot be honoured. That divergence is
 * documented in go/unblocker.go and go/README.md, and the Go test row that pins
 * it is named GO_LANGUAGE_FORCED_EXCEPTION_documented_divergence_not_a_bug. It
 * is the ONLY cell where the four SDKs disagree; nothing here may be "fixed" to
 * match Go.
 */
const SCRAPE_TRUTH_TABLE: Array<{
    name: string;
    options: { asp?: boolean; unblocker?: boolean };
    resolved: boolean;
    wireAsp: true | undefined;
}> = [
    { name: 'neither supplied', options: {}, resolved: false, wireAsp: undefined },
    { name: 'unblocker only, true', options: { unblocker: true }, resolved: true, wireAsp: true },
    { name: 'unblocker only, false', options: { unblocker: false }, resolved: false, wireAsp: undefined },
    { name: 'asp only, true', options: { asp: true }, resolved: true, wireAsp: true },
    { name: 'asp only, false', options: { asp: false }, resolved: false, wireAsp: undefined },
    { name: 'both true (agree)', options: { asp: true, unblocker: true }, resolved: true, wireAsp: true },
    { name: 'both false (agree)', options: { asp: false, unblocker: false }, resolved: false, wireAsp: undefined },
    // Conflicts: the explicitly supplied `asp` decides, in both directions.
    {
        name: 'conflict asp=false unblocker=true -> asp wins, off',
        options: { asp: false, unblocker: true },
        resolved: false,
        wireAsp: undefined,
    },
    {
        name: 'conflict asp=true unblocker=false -> asp wins, on',
        options: { asp: true, unblocker: false },
        resolved: true,
        wireAsp: true,
    },
    // `??` tests "supplied", not truthiness: an explicit `undefined` for `asp`
    // is NOT a supplied value, so `unblocker` still decides. This is what makes
    // `{ ...opts, asp: opts.asp }` spread-forwarding safe for callers.
    {
        name: 'asp: undefined is not supplied, unblocker decides',
        options: { asp: undefined, unblocker: true },
        resolved: true,
        wireAsp: true,
    },
];

/**
 * Each truth-table row is driven against BOTH a bare config and the loaded
 * fixture. A defect that only fires when a conflicting name pair coexists with
 * other populated options — a validation branch, a mutually-exclusive-option
 * check, an ordering effect — is invisible against `{ url }` alone.
 */
const SCRAPE_TRUTH_TABLE_BASES: Array<{
    label: string;
    build: (options: { asp?: boolean; unblocker?: boolean }) => ScrapeConfig;
}> = [
    { label: 'minimal', build: (options) => new ScrapeConfig({ url: 'http://httpbin.dev/get', ...options }) },
    { label: 'loaded', build: (options) => scrapeConfigWith(options) },
];

for (const row of SCRAPE_TRUTH_TABLE) {
    for (const base of SCRAPE_TRUTH_TABLE_BASES) {
        Deno.test(`truth table (scrape, ${base.label}): ${row.name}`, () => {
            const config = base.build(row.options);
            // Resolved outcome, readable under either name — both must agree.
            assertEquals(config.asp, row.resolved);
            assertEquals(config.unblocker, row.resolved);

            const params = config.toApiParams({ key: PARITY_KEY });
            // Emitted wire key and value.
            assertEquals(params.asp, row.wireAsp);
            assertEquals(Object.keys(params).includes('asp'), row.wireAsp !== undefined);
            // The new name NEVER reaches the wire, whichever name went in.
            assertEquals(Object.keys(params).includes('unblocker'), false);
            if (base.label === 'loaded') {
                assertNotVacuous(scrapeParamEntries(config), 'loaded scrape params');
            }
        });
    }
}

Deno.test('truth table (scrape): every off row emits the same params', () => {
    // ScrapeConfig stores the toggle as a plain boolean defaulting to false, so
    // "not supplied", "supplied false" and "asp:false beats unblocker:true" are
    // indistinguishable on the wire by construction. Pinned here so the
    // collapse is a stated property rather than an accident, and so it is
    // visible that both names collapse the SAME way.
    const offRows = SCRAPE_TRUTH_TABLE.filter((row) => row.wireAsp === undefined);
    const baseline = scrapeParamEntries(new ScrapeConfig({ url: 'http://httpbin.dev/get' }));
    for (const row of offRows) {
        const entries = scrapeParamEntries(new ScrapeConfig({ url: 'http://httpbin.dev/get', ...row.options }));
        assertEquals(entries, baseline, `off row "${row.name}" diverged from the not-supplied baseline`);
    }
});

Deno.test('truth table (scrape): rows with the same outcome are indistinguishable', () => {
    // The off-row test above is half of the claim; this is both halves, over
    // the LOADED fixture. Every row that resolves the same way must produce the
    // same WHOLE output, whichever name (or pair of names) got the caller
    // there. Ported from the Rust matrix
    // (`unblocker_matrix_rows_with_the_same_outcome_are_indistinguishable`).
    for (const wireAsp of [true, undefined]) {
        const rows = SCRAPE_TRUTH_TABLE.filter((row) => row.wireAsp === wireAsp);
        assertEquals(rows.length >= 3, true, 'the grouping is only meaningful with several rows per outcome');
        const baseline = scrapeParamEntries(scrapeConfigWith(rows[0].options));
        assertNotVacuous(baseline, 'loaded scrape params');
        for (const row of rows.slice(1)) {
            assertEquals(
                scrapeParamEntries(scrapeConfigWith(row.options)),
                baseline,
                `row "${row.name}" diverged from "${rows[0].name}" although both resolve to wireAsp=${wireAsp}`,
            );
        }
    }
});

Deno.test('parity: validateOptions accepts each name on its own', () => {
    // The allow-list is Object.keys(this) plus ALIAS_OPTION_KEYS. `unblocker`
    // is an accessor so it is never an own key: without the alias list this
    // throws instead of silently ignoring the option.
    for (const options of [{ asp: true }, { unblocker: true }, { asp: false }, { unblocker: false }]) {
        const config = new ScrapeConfig({ url: 'http://httpbin.dev/get', ...options });
        assertEquals(typeof config.asp, 'boolean');
    }
    // Negative control: the allow-list really is enforced, so the two passes
    // above are evidence and not a no-op.
    assertThrows(
        () => new ScrapeConfig({ url: 'http://httpbin.dev/get', unblock: true } as any),
        ScrapeConfigError,
        'Invalid option provided: unblock',
    );
});

Deno.test('parity: post-construction mutation agrees in both directions', () => {
    // Setting one name and reading the other must agree BOTH ways, and each
    // mutation must reach the wire.
    const config = new ScrapeConfig({ url: 'http://httpbin.dev/get' });

    config.unblocker = true;
    assertEquals(config.asp, true);
    assertEquals(config.toApiParams({ key: PARITY_KEY }).asp, true);

    config.asp = false;
    assertEquals(config.unblocker, false);
    assertEquals(Object.keys(config.toApiParams({ key: PARITY_KEY })).includes('asp'), false);

    config.asp = true;
    assertEquals(config.unblocker, true);
    assertEquals(config.toApiParams({ key: PARITY_KEY }).asp, true);

    config.unblocker = false;
    assertEquals(config.asp, false);
    assertEquals(Object.keys(config.toApiParams({ key: PARITY_KEY })).includes('asp'), false);
});

Deno.test('parity: mutating either name converges on identical params', () => {
    // Same equivalence as at construction, but reached by assignment: two
    // configs built without the toggle, then switched on through different
    // names, must emit the same whole output.
    for (const value of [true, false]) {
        const mutatedAsp = scrapeConfigWith({});
        const mutatedUnblocker = scrapeConfigWith({});
        mutatedAsp.asp = value;
        mutatedUnblocker.unblocker = value;
        assertEquals(scrapeParamEntries(mutatedUnblocker), scrapeParamEntries(mutatedAsp));
        // ...and identical to having passed that name to the constructor.
        assertEquals(scrapeParamEntries(mutatedUnblocker), scrapeParamEntries(scrapeConfigWith({ asp: value })));
    }
});
