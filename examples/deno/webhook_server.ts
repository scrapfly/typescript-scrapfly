/**
 * Example webhook server with Deno and ngrok
 *
 * Installation:
 * 1. Export your authtoken from the ngrok dashboard https://dashboard.ngrok.com/get-started/your-authtoken as NGROK_AUTHTOKEN in your terminal
 * 2. Run the script: deno run --allow-net --allow-env --allow-read examples/deno/webhook_server.ts
 * 3. Use the public ngrok url in your Scrapfly webhook configuration
 * [optional for the verification step]
 * 4. Copy the Webhook signing secret from your Scrapfly webhook configuration and add it to the WEBHOOK_SECRET variable
 */

import { createServer, verifySignature } from 'scrapfly-sdk';
import ngrok from 'npm:@ngrok/ngrok';

const callback = (data: any, resourceType: string, request: any) => {
  console.log(`\n=== ${resourceType.toUpperCase()} Webhook Received ===`);
  console.log(JSON.stringify(data, null, 2));
  console.log('======================\n');
  
  // verify webhook signature
  console.log('====== VERIFYING SIGNATURE ======');
  const isValid = verifySignature(
    new TextEncoder().encode(request.rawBody),
    request.headers['x-scrapfly-webhook-signature'],
    WEBHOOK_SECRET
  );
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
  } catch (error: any) {
    console.error(`====== FAILED TO CONNECT TO NGROK ======`)
    console.error(error.message);
    console.error('==============================\n');
  }
});
