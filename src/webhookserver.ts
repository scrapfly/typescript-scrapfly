import crypto from 'node:crypto';
import { log } from './logger.ts';

export enum ResourceType {
  SCRAPE = 'scrape',
  PING = 'ping',
}

export function verifySignature(body: Buffer, signature: string, signingSecret: string): boolean {
  const secret = Buffer.from(signingSecret, 'hex');
  const hmac = crypto.createHmac('sha256', secret);
  hmac.update(body);
  const computed = hmac.digest('hex').toUpperCase();
  return computed === signature;
}


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
