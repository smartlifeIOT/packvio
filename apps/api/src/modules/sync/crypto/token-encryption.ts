import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import type { ValueTransformer } from 'typeorm';

/**
 * Authenticated encryption for OAuth tokens at rest.
 *
 * Wire format (what actually lands in the text column):
 *
 *     v1:BASE64( iv(12) || authTag(16) || ciphertext )
 *
 * AES-256-GCM, so the auth tag makes tampering detectable: a flipped byte
 * anywhere in the blob fails authentication and `decryptSecret` throws instead
 * of handing back plausible-looking garbage.
 *
 * The `v1:` prefix exists so the scheme can be rotated without a guessing game:
 * a future `v2:` reader can branch on the prefix and re-encrypt on read.
 *
 * The key comes from SALLA_TOKEN_ENC_KEY — 32 bytes, base64. Generate one with:
 *
 *     openssl rand -base64 32
 */

const SCHEME_VERSION = 'v1';
const ALGORITHM = 'aes-256-gcm';
const KEY_BYTES = 32;
const IV_BYTES = 12;
const AUTH_TAG_BYTES = 16;

export const TOKEN_ENC_KEY_ENV = 'SALLA_TOKEN_ENC_KEY';

const HOW_TO_GENERATE = `Generate one with: openssl rand -base64 32`;

/** Base64 with optional padding and nothing else — Buffer.from() silently ignores junk otherwise. */
const BASE64_ONLY = /^[A-Za-z0-9+/]+={0,2}$/;

export class TokenEncryptionError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'TokenEncryptionError';
  }
}

/**
 * Parses and validates the key. Exported so boot can fail loudly and early
 * rather than at the first webhook, which is the worst possible moment to
 * discover the key is missing.
 */
export function resolveEncryptionKey(raw: string | undefined = process.env[TOKEN_ENC_KEY_ENV]): Buffer {
  const value = raw?.trim();

  if (!value) {
    throw new TokenEncryptionError(
      `${TOKEN_ENC_KEY_ENV} is not set. Salla tokens must be encrypted at rest — refusing to start ` +
        `and refusing to fall back to plaintext. ${HOW_TO_GENERATE}`,
    );
  }
  if (!BASE64_ONLY.test(value)) {
    throw new TokenEncryptionError(
      `${TOKEN_ENC_KEY_ENV} is not valid base64. ${HOW_TO_GENERATE}`,
    );
  }

  const key = Buffer.from(value, 'base64');
  if (key.length !== KEY_BYTES) {
    throw new TokenEncryptionError(
      `${TOKEN_ENC_KEY_ENV} must decode to exactly ${KEY_BYTES} bytes, got ${key.length}. ${HOW_TO_GENERATE}`,
    );
  }

  return key;
}

/**
 * Cached per raw env value, not once-forever: the cache key is the string
 * itself, so a test (or a future in-place rotation) that swaps the env var gets
 * a freshly derived key instead of a stale one.
 */
let cachedKey: Buffer | undefined;
let cachedFrom: string | undefined;

function encryptionKey(): Buffer {
  const raw = process.env[TOKEN_ENC_KEY_ENV];
  if (cachedKey && cachedFrom === raw) return cachedKey;
  cachedKey = resolveEncryptionKey(raw);
  cachedFrom = raw;
  return cachedKey;
}

export function encryptSecret(plaintext: string): string {
  const key = encryptionKey();
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return `${SCHEME_VERSION}:${Buffer.concat([iv, authTag, ciphertext]).toString('base64')}`;
}

export function decryptSecret(stored: string): string {
  const key = encryptionKey();
  const separator = stored.indexOf(':');
  const version = separator === -1 ? '' : stored.slice(0, separator);

  if (version !== SCHEME_VERSION) {
    // Deliberately NOT falling back to "maybe it's plaintext". A value we cannot
    // identify is a bug or a tampered row, and guessing would hide both.
    throw new TokenEncryptionError(
      `Encrypted value has an unrecognised scheme prefix "${version}" (expected "${SCHEME_VERSION}").`,
    );
  }

  const blob = Buffer.from(stored.slice(separator + 1), 'base64');
  if (blob.length <= IV_BYTES + AUTH_TAG_BYTES) {
    throw new TokenEncryptionError('Encrypted value is truncated.');
  }

  const iv = blob.subarray(0, IV_BYTES);
  const authTag = blob.subarray(IV_BYTES, IV_BYTES + AUTH_TAG_BYTES);
  const ciphertext = blob.subarray(IV_BYTES + AUTH_TAG_BYTES);

  try {
    const decipher = createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
  } catch (error) {
    // GCM authentication failure: wrong key, or the row was modified.
    throw new TokenEncryptionError(
      'Failed to decrypt value: authentication failed (wrong key or tampered ciphertext).',
      { cause: error },
    );
  }
}

/**
 * TypeORM transformer for columns holding a secret.
 *
 * Note this runs at entity-metadata level, outside Nest's DI container, which is
 * why the key is read from process.env rather than injected — a @Column
 * decorator is evaluated at import time, long before any provider exists.
 */
export const encryptedSecretTransformer: ValueTransformer = {
  to: (value: string | null | undefined): string | null =>
    value === null || value === undefined ? null : encryptSecret(value),
  from: (value: string | null): string | null => (value === null ? null : decryptSecret(value)),
};
