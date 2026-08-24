import { Buffer } from 'node:buffer';
import crypto from 'node:crypto';
import zlib from 'node:zlib';
import { log } from './logger.ts';

/**
 * Values Scrapfly sends in the `X-Scrapfly-Webhook-Resource-Type` header.
 *
 * ALERT is signed over `<timestamp>.<body>` rather than over the body, and so
 * is verified through a separate path.
 */
export enum ResourceType {
  SCRAPE = 'scrape',
  PING = 'ping',
  CRAWL = 'crawl',
  EXTRACTION = 'extraction',
  SCREENSHOT = 'screenshot',
  ALERT = 'alert',
}

/** Replay window for alert webhooks, applied either side of now to tolerate clock skew. */
const ALERT_TIMESTAMP_TOLERANCE_SECONDS = 300;

/**
 * Rebuild the `<timestamp>.<body>` message an alert webhook is signed over, or
 * return null when the timestamp is absent, unparseable, or outside the replay
 * window.
 */
function alertSignedMessage(
  timestamp: string | undefined,
  body: Buffer,
  tolerance: number = ALERT_TIMESTAMP_TOLERANCE_SECONDS,
): Buffer | null {
  if (!timestamp || !/^\d+$/.test(timestamp)) {
    return null;
  }

  if (Math.abs(Date.now() / 1000 - Number(timestamp)) > tolerance) {
    return null;
  }

  return Buffer.concat([Buffer.from(`${timestamp}.`, 'utf8'), body]);
}

const RESOURCE_TYPES: string[] = Object.values(ResourceType);

/**
 * The signature covers the decompressed bytes, so decompression runs before the
 * request is authenticated and needs its own ceiling.
 */
const MAX_BODY_BYTES = 256 * 1024 * 1024;

/**
 * Verify that a webhook request was sent by Scrapfly by comparing the
 * HMAC-SHA256 signature on the request body against the configured
 * signing secret.
 *
 * @param body Body as Scrapfly signed it: decompressed, but not JSON-parsed.
 *             Signing happens before `Content-Encoding` is applied, so a
 *             compressed request must be inflated first.
 * @param signature Value of the `X-Scrapfly-Webhook-Signature` header
 *                  (uppercase hex digest). The `-Lowercase` header carries
 *                  the same digest and is accepted too.
 * @param signingSecret Webhook signing secret, passed as-is (UTF-8 string; not
 *                      hex-encoded). Pass an array to accept any of several
 *                      secrets, for key rotation.
 * @returns `true` if the signature matches.
 */
export function verifySignature(
  body: Buffer,
  signature: string | undefined | null,
  signingSecret: string | string[],
): boolean {
  const secrets = (Array.isArray(signingSecret) ? signingSecret : [signingSecret]).filter(Boolean);

  // An empty key is a usable HMAC key: verifying against one accepts a digest
  // anybody can compute.
  if (secrets.length === 0) {
    throw new Error('verifySignature requires a non-empty signing secret');
  }

  if (!signature) {
    return false;
  }

  const received = Buffer.from(signature.trim().toUpperCase(), 'utf8');

  return secrets.some((secret) => {
    const hmac = crypto.createHmac('sha256', Buffer.from(secret, 'utf8'));
    hmac.update(body);
    const computed = Buffer.from(hmac.digest('hex').toUpperCase(), 'utf8');

    // timingSafeEqual throws on a length mismatch; hex digests are fixed-width.
    if (computed.length !== received.length) {
      return false;
    }

    return crypto.timingSafeEqual(computed, received);
  });
}

/**
 * Reverse the `Content-Encoding` applied to a webhook body.
 */
function decompress(body: Buffer, contentEncoding: string | undefined, limit: number): Buffer {
  // maxOutputLength aborts mid-inflate; without it the ceiling is buffer.kMaxLength.
  const options = { maxOutputLength: limit };

  switch ((contentEncoding || '').toLowerCase()) {
    case '':
    case 'none':
    case 'identity':
      return body;
    case 'gzip':
    case 'gz':
      return zlib.gunzipSync(body, options);
    case 'deflate':
      return zlib.inflateSync(body, options);
    case 'br':
    case 'brotli':
      return zlib.brotliDecompressSync(body, options);
    case 'zstd': {
      const zstdDecompressSync = (zlib as any).zstdDecompressSync;
      if (typeof zstdDecompressSync !== 'function') {
        throw new Error('zstd webhook bodies require Node 22+; set the webhook content encoding to gzip or none');
      }
      return zstdDecompressSync(body, options);
    }
    default:
      throw new Error(`Unsupported webhook content encoding: ${contentEncoding}`);
  }
}

/** Raised when a body is larger than the configured cap, before or after inflation. */
class WebhookBodyTooLarge extends Error {}

/**
 * Collect the request body without a body parser in front of it. body-parser
 * answers 415 for any encoding it cannot inflate itself, and hands back a
 * parsed object where the signature needs bytes.
 */
