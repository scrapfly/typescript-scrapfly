import { BrowserConfig, type NetworkPolicy } from '../../src/browserconfig.ts';
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';

Deno.test('BrowserConfig sends only the selected network rules', () => {
  const block = ['httpbin.dev', '192.0.2.7', '2001:db8::10'];
  const allow = ['web-scraping.dev'];
  for (const policy of [{ block }, { allow }, { allow, block }] satisfies NetworkPolicy[]) {
    const url = new URL(new BrowserConfig({ network_policy: policy }).websocketUrl('key'));
    assertEquals(JSON.parse(url.searchParams.get('network_policy')!), policy);
    assertEquals(url.searchParams.getAll('network_policy').length, 1);
  }
  for (const policy of [undefined, {}, { allow: [], block: [] }]) {
    const url = new URL(new BrowserConfig({ network_policy: policy }).websocketUrl('key'));
    assertEquals(url.searchParams.has('network_policy'), false);
  }
});
