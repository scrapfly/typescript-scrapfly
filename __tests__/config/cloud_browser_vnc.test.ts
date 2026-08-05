import { BrowserConfig } from '../../src/browserconfig.ts';
import { assertEquals, assertRejects } from 'https://deno.land/std@0.224.0/assert/mod.ts';

// The API stores "<project_salt>-<vnc_password>" and native VNC clients must
// send that exact string, so the separator and the 8-char salt width are a wire
// contract. SALT is hardcoded rather than recomputed so a change to the
// derivation fails the test instead of moving with it.
const API_KEY = 'scp-test-0000000000000000000000000000000000';
const SALT = '701018da';

Deno.test('BrowserConfig: vncClientPassword matches server salting', async () => {
  const config = new BrowserConfig({ enable_vnc: true, vnc_password: 'hunter2' });
  assertEquals(await config.vncClientPassword(API_KEY), `${SALT}-hunter2`);
});

Deno.test('BrowserConfig: vncClientPassword rejects when the server would not salt', async () => {
  const cases = [
    { enable_vnc: true },
    { enable_vnc: true, vnc_password: '' },
    { vnc_password: 'hunter2' },
  ];

  for (const options of cases) {
    await assertRejects(
      () => new BrowserConfig(options).vncClientPassword(API_KEY),
      Error,
      'enable_vnc and vnc_password must both be set',
    );
  }
});
