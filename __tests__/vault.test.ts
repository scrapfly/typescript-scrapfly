import { VaultLinkedService } from '../src/types.ts';
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";

// The enum value IS the wire value. The server's linked-service registry accepts
// exactly '1password' and answers anything else with a 400, so a rename here is
// a protocol break, not a refactor.
Deno.test('VaultLinkedService.ONE_PASSWORD serializes as the registry discriminator', () => {
  assertEquals(VaultLinkedService.ONE_PASSWORD, '1password');
  assertEquals(JSON.parse(JSON.stringify({ linked_service: VaultLinkedService.ONE_PASSWORD })), {
    linked_service: '1password',
  });
});

Deno.test('VaultLinkedService has no member beyond the registered provider', () => {
  assertEquals(Object.values(VaultLinkedService), ['1password']);
});
