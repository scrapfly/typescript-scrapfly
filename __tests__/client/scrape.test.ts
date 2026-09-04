import * as errors from '../../src/errors.ts';
import { ScrapflyClient } from '../../src/client.ts';
import { ScrapeConfig } from '../../src/scrapeconfig.ts';
import { log } from '../../src/logger.ts';
import { assertEquals, assertRejects } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { resultFactory, responseFactory } from '../utils.ts';
import type { RequestOptions } from '../../src/utils.ts';
import { stub } from "https://deno.land/std/testing/mock.ts";

log.setLevel('DEBUG');

Deno.test('scrape: GET success', async () => {
    const KEY = '__API_KEY__';
    const client = new ScrapflyClient({ key: KEY });

    const fetchStub = stub(client, 'fetch', async (config: RequestOptions): Promise<Response> => {
        const configUrl = new URL(config.url);
        assertEquals(configUrl.origin + configUrl.pathname, client.HOST + '/scrape');
        assertEquals(config.method, 'GET');
        assertEquals(configUrl.searchParams.get('key'), KEY);
        assertEquals(configUrl.searchParams.get('url'), 'https://httpbin.dev/json');
        assertEquals(Array.from((configUrl.searchParams as any).keys()), ['key', 'url']);
        const result = resultFactory({
            url: 'https://httpbin.dev/json',
        });
        return responseFactory(result.data, {
            status: 200,
            headers: {
                'Content-Type': 'application/json',
            },
        });
    });

    const result = await client.scrape(new ScrapeConfig({ url: 'https://httpbin.dev/json' }));
    assertEquals(result !== undefined, true);

    assertEquals(fetchStub.calls.length, 1);

    fetchStub.restore();
});

Deno.test('scrape errors: raises ApiHttpServerError on 500 and success', async () => {
    const KEY = '__API_KEY__';
    const client = new ScrapflyClient({ key: KEY });

    const fetchStub = stub(client, 'fetch', async (config: RequestOptions): Promise<Response> => {
        const result = resultFactory({
            url: 'https://httpbin.dev/json',
            status_code: 500,
            status: 'ERROR',
            success: true,
            error: 'failed to connect to upstream server',
        });
        return responseFactory(result.data, {
            status: 200,
            headers: {
                'Content-Type': 'application/json',
            },
        });
    });
    await assertRejects(
        async () => {
            await client.scrape(new ScrapeConfig({ url: 'https://httpbin.dev/json' }));
        },
        errors.ApiHttpServerError,
    );

    fetchStub.restore();
});

