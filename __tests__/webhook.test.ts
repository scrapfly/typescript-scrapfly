import { describe, it } from 'https://deno.land/std@0.224.0/testing/bdd.ts';
import * as assert from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { Buffer } from 'node:buffer';
import crypto from 'node:crypto';
import zlib from 'node:zlib';
import { createServer, ResourceType, verifySignature } from '../src/webhookserver.ts';

const SECRET = 'probe-signing-secret';

const sign = (body: Buffer) =>
  crypto.createHmac('sha256', Buffer.from(SECRET, 'utf8')).update(body).digest('hex').toUpperCase();

/**
 * A JSON body. NOT byte-identical to what Scrapfly puts on the wire, which uses
 * spaced separators — irrelevant here because the same buffer is both signed and
 * posted, which is exactly the property under test.
 */
const wire = (data: unknown) => Buffer.from(JSON.stringify(data), 'utf8');

/**
 * Hardcoded on purpose: reading the SDK's own enum would make this agree with
 * whatever drift it is meant to catch.
 */
const EMITTED_RESOURCE_TYPES = ['scrape', 'ping', 'crawl', 'extraction', 'screenshot', 'alert'];

/** express is an optional peer dependency and is not resolvable under `deno test`. */
const hasExpress = await (async () => {
  try {
    await import('express');
    return true;
  } catch {
    return false;
  }
})();

describe('verifySignature', () => {
  const body = wire({ result: { content: 'legit' } });

  it('accepts the uppercase digest Scrapfly sends', () => {
    assert.assertEquals(verifySignature(body, sign(body), SECRET), true);
  });

  it('accepts the lowercase digest from the -Lowercase header', () => {
    assert.assertEquals(verifySignature(body, sign(body).toLowerCase(), SECRET), true);
  });

  it('rejects an absent header instead of throwing', () => {
    assert.assertEquals(verifySignature(body, undefined, SECRET), false);
  });

  it('rejects a digest of the wrong length without throwing', () => {
    assert.assertEquals(verifySignature(body, 'DEAD', SECRET), false);
  });

  it('refuses an empty secret rather than verifying against nothing', () => {
    // '' is a usable HMAC key, so `process.env.SECRET ?? ''` would leave a digest
    // the attacker can compute.
    assert.assertThrows(() => verifySignature(body, sign(body), ''));
    assert.assertThrows(() => verifySignature(body, sign(body), []));
  });

  it('rejects a body that was tampered with', () => {
    assert.assertEquals(verifySignature(wire({ result: { content: 'forged' } }), sign(body), SECRET), false);
  });

  it('accepts any secret in the rotation set', () => {
    assert.assertEquals(verifySignature(body, sign(body), ['other-secret', SECRET]), true);
  });
});

describe('ResourceType', () => {
  it('mirrors the resource types Scrapfly sends', () => {
    assert.assertEquals(Object.values(ResourceType), EMITTED_RESOURCE_TYPES);
  });
});

describe('createServer', () => {
  it('refuses to start without a signing secret', async () => {
    await assert.assertRejects(() => createServer('', () => {}));
    await assert.assertRejects(() => createServer([], () => {}));
  });
});

