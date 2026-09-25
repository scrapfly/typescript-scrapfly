export type Rec<T> = Record<string, T>;
export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'HEAD';

// ---------------------------------------------------------------------------
// Cloud Browser Credential Vault types.
//
// Vaults store browser credentials (passwords, passkeys, cookies, TOTP seeds)
// encrypted server-side under a customer-held vault key. The server emits the
// raw vault key exactly once on POST /vault and POST /vault/{id}/rotate; the
// SDK MUST never log, print, or include it in error messages.
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
  /** Number of mirrored rows. Populated by `cloudBrowserVaultGet` only. */
  linked_item_count?: number;
  // Link metadata. Non-secret by construction: the provider service-account
  // token is a sealed item, never one of these fields.
  vault_type?: VaultType;
  linked_service?: VaultLinkedService;
  /** Stored `linked_service_data`, which carries the server-owned `token_item_id`. */
  linked_service_data?: VaultOnePasswordData & { token_item_id?: string };
  linked_sync_at?: string;
  linked_sync_started_at?: string;
  linked_sync_status?: VaultSyncStatus;
  linked_sync_error?: string;
  linked_sync_counts?: VaultSyncCounts;
  created_at?: string;
  updated_at?: string;
  // Allow forward-compat fields the server may add.
  [k: string]: unknown;
};

/** Whether a vault's items are operator-entered or mirrored from a provider. */
export type VaultType = 'manual' | 'linked_service';

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
  /**
   * Provenance. Anything other than `manual` is owned by the linked-service
   * syncer: the item endpoints refuse to mutate such a row, and the next sync
   * overwrites or deletes it.
   */
  source?: VaultItemSource;
  /** Upstream diff key; set on mirrored rows only. */
  source_ref?: string;
  /** Opaque upstream revision the sync diff compares without decrypting. */
  source_version?: string;
  source_synced_at?: string;
  created_at?: string;
  updated_at?: string;
  [k: string]: unknown;
};

/** `source` of a {@link VaultItem}. The sealed provider token is never listed. */
export type VaultItemSource = 'manual' | '1password';

/** Payload accepted by `cloudBrowserVaultItemCreate`. */
export type VaultItemCreate = {
  type: VaultItemType;
  label: string;
  origin: string;
  username?: string;
  secret: VaultSecret;
  metadata?: Record<string, unknown>;
};

// ---------------------------------------------------------------------------
// Linked secret managers (1Password).
//
// A linked vault mirrors an upstream secret manager: the provider's
// service-account token is sealed under the vault key as a reserved item, and
// the syncer owns every row it imports. The token travels in the request body
// of link / update / test and is NEVER stored by the caller, logged, or echoed
// back by the server.
// ---------------------------------------------------------------------------

/** Linked-service discriminator. 1Password is the only provider today. */
export type VaultLinkedService = '1password';

/**
 * When the mirror is refreshed. `on_session` refreshes at most once per
 * `sync_ttl_s` when a Cloud Browser session opens the vault; `manual` only
 * syncs on `cloudBrowserVaultServiceSync`. (`live` is rejected by the server.)
 */
export type VaultSyncMode = 'manual' | 'on_session';

/** Outcome of the last sync round, as stored on the vault row. */
export type VaultSyncStatus =
  | 'running'
  | 'ok'
  | 'partial'
  | 'auth_failed'
  | 'rate_limited'
  | 'scope_error'
  | 'unavailable'
  | 'error';

/**
 * Non-secret selection rules of a 1Password link (`linked_service_data`).
 *
 * `vault_id` or `vault_name` is required — the server rejects a document with
 * neither. `token_item_id` is deliberately absent: the server binds it when the
 * token is sealed, and a PATCH body cannot redirect the token lookup because
 * the stored id always wins.
 */
export type VaultOnePasswordData = {
  /** Upstream vault id. Survives an upstream rename, unlike `vault_name`. */
  vault_id?: string;
  vault_name?: string;
  /** Glob over upstream item titles, 128 characters max. */
  title_filter?: string;
  /** At most 16 tags. */
  tags?: string[];
  sync_mode?: VaultSyncMode;
  /** Refresh TTL in seconds, 60 .. 86400. Defaults to 900 server-side. */
  sync_ttl_s?: number;
};

/** Payload accepted by `cloudBrowserVaultServiceLink`. */
export type VaultServiceLink = {
  linked_service: VaultLinkedService;
  /** Provider service-account token. Sealed under the vault key on arrival. */
  token: string;
  linked_service_data: VaultOnePasswordData;
};

/**
 * Payload accepted by `cloudBrowserVaultServiceUpdate`. `linked_service` is not
 * settable: the stored discriminator is what the server updates against.
 */
export type VaultServiceUpdate = {
  /** Rotates the sealed token. Requires the vault key; omit for a config-only edit. */
  token?: string;
  linked_service_data?: VaultOnePasswordData;
};

/** Per-round reconcile counts, also stored as `linked_sync_counts`. */
export type VaultSyncCounts = {
  imported: number;
  updated: number;
  deleted: number;
  /** Rows the reconcile refused, which is what makes a round `partial`. */
  skipped: number;
  /** Upstream items the provider could not map. Does not make a round partial. */
  unmirrored: number;
};

/** Body of `cloudBrowserVaultServiceSync`. */
export type VaultSyncReport = VaultSyncCounts & {
  status: VaultSyncStatus;
  warnings?: string[];
};

/** One upstream vault the service account can read. */
export type VaultProbeVault = {
  id: string;
  title: string;
};

/** Body of `cloudBrowserVaultServiceTest`. Reads nothing and writes nothing. */
export type VaultProbeResult = {
  vaults_visible: VaultProbeVault[];
  /** Active items in the selected upstream vault; 0 when none is selected yet. */
  item_count: number;
  warnings?: string[];
};