Deno.test('scrape errors: raises BadApiKeyError on 401', async () => {
    const KEY = '__API_KEY__';
    const client = new ScrapflyClient({ key: KEY });

    const fetchStub = stub(client, 'fetch', async (config: RequestOptions): Promise<Response> => {
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
    await assertRejects(
        async () => {
            await client.scrape(new ScrapeConfig({ url: 'https://httpbin.dev/json' }));
        },
        errors.BadApiKeyError,
    );

    fetchStub.restore();
});

Deno.test('scrape errors: raises TooManyRequests on 429 and success', async () => {
    const KEY = '__API_KEY__';
    const client = new ScrapflyClient({ key: KEY });

    const fetchStub = stub(client, 'fetch', async (config: RequestOptions): Promise<Response> => {
        const result = resultFactory({
            url: 'https://httpbin.dev/json',
            status_code: 429,
            status: 'ERROR',
            success: true,
        });
        return responseFactory(result.data, {
            status: 200,
            headers: {
                'Content-Type': 'application/json',
            },
        });
    });
    await assertRejects(
        async () => {
            await client.scrape(new ScrapeConfig({ url: 'https://httpbin.dev/json' }));
        },
        errors.TooManyRequests,
    );

    fetchStub.restore();
});

Deno.test('scrape errors: raises ScrapflyScrapeError on ::SCRAPE:: resource and success', async () => {
    const KEY = '__API_KEY__';
    const client = new ScrapflyClient({ key: KEY });

    const fetchStub = stub(client, 'fetch', async (config: RequestOptions): Promise<Response> => {
        const result = resultFactory({
            url: config.url,
            status: 'ERR::SCRAPE::BAD_PROTOCOL',
            success: true,
        });
        return responseFactory(result.data, {
            status: 200,
            headers: {
                'Content-Type': 'application/json',
            },
        });
    });
    await assertRejects(
        async () => {
            await client.scrape(new ScrapeConfig({ url: 'https://httpbin.dev/json' }));
        },
        errors.ScrapflyScrapeError,
    );

    fetchStub.restore();
});

Deno.test('scrape errors: raises ScrapflyWebhookError on ::WEBHOOK:: resource and success', async () => {
    const KEY = '__API_KEY__';
    const client = new ScrapflyClient({ key: KEY });

    const fetchStub = stub(client, 'fetch', async (config: RequestOptions): Promise<Response> => {
        const result = resultFactory({
            url: config.url,
            status: 'ERR::WEBHOOK::DISABLED ',
            success: true,
        });
        return responseFactory(result.data, {
            status: 200,
            headers: {
                'Content-Type': 'application/json',
            },
        });
    });
    await assertRejects(
        async () => {
            await client.scrape(new ScrapeConfig({ url: 'https://httpbin.dev/json' }));
        },
        errors.ScrapflyWebhookError,
    );

    fetchStub.restore();
});

Deno.test('scrape errors: raises ScrapflyProxyError on ERR::PROXY::POOL_NOT_FOUND resource and success', async () => {
    const KEY = '__API_KEY__';
    const client = new ScrapflyClient({ key: KEY });

    const fetchStub = stub(client, 'fetch', async (config: RequestOptions): Promise<Response> => {
        const result = resultFactory({
            url: config.url,
            status: 'ERR::PROXY::POOL_NOT_FOUND ',
            success: true,
        });
        return responseFactory(result.data, {
            status: 200,
            headers: {
                'Content-Type': 'application/json',
            },
        });
    });
    await assertRejects(
        async () => {
            await client.scrape(new ScrapeConfig({ url: 'https://httpbin.dev/json' }));
        },
        errors.ScrapflyProxyError,
    );

    fetchStub.restore();
});

Deno.test('scrape errors: raises ScrapflyScheduleError on ERR::SCHEDULE::DISABLED resource and success', async () => {
    const KEY = '__API_KEY__';
    const client = new ScrapflyClient({ key: KEY });

    const fetchStub = stub(client, 'fetch', async (config: RequestOptions): Promise<Response> => {
        const result = resultFactory({
            url: config.url,
            status: 'ERR::SCHEDULE::DISABLED',
            success: true,
        });
        return responseFactory(result.data, {
            status: 200,
            headers: {
                'Content-Type': 'application/json',
            },
        });
    });
    await assertRejects(
        async () => {
            await client.scrape(new ScrapeConfig({ url: 'https://httpbin.dev/json' }));
        },
        errors.ScrapflyScheduleError,
    );

    fetchStub.restore();
});

Deno.test('scrape errors: raises ScrapflyAspError on ERR::ASP::SHIELD_ERROR resource and success', async () => {
    const KEY = '__API_KEY__';
    const client = new ScrapflyClient({ key: KEY });

    const fetchStub = stub(client, 'fetch', async (config: RequestOptions): Promise<Response> => {
        const result = resultFactory({
            url: config.url,
            status: 'ERR::ASP::SHIELD_ERROR',
            success: true,
        });
        return responseFactory(result.data, {
            status: 200,
            headers: {
                'Content-Type': 'application/json',
            },
        });
    });
    await assertRejects(
        async () => {
            await client.scrape(new ScrapeConfig({ url: 'https://httpbin.dev/json' }));
        },
        errors.ScrapflyAspError,
    );

    fetchStub.restore();
});

// The anti-bot bypass is called `unblocker` now, but the error class is frozen
// under its old name: customer code catches ScrapflyAspError by name, and the
// class is still selected by the literal `ASP` segment of ERR::ASP::*. The new
// name is an alias of the same class, never a replacement.
Deno.test('scrape errors: ScrapflyUnblockerError is an alias of ScrapflyAspError', async () => {
    assertEquals(errors.ScrapflyUnblockerError, errors.ScrapflyAspError);

    const KEY = '__API_KEY__';
    const client = new ScrapflyClient({ key: KEY });

    const fetchStub = stub(client, 'fetch', async (config: RequestOptions): Promise<Response> => {
        const result = resultFactory({
            url: config.url,
            status: 'ERR::ASP::SHIELD_ERROR',
            success: true,
        });
        return responseFactory(result.data, {
            status: 200,
            headers: {
                'Content-Type': 'application/json',
            },
        });
    });

    // One thrown error, catchable through either name.
    let caught: unknown = null;
    try {
        await client.scrape(new ScrapeConfig({ url: 'https://httpbin.dev/json', unblocker: true }));
    } catch (e) {
        caught = e;
    }
    assertEquals(caught instanceof errors.ScrapflyUnblockerError, true);
    assertEquals(caught instanceof errors.ScrapflyAspError, true);

    fetchStub.restore();
});

Deno.test('scrape errors: raises ScrapflySessionError on ERR::SESSION::CONCURRENT_ACCESS resource and success', async () => {
    const KEY = '__API_KEY__';
    const client = new ScrapflyClient({ key: KEY });

    const fetchStub = stub(client, 'fetch', async (config: RequestOptions): Promise<Response> => {
        const result = resultFactory({
            url: config.url,
            status: 'ERR::SESSION::CONCURRENT_ACCESS',
            success: true,
        });
        return responseFactory(result.data, {
            status: 200,
            headers: {
                'Content-Type': 'application/json',
            },
        });
    });
    await assertRejects(
        async () => {
            await client.scrape(new ScrapeConfig({ url: 'https://httpbin.dev/json' }));
        },
        errors.ScrapflySessionError,
    );

    fetchStub.restore();
});

Deno.test('scrape errors: raises ApiHttpClientError on success and unknown status', async () => {
    const KEY = '__API_KEY__';
    const client = new ScrapflyClient({ key: KEY });

    const fetchStub = stub(client, 'fetch', async (config: RequestOptions): Promise<Response> => {
        const result = resultFactory({
            url: config.url,
            status: 'ERR::NEW',
            success: true,
        });
        return responseFactory(result.data, {
            status: 200,
            headers: {
                'Content-Type': 'application/json',
            },
        });
    });
    await assertRejects(
        async () => {
            await client.scrape(new ScrapeConfig({ url: 'https://httpbin.dev/json' }));
        },
        errors.ApiHttpClientError,
    );

    fetchStub.restore();
});

Deno.test('scrape errors: raises UpstreamHttpServerError on failure, ERR::SCRAPE::BAD_UPSTREAM_RESPONSE and >=500', async () => {
    const KEY = '__API_KEY__';
    const client = new ScrapflyClient({ key: KEY });

    const fetchStub = stub(client, 'fetch', async (config: RequestOptions): Promise<Response> => {
        const result = resultFactory({
            url: config.url,
            success: false,
            status_code: 500,
            status: 'ERR::SCRAPE::BAD_UPSTREAM_RESPONSE',
        });
        return responseFactory(result.data, {
            status: 200,
            headers: {
                'Content-Type': 'application/json',
            },
        });
    });

    await assertRejects(
        async () => {
            await client.scrape(new ScrapeConfig({ url: 'https://httpbin.dev/json' }));
        },
        errors.UpstreamHttpServerError,
    );

    fetchStub.restore();
});

Deno.test('scrape errors: raises UpstreamHttpClientError on failure, ERR::SCRAPE::BAD_UPSTREAM_RESPONSE and 4xx status', async () => {
    const KEY = '__API_KEY__';
    const client = new ScrapflyClient({ key: KEY });

    const fetchStub = stub(client, 'fetch', async (config: RequestOptions): Promise<Response> => {
        const result = resultFactory({
            url: config.url,
            success: false,
            status_code: 404,
            status: 'ERR::SCRAPE::BAD_UPSTREAM_RESPONSE',
        });
        return responseFactory(result.data, {
            status: 200,
            headers: {
                'Content-Type': 'application/json',
            },
        });
    });

    await assertRejects(
        async () => {
            await client.scrape(new ScrapeConfig({ url: 'https://httpbin.dev/json' }));
        },
        errors.UpstreamHttpClientError,
    );

    fetchStub.restore();
});

Deno.test('scrape errors: raises resource exceptions on failure', async () => {
    const KEY = '__API_KEY__';
    const client = new ScrapflyClient({ key: KEY });

    const resourceErrMap = {
        SCRAPE: errors.ScrapflyScrapeError,
        WEBHOOK: errors.ScrapflyWebhookError,
        PROXY: errors.ScrapflyProxyError,
        SCHEDULE: errors.ScrapflyScheduleError,
        ASP: errors.ScrapflyAspError,
        SESSION: errors.ScrapflySessionError,
    };

    for (const [resource, err] of Object.entries(resourceErrMap)) {
        const fetchStub = stub(client, 'fetch', async (config: RequestOptions): Promise<Response> => {
            const result = resultFactory({
                url: config.url,
                success: false,
                status: `ERR::${resource}::MISSING`,
            });
            return responseFactory(result.data, {
                status: 200,
                headers: {
                    'Content-Type': 'application/json',
                },
            });
        });

        await assertRejects(
            async () => {
                await client.scrape(new ScrapeConfig({ url: 'https://httpbin.dev/json' }));
            },
            err,
        );

        fetchStub.restore();
    }
});

Deno.test('scrape errors: raises ScrapflyError on unhandled failure', async () => {
    const KEY = '__API_KEY__';
    const client = new ScrapflyClient({ key: KEY });

    const fetchStub = stub(client, 'fetch', async (config: RequestOptions): Promise<Response> => {
        const result = resultFactory({
            url: config.url,
            success: false,
            status_code: 404,
            status: 'ERR',
        });
        return responseFactory(result.data, {
            status: 200,
            headers: {
                'Content-Type': 'application/json',
            },
        });
    });

    await assertRejects(
        async () => {
            await client.scrape(new ScrapeConfig({ url: 'https://httpbin.dev/json' }));
        },
        errors.ScrapflyError,
    );

    fetchStub.restore();
});

Deno.test('scrape errors: account retrieval status unhandled code (e.g. 404)', async () => {
    const KEY = '__API_KEY__';
    const client = new ScrapflyClient({ key: KEY });

    const fetchStub = stub(client, 'fetch', async (config: RequestOptions): Promise<Response> => {
        return responseFactory(
            {},
            {
                status: 404,
            },
        );
    });

    await assertRejects(
        async () => {
            await client.account();
        },
        errors.HttpError,
    );

    fetchStub.restore();
});

Deno.test('scrape errors: account retrieval bad api key (status 401)', async () => {
    const KEY = '__API_KEY__';
    const client = new ScrapflyClient({ key: KEY });

    const fetchStub = stub(client, 'fetch', async (config: RequestOptions): Promise<Response> => {
        return responseFactory(
            {},
            {
                status: 401,
            },
        );
    });

    await assertRejects(
        async () => {
            await client.account();
        },
        errors.BadApiKeyError,
    );

    fetchStub.restore();
});

Deno.test('concurrent scrape: success with explicit concurrency', async () => {
    const KEY = '__API_KEY__';
    const client = new ScrapflyClient({ key: KEY });

    const configs = [
        ...new Array(5).fill(null).map(() => new ScrapeConfig({ url: 'https://httpbin.dev/status/200' })),
        ...new Array(5).fill(null).map(() => new ScrapeConfig({ url: 'https://httpbin.dev/status/400' })),
    ];
    const results = [];
    const errors = [];

    const fetchStub = stub(client, 'fetch', async (config: RequestOptions): Promise<Response> => {
        await new Promise((resolve) => setTimeout(resolve, 100));  // XXX: NEEDS a delay!
        log.error(config.url);
        if (config.url.includes('200')) {
            const result = resultFactory({
                url: config.url,
                status: 'DONE',
                success: true,
                status_code: 200,
            });
            return responseFactory(result.data, {
                status: 200,
                headers: {
                    'Content-Type': 'application/json',
                },
            });
        } else {
            const result = resultFactory({
                url: config.url,
                status: 'ERR::ASP::SHIELD_ERROR',
                success: true,
            });
            return responseFactory(result.data, {
                status: 200,
                headers: {
                    'Content-Type': 'application/json',
                },
            });
        }
    });


    for await (const resultOrError of client.concurrentScrape(configs, 5)) {
        if (resultOrError instanceof Error) {
            errors.push(resultOrError);
        } else {
            results.push(resultOrError);
        }
    }


    assertEquals(errors.length, 5, "expected 5 errors");
    assertEquals(results.length, 5, "expected 5 successes");
    assertEquals(fetchStub.calls.length, 10, "expected 10 fetch calls");
    assertEquals(configs.length, 10, "expected 10 configs to be setup");
    // assertEquals(results.length, 5, "expected 5 successful results");
    // assertEquals(errors.length, 5, "expected 5 error results");

    fetchStub.restore();
});
// ===========================================================================
// CLIENT-LAYER WIRE KEY
//
// Every other unblocker/asp assertion in this repo stops at the config
// serializer. Nothing pinned that the key survives the CLIENT: a param
// whitelist, a rename shim, or a re-serialization between `toApiParams()` and
// the outgoing request would leave the whole parity matrix green while the wire
// lost the flag. These capture what the client actually puts in the URL.
// ===========================================================================

/** Captured outgoing search params for one scrape, without any network. */
async function captureScrapeSearchParams(config: ScrapeConfig): Promise<URLSearchParams> {
    const client = new ScrapflyClient({ key: '__API_KEY__' });
    let captured: URLSearchParams | undefined;

    const fetchStub = stub(client, 'fetch', async (options: RequestOptions): Promise<Response> => {
        captured = new URL(options.url).searchParams;
        const result = resultFactory({ url: 'https://httpbin.dev/json' });
        return responseFactory(result.data, { status: 200, headers: { 'Content-Type': 'application/json' } });
    });

    try {
        await client.scrape(config);
    } finally {
        fetchStub.restore();
    }

    if (captured === undefined) {
        throw new Error('the client never issued a request');
    }
    return captured;
}

Deno.test('scrape client: unblocker reaches the wire as asp, never as unblocker', async () => {
    for (const name of ['asp', 'unblocker'] as const) {
        const params = await captureScrapeSearchParams(
            new ScrapeConfig({ url: 'https://httpbin.dev/json', [name]: true }),
        );
        assertEquals(params.get('asp'), 'true', `built with ${name}: asp missing from the request URL`);
        assertEquals(params.has('unblocker'), false, `built with ${name}: the new name reached the wire`);
    }
});

Deno.test('scrape client: the off toggle omits the key under either name', async () => {
    for (const name of ['asp', 'unblocker'] as const) {
        const params = await captureScrapeSearchParams(
            new ScrapeConfig({ url: 'https://httpbin.dev/json', [name]: false }),
        );
        assertEquals(params.has('asp'), false, `built with ${name}: asp emitted while the feature is off`);
        assertEquals(params.has('unblocker'), false);
    }
});

Deno.test('scrape client: the whole request URL is identical under both names', async () => {
    // Whole query string, not just the one key — the same guarantee the config
    // matrix makes, re-made one layer up.
    const viaAsp = await captureScrapeSearchParams(
        new ScrapeConfig({ url: 'https://httpbin.dev/json', asp: true, render_js: true, country: 'us', cache: true }),
    );
    const viaUnblocker = await captureScrapeSearchParams(
        new ScrapeConfig({
            url: 'https://httpbin.dev/json',
            unblocker: true,
            render_js: true,
            country: 'us',
            cache: true,
        }),
    );
    const sorted = (p: URLSearchParams): Array<[string, string]> => {
        const entries: Array<[string, string]> = [];
        p.forEach((value, key) => entries.push([key, value]));
        return entries.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    };
    assertEquals(sorted(viaUnblocker), sorted(viaAsp));
    assertEquals(viaAsp.get('asp'), 'true');
});
