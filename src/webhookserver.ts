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
 * @param body Raw request body as received (do NOT decode).
 * @param signature Value of the `Scrapfly-Signature` header (hex).
 * @param signingSecret Webhook signing secret configured in the dashboard (hex).
 * @returns `true` if the signature matches.
 */
export function verifySignature(body: Buffer, signature: string, signingSecret: string): boolean {
  const secret = Buffer.from(signingSecret, 'hex');
  const hmac = crypto.createHmac('sha256', secret);
  hmac.update(body);
  const computed = hmac.digest('hex').toUpperCase();
  return computed === signature;
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
