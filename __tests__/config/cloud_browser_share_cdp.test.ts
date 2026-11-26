import { BrowserConfig } from '../../src/browserconfig.ts';
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';

Deno.test('BrowserConfig sends share_cdp for a joining client', () => {
  const joined = new URL(
    new BrowserConfig({ session: 'shared-shop', share_cdp: true }).websocketUrl('key'),
  );
  assertEquals(joined.searchParams.get('session'), 'shared-shop');
  assertEquals(joined.searchParams.get('share_cdp'), 'true');

  const opened = new URL(new BrowserConfig({ session: 'shared-shop' }).websocketUrl('key'));
  assertEquals(opened.searchParams.has('share_cdp'), false);
});