function readBody(req: any, limit: number): Promise<Buffer> {
  // express.raw() leaves the bytes on req.body.
  if (Buffer.isBuffer(req.body)) {
    return Promise.resolve(req.body);
  }

  // An object-producing parser (express.json()) already drained the stream, so
  // 'data' and 'end' never fire again and awaiting them parks the request until the
  // socket times out. Its output is unusable here: the signature covers bytes.
  if (req.readableEnded || req.complete) {
    return Promise.reject(
      new Error(
        'the request body was already consumed by another body parser. Mount the Scrapfly ' +
          'webhook route on an app without a global express.json()/urlencoded(), or register ' +
          'those parsers after createServer(), so the raw bytes reach signature verification.',
      ),
    );
  }

  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;

    req.on('data', (chunk: Buffer) => {
      size += chunk.length;

      if (size > limit) {
        reject(new WebhookBodyTooLarge(`webhook body exceeds ${limit} bytes`));
        return;
      }

      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

/**
 * Start a tiny Express server that receives Scrapfly webhook callbacks,
 * verifies their signature, and dispatches them to the provided `callback`.
 * Intended for quick integration and local development; production setups
 * should wire Scrapfly webhooks directly into their own HTTP stack via
 * {@link verifySignature}.
 *
 * Every request must be signed. A body with no `X-Scrapfly-Webhook-Signature`
 * is rejected with 401 rather than delivered.
 *
 * Requires the `express` package to be installed.
 *
 * @param signingSecrets Webhook signing secret(s) from your webhook settings.
 * @param callback Invoked with the verified body, its resource type, and the
 * raw Express request. Awaited, so an async callback's failure yields 500. Bodies are JSON-parsed when the content type says so;
 * binary payloads (screenshot images) arrive as a Buffer.
 * @param app Optional pre-configured Express app to mount on.
 * @param maxBodyBytes Reject bodies larger than this, before any decompression.
 * @returns The underlying Express app (for further configuration or `.listen()`).
 */
export async function createServer(
  signingSecrets: string | string[],
  callback: (data: any, resourceType: string, request: any) => void | Promise<void>,
  app?: any,
  maxBodyBytes: number = MAX_BODY_BYTES,
): Promise<any> {
  if (!signingSecrets || (Array.isArray(signingSecrets) && signingSecrets.length === 0)) {
    throw new Error('createServer requires the webhook signing secret(s) from your Scrapfly dashboard');
  }

  let express: any;
  try {
    const expressModule = await import('express');
    express = expressModule.default || expressModule;
  } catch (e) {
    throw new Error('express is not installed, please install it with `npm install express`');
  }

  if (!app) {
    app = express();
  }

  app.post('/webhook', async (req: any, res: any) => {
    const resourceType = req.headers['x-scrapfly-webhook-resource-type'];
    // The digest is sent under both spellings; accept either.
    const signature = req.headers['x-scrapfly-webhook-signature'] ||
      req.headers['x-scrapfly-webhook-signature-lowercase'];

    if (!RESOURCE_TYPES.includes(resourceType)) {
      // Attacker-controlled and served as text/html: never echo it back.
      log.error('Unsupported resource type:', JSON.stringify(resourceType));
      return res.status(400).send('unsupported resource type');
    }

    // A ping sent while a webhook is being created carries no signature. Answer the
    // reachability probe, but never hand an unverified body to the callback: the
    // resource type is as unauthenticated as the signature.
    if (resourceType === ResourceType.PING && !signature) {
      return res.status(200).send('');
    }

    let body: Buffer;
    try {
      body = decompress(await readBody(req, maxBodyBytes), req.headers['content-encoding'], maxBodyBytes);
    } catch (e) {
      log.error('Webhook decoding error:', e);
      // Decoding runs before verification, so these failures are reachable unauthenticated.
      return res.status(e instanceof WebhookBodyTooLarge ? 413 : 400).send('');
    }

    let signedMessage: Buffer | null = body;

    if (resourceType === ResourceType.ALERT) {
      signedMessage = alertSignedMessage(req.headers['x-scrapfly-webhook-timestamp'], body);

      if (signedMessage === null) {
        log.error(`Rejected alert webhook with a missing or stale timestamp from ${req.ip}`);
        return res.status(401).send('');
      }
    }

    if (!verifySignature(signedMessage, signature, signingSecrets)) {
      log.error(`Rejected unsigned or mis-signed ${resourceType} webhook from ${req.ip}`);
      return res.status(401).send('');
    }

    let data: any = body;
    const contentType = (req.headers['content-type'] || '') as string;
    try {
      if (contentType.startsWith('application/json')) {
        data = JSON.parse(body.toString('utf8'));
      } else if (contentType.startsWith('application/msgpack')) {
        // application/msgpack is an offered webhook content type.
        const { decode } = await import('npm:@msgpack/msgpack@3.0.0');
        data = decode(body);
      }
    } catch (e) {
      log.error('Webhook body parse error:', e);
      return res.status(400).send('');
    }

    try {
      // Awaited: an un-awaited async callback rejects into an unhandled rejection,
      // which terminates the process on Node >= 15.
      await callback(data, resourceType, req);
      return res.status(200).send('');
    } catch (e) {
      log.error('Callback error:', e);
      return res.status(500).send('');
    }
  });

  return app;
}
