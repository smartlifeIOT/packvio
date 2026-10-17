import { decryptSecret, encryptSecret } from './token-encryption';

/**
 * `app.store.authorize` delivers the access and refresh tokens in the webhook
 * body, and every webhook body is persisted verbatim to `salla_events.payload`
 * so a failed handler can be fixed and replayed. Persisting that body as-is
 * would put the tokens in cleartext in a jsonb column — which would quietly
 * undo the whole point of encrypting `salla_tokens`.
 *
 * So the same AES-256-GCM envelope is applied to the sensitive leaves before the
 * row is written. Replay still works, because the handler decrypts on the way
 * out; a `SELECT payload FROM salla_events` shows `v1:…` where the token was.
 */

const SENSITIVE_KEYS = new Set(['access_token', 'refresh_token', 'token']);

/** Deep copy with every sensitive leaf replaced by its ciphertext. */
export function encryptPayloadSecrets(value: unknown): unknown {
  if (Array.isArray(value)) return value.map((item) => encryptPayloadSecrets(item));

  if (typeof value === 'object' && value !== null) {
    const out: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      out[key] =
        SENSITIVE_KEYS.has(key) && typeof child === 'string' && child.length > 0
          ? encryptSecret(child)
          : encryptPayloadSecrets(child);
    }
    return out;
  }

  return value;
}

/**
 * Reads a value that may or may not have been through `encryptPayloadSecrets` —
 * an in-memory payload straight off the wire is still plaintext, while the same
 * payload re-read from the database is not.
 */
export function readPayloadSecret(value: unknown): string | null {
  if (typeof value !== 'string' || value.length === 0) return null;
  return value.startsWith('v1:') ? decryptSecret(value) : value;
}