describe('createServer routing', { ignore: !hasExpress }, () => {
  let delivered = 0;
  let port = 0;
  let server: any;

  const start = async () => {
    const app = await createServer(SECRET, () => {
      delivered += 1;
    }, undefined, 1024);
    server = app.listen(0);
    await new Promise((resolve) => server.once('listening', resolve));
    port = server.address().port;
  };

  const post = async (
    body: Buffer,
    {
      resourceType = 'scrape',
      signature = 'auto' as string | null,
      contentEncoding = undefined as string | undefined,
    } = {},
  ): Promise<[number, boolean]> => {
    if (!server) await start();

    const headers: Record<string, string> = {
      'content-type': 'application/json',
      'x-scrapfly-webhook-resource-type': resourceType,
    };
    if (signature === 'auto') headers['x-scrapfly-webhook-signature'] = sign(body);
    else if (signature !== null) headers['x-scrapfly-webhook-signature'] = signature;
    if (contentEncoding) headers['content-encoding'] = contentEncoding;

    const before = delivered;
    // fetch takes a BodyInit, and lib "dom" does not count node:buffer as one.
    const response = await fetch(`http://127.0.0.1:${port}/webhook`, { method: 'POST', headers, body: new Uint8Array(body) });
    await response.text();

    return [response.status, delivered > before];
  };

  const forged = wire({ result: { content: 'FORGED BY THE PROBE' } });
  const legit = wire({ result: { content: 'legit' } });

  it('rejects a body with no signature', async () => {
    assert.assertEquals(await post(forged, { signature: null }), [401, false]);
  });

  it('rejects a body with a wrong signature', async () => {
    assert.assertEquals(await post(forged, { signature: 'DEAD' }), [401, false]);
  });

  it('delivers a correctly signed body', async () => {
    assert.assertEquals(await post(legit), [200, true]);
  });

  it('answers the unsigned pre-creation ping without delivering it', async () => {
    assert.assertEquals(await post(wire({ ping: 'OK' }), { resourceType: 'ping', signature: null }), [200, false]);
  });

  it('does not let the ping carve-out smuggle a payload', async () => {
    assert.assertEquals(await post(forged, { resourceType: 'ping', signature: null }), [200, false]);
  });

  it('delivers a signed ping', async () => {
    assert.assertEquals(await post(wire({ ping: 'OK' }), { resourceType: 'ping' }), [200, true]);
  });

  it('routes every resource type Scrapfly sends', async () => {
    for (const resourceType of EMITTED_RESOURCE_TYPES) {
      const [status] = await post(legit, { resourceType });
      assert.assertNotEquals(status, 400);
    }
  });

  it('rejects an unknown resource type', async () => {
    assert.assertEquals(await post(legit, { resourceType: 'bogus' }), [400, false]);
  });


  it('answers 413 for a body past the cap', async () => {
    if (!server) await start();

    const response = await fetch(`http://127.0.0.1:${port}/webhook`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-scrapfly-webhook-resource-type': 'scrape' },
      body: new Uint8Array(Buffer.alloc(2048)),
    });
    await response.text();

    assert.assertEquals(response.status, 413);
  });

  it('accepts the lowercase signature header', async () => {
    if (!server) await start();

    const before = delivered;
    const response = await fetch(`http://127.0.0.1:${port}/webhook`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-scrapfly-webhook-resource-type': 'scrape',
        'x-scrapfly-webhook-signature-lowercase': sign(legit).toLowerCase(),
      },
      body: new Uint8Array(legit),
    });
    await response.text();

    assert.assertEquals([response.status, delivered > before], [200, true]);
  });

  it('returns 500 when an async callback rejects, instead of an unhandled rejection', async () => {
    const app = await createServer(SECRET, async () => {
      throw new Error('db is down');
    });
    const asyncServer = app.listen(0);
    await new Promise((resolve) => asyncServer.once('listening', resolve));
    const asyncPort = asyncServer.address().port;

    const response = await fetch(`http://127.0.0.1:${asyncPort}/webhook`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-scrapfly-webhook-resource-type': 'scrape',
        'x-scrapfly-webhook-signature': sign(legit),
      },
      body: new Uint8Array(legit),
    });
    await response.text();
    asyncServer.close();

    assert.assertEquals(response.status, 500);
  });

  it('fails loudly when another body parser already drained the stream', async () => {
    // express.json() mounted on a caller-supplied app leaves an ended stream, which
    // would otherwise park the request until the socket times out.
    const expressModule: any = await import('express');
    const express = expressModule.default || expressModule;
    const userApp = express();
    userApp.use(express.json());

    const app = await createServer(SECRET, () => {}, userApp);
    const parsedServer = app.listen(0);
    await new Promise((resolve) => parsedServer.once('listening', resolve));
    const parsedPort = parsedServer.address().port;

    const response = await fetch(`http://127.0.0.1:${parsedPort}/webhook`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-scrapfly-webhook-resource-type': 'scrape',
        'x-scrapfly-webhook-signature': sign(legit),
      },
      body: new Uint8Array(legit),
      signal: AbortSignal.timeout(5000),
    });
    await response.text();
    parsedServer.close();

    assert.assertEquals(response.status, 400);
  });


  it('verifies an alert over timestamp and body, not the body alone', async () => {
    if (!server) await start();

    const timestamp = String(Math.floor(Date.now() / 1000));
    const alertBody = wire({ event_id: 'evt-1', alert: { name: 'credit-low' } });
    const overBodyOnly = sign(alertBody);
    const overTimestampAndBody = sign(Buffer.concat([Buffer.from(`${timestamp}.`), alertBody]));

    const send = async (signature: string, ts: string | null) => {
      const headers: Record<string, string> = {
        'content-type': 'application/json',
        'x-scrapfly-webhook-resource-type': 'alert',
        'x-scrapfly-webhook-signature': signature,
      };
      if (ts !== null) headers['x-scrapfly-webhook-timestamp'] = ts;

      const before = delivered;
      const response = await fetch(`http://127.0.0.1:${port}/webhook`, {
        method: 'POST',
        headers,
        body: new Uint8Array(alertBody),
      });
      await response.text();

      return [response.status, delivered > before];
    };

    assert.assertEquals(await send(overTimestampAndBody, timestamp), [200, true]);
    assert.assertEquals(await send(overBodyOnly, timestamp), [401, false]);
    assert.assertEquals(await send(overTimestampAndBody, null), [401, false]);
    assert.assertEquals(await send(overTimestampAndBody, '0'), [401, false]);
  });

  it('verifies a compressed body against its decompressed bytes', async () => {
    // Signing happens before Content-Encoding, so the digest covers the inflated
    // body, never the gzip frame.
    if (!server) await start();

    const before = delivered;
    const response = await fetch(`http://127.0.0.1:${port}/webhook`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'content-encoding': 'gzip',
        'x-scrapfly-webhook-resource-type': 'scrape',
        'x-scrapfly-webhook-signature': sign(legit),
      },
      body: new Uint8Array(zlib.gzipSync(legit)),
    });
    await response.text();

    assert.assertEquals([response.status, delivered > before], [200, true]);
    server.close();
    server = null;
  });
});
