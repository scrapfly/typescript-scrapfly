import { Buffer } from 'node:buffer';
import crypto from 'node:crypto';
import { log } from './logger.ts';

export enum ResourceType {
  SCRAPE = 'scrape',
  PING = 'ping',
}

/**
 * Verify that a webhook request was sent by Scrapfly by comparing the
 * HMAC-SHA256 signature on the request body against the configured
 * signing secret.
 *
 * @param body Raw request body as received (verify BEFORE any decompression
 *             or JSON parsing — the signature is computed on the bytes
 *             Scrapfly sent on the wire).
 * @param signature Value of the `X-Scrapfly-Webhook-Signature` header
 *                  (uppercase hex digest).
 * @param signingSecret Webhook signing secret from the dashboard, passed as-is
 *                      (UTF-8 string; not hex-encoded).
 * @returns `true` if the signature matches.
 */
export function verifySignature(body: Buffer, signature: string, signingSecret: string): boolean {
  const hmac = crypto.createHmac('sha256', Buffer.from(signingSecret, 'utf8'));
  hmac.update(body);
  const computed = hmac.digest('hex').toUpperCase();
  const received = signature.toUpperCase();
  if (computed.length !== received.length) {
    return false;
  }
  return crypto.timingSafeEqual(Buffer.from(computed), Buffer.from(received));
}


/**
 * Start a tiny Express server that receives Scrapfly webhook callbacks
 * and dispatches them to the provided `callback`. Intended for quick
 * integration and local development; production setups should wire
 * Scrapfly webhooks directly into their own HTTP stack via
 * {@link verifySignature}.
 *
 * Requires the `express` package to be installed.
 *
 * @param callback Invoked with the parsed webhook body, its resource
 * type (`scrape` or `ping`), and the raw Express request.
 * @param app Optional pre-configured Express app to mount on.
 * @returns The underlying Express app (for further configuration or `.listen()`).
 */
export async function createServer(
  callback: (data: any, resourceType: string, request: any) => void,
  app?: any,
): Promise<any> {
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

  const jsonMiddleware = express.json({
    verify: (req: any, _res: any, buf: Buffer) => {
      req.rawBody = buf;
    },
  });

  app.post('/webhook', jsonMiddleware, (req: any, res: any) => {
    try {
      const resourceType = req.headers['x-scrapfly-webhook-resource-type'];

      if (resourceType !== 'scrape' && resourceType !== 'ping') {
        log.error(`Unsupported resource type: ${resourceType}`);
        return res.status(400).send(`this webhook server only supports scrape and ping calls`);
      }

      const data: any = req.body;

      try {
        callback(data, resourceType, req);
        res.status(200).send('');
      } catch (e) {
        log.error('Callback error:', e);
        res.status(500).send('');
      }
    } catch (e) {
      log.error('Webhook processing error:', e);
      res.status(400).send('');
    }
  });

  return app;
}
