import * as errors from '../../src/errors.ts';
import { ScrapflyClient } from '../../src/client.ts';
import { assertEquals, assertThrows } from "https://deno.land/std@0.224.0/assert/mod.ts";

Deno.test('client init: success', () => {
    const client = new ScrapflyClient({ key: '1234' });
    assertEquals(!!client, true, "client should be defined");
});

Deno.test('client init: invalid key', () => {
    assertThrows(
        () => {
            new ScrapflyClient({ key: "" });
        },
        errors.BadApiKeyError,
        "Invalid key. Key must be a non-empty string"
    );
});