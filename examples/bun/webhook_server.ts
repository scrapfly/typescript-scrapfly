/**
 * Example webhook server with Bun and ngrok
 *
 * Installation:
 * 1. Install dependencies: bun add @ngrok/ngrok
 * 2. Export your authtoken from the ngrok dashboard https://dashboard.ngrok.com/get-started/your-authtoken as NGROK_AUTHTOKEN in your terminal
 * 3. Run the script: bun run examples/bun/webhook_server.ts
 * 4. Use the public ngrok url in your Scrapfly webhook configuration
 * [optional for the verification step]
 * 5. Copy the Webhook signing secret from your Scrapfly webhook configuration and add it to the WEBHOOK_SECRET variable
 */

import { createServer, verifySignature } from 'scrapfly-sdk';
import ngrok from '@ngrok/ngrok';

const callback = (data, resourceType, request) => {
  console.log(`\n=== ${resourceType.toUpperCase()} Webhook Received ===`);
  console.log(JSON.stringify(data, null, 2));
  console.log('======================\n');
  
  // verify webhook signature
  console.log('====== VERIFYING SIGNATURE ======');
  const isValid = verifySignature(Buffer.from(request.rawBody), request.headers['x-scrapfly-webhook-signature'], WEBHOOK_SECRET);
  console.log(`Signature valid: ${isValid}`);
  console.log('==============================\n');
};

const app = await createServer(callback);
const WEBHOOK_SECRET = 'your-webhook-secret';

const PORT = 3000;
app.listen(PORT, async () => {
  console.log(`====== WEBHOOK LISTENING ON ======`)
  console.log(`http://localhost:${PORT}/webhook`);
  console.log('==================================\n');

  try {
    const listener = await ngrok.connect({ addr: PORT, authtoken_from_env: true });
    const url = listener.url();
    console.log(`====== PUBLIC NGROK URL ======`)
    console.log(`${url}/webhook`);
    console.log('==============================\n');
  } catch (error) {
    console.error(`====== FAILED TO CONNECT TO NGROK ======`)
    console.error(error.message);
    console.error('==============================\n');
  }
});
