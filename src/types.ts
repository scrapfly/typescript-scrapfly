export type Rec<T> = Record<string, T>;
export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'HEAD';

// ---------------------------------------------------------------------------
// Cloud Browser Credential Vault types.
//
// Vaults store browser credentials (passwords, passkeys, cookies, TOTP seeds)
// encrypted server-side under a customer-held vault key. The server emits the
// raw vault key exactly once on POST /vault and POST /vault/{id}/rotate; the
// SDK MUST never log, print, or include it in error messages.
// See compliance memory at agent_secret_tokenization_boundary.md.
// ---------------------------------------------------------------------------

/** Vault metadata returned by the server (no secret material). */
export type Vault = {
  id: string;
  user_uuid?: string;
  project?: string;
  env?: string;
  name: string;
  description?: string;
  item_count?: number;
  created_at?: string;
  updated_at?: string;
  // Allow forward-compat fields the server may add.
  [k: string]: unknown;
};

/** Discriminator for the secret payload of a {@link VaultItem}. */
export type VaultItemType = 'password' | 'passkey' | 'cookie' | 'totp';

/**
 * Plaintext secret payload used when creating or rotating an item.
 *
 * Only one variant should be set, matching the item's `type`. The flat shape
 * mirrors the dashboard form ergonomics; the API also accepts a typed form
 * (e.g. `{ password: { password: 'hunter2' } }`).
 */
export type VaultSecret = {
  // password
  password?: string | { password: string };
  // passkey (flat)
  credentialId?: string;
  privateKey?: string;
  userHandle?: string;
  signCount?: number;
  // passkey (typed)
  passkey?: {
    credentialId: string;
    privateKey: string;
    userHandle?: string;
    signCount?: number;
  };
  // cookie (flat)
  name?: string;
  value?: string;
  domain?: string;
  path?: string;
  secure?: boolean;
  httpOnly?: boolean;
  sameSite?: 'Strict' | 'Lax' | 'None' | string;
  expires?: number;
  // cookie (typed)
  cookie?: {
    name: string;
    value?: string;
    domain: string;
    path?: string;
    secure?: boolean;
    httpOnly?: boolean;
    sameSite?: 'Strict' | 'Lax' | 'None' | string;
    expires?: number;
  };
  // totp (flat — `seed` to avoid colliding with the envelope's `secret` key)
  seed?: string;
  issuer?: string;
  account?: string;
  algorithm?: 'SHA1' | 'SHA256' | 'SHA512' | string;
  digits?: number;
  period?: number;
  // totp (typed)
  totp?: {
    secret: string;
    issuer?: string;
    account?: string;
    algorithm?: 'SHA1' | 'SHA256' | 'SHA512' | string;
    digits?: number;
    period?: number;
  };
};

/** Server-stored vault item (secret_blob is opaque ciphertext). */
export type VaultItem = {
  id: string;
  vault_id: string;
  type: VaultItemType;
  label: string;
  origin: string;
  username?: string;
  /** Base64-encoded envelope ciphertext; useless without the vault key. */
  secret_blob?: string;
  master_key_version?: number;
  metadata?: Record<string, unknown>;
  created_at?: string;
  updated_at?: string;
  [k: string]: unknown;
};

/** Payload accepted by `cloudBrowserVaultItemCreate`. */
export type VaultItemCreate = {
  type: VaultItemType;
  label: string;
  origin: string;
  username?: string;
  secret: VaultSecret;
  metadata?: Record<string, unknown>;
};
