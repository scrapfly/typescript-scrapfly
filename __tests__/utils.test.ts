import { urlsafe_b64encode, fetchRetry } from '../src/utils.ts';
import { assertEquals, assertRejects } from "jsr:@std/assert";
import { stub } from "https://deno.land/std@0.224.0/testing/mock.ts";

Deno.test("urlsafe_b64encode should encode a string to base64", () => {
  assertEquals(urlsafe_b64encode('hello+foo/bar====='), 'aGVsbG8rZm9vL2Jhcj09PT09');
});

Deno.test("urlsafe_b64encode multiple + characters should be encoded correctly", () => {
  const inp = 'const is_greater_than_1 = 45 >= 5 ? true : false\nconst is_greater_than_2 = 6435 >= 5 ? true : false';
  const expected = 'Y29uc3QgaXNfZ3JlYXRlcl90aGFuXzEgPSA0NSA-PSA1ID8gdHJ1ZSA6IGZhbHNlCmNvbnN0IGlzX2dyZWF0ZXJfdGhhbl8yID0gNjQzNSA-PSA1ID8gdHJ1ZSA6IGZhbHNl';
  assertEquals(urlsafe_b64encode(inp), expected);
});

Deno.test("urlsafe_b64encode multiple / characters should be encoded correctly as _", () => {
  const inp = 'const has_env1 = window.env1 ? true : false;\nconst has_env2 = window.env2 ? true : false;';
  const expected = 'Y29uc3QgaGFzX2VudjEgPSB3aW5kb3cuZW52MSA_IHRydWUgOiBmYWxzZTsKY29uc3QgaGFzX2VudjIgPSB3aW5kb3cuZW52MiA_IHRydWUgOiBmYWxzZTs';
  assertEquals(urlsafe_b64encode(inp), expected);
});

Deno.test('fetchRetry: succeeds on first attempt', async () => {
  const fetchStub = stub(globalThis, 'fetch', async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    return new Response('Success', { status: 200 });
  });

  const request = new Request('https://example.com');
  const response = await fetchRetry(request);

  assertEquals(await response.text(), 'Success');
  assertEquals(response.status, 200);

  fetchStub.restore();
});

Deno.test('fetchRetry: retries on 500 and succeeds', async () => {
  let callCount = 0;
  const fetchStub = stub(globalThis, 'fetch', async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    callCount++;
    if (callCount < 2) {
      return new Response('Internal Server Error', { status: 500 });
    } else {
      return new Response('Success', { status: 200 });
    }
  });

  const request = new Request('https://example.com');
  const response = await fetchRetry(request);

  assertEquals(await response.text(), 'Success');
  assertEquals(response.status, 200);
  assertEquals(callCount, 2);

  fetchStub.restore();
});

Deno.test('fetchRetry: does not retry 4xx', async () => {
  let callCount = 0;
  const fetchStub = stub(globalThis, 'fetch', async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    callCount++;
    return new Response('bad request', { status: 422 });
  });

  const request = new Request('https://example.com');
  const response = await fetchRetry(request);

  assertEquals(await response.text(), 'bad request');
  assertEquals(response.status, 422);
  assertEquals(callCount, 1);

  fetchStub.restore();
});

Deno.test('fetchRetry: fails after max retries', async () => {
  let callCount = 0;
  const fetchStub = stub(globalThis, 'fetch', async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    callCount++;
    return new Response('Internal Server Error', { status: 500 });
  });

  const request = new Request('https://example.com');

  await assertRejects(
    async () => {
      await fetchRetry(request, 3);
    },
    Error,
    'Fetch failed with status: 500'
  );
  
  assertEquals(callCount, 3);

  fetchStub.restore();
});

// XXX: should we support built-in timeout?
/* 
Deno.test('fetchRetry: fails due to timeout', async () => {

  const request = new Request('https://httpbin.dev/delay/3');

  await assertRejects(
    async () => {
      await fetchRetry(request, {}, 3, 100, 1000); // Set a short timeout for the test
    },
    Error,
    'The signal has been aborted'
  );
}); */