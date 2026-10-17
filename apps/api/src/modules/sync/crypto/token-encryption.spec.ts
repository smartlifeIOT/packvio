import {
  decryptSecret,
  encryptSecret,
  encryptedSecretTransformer,
  resolveEncryptionKey,
  TOKEN_ENC_KEY_ENV,
  TokenEncryptionError,
} from './token-encryption';

const VALID_KEY = Buffer.alloc(32, 0xab).toString('base64');

/** A token-shaped string: long, opaque, and nothing like the plaintext we assert on. */
const TOKEN = 'ory_at_9WkQ2m4pXvZ1cR7tYbN3jH8sLdF0gK5eA6uI-oP2qW4';

describe('token encryption', () => {
  afterEach(() => {
    process.env[TOKEN_ENC_KEY_ENV] = VALID_KEY;
  });

  it('round-trips a value', () => {
    const encrypted = encryptSecret(TOKEN);

    expect(encrypted).toMatch(/^v1:/);
    expect(encrypted).not.toContain(TOKEN);
    expect(decryptSecret(encrypted)).toBe(TOKEN);
  });

  it('produces a different ciphertext each time (random IV) that still decrypts', () => {
    const first = encryptSecret(TOKEN);
    const second = encryptSecret(TOKEN);

    expect(first).not.toBe(second);
    expect(decryptSecret(first)).toBe(TOKEN);
    expect(decryptSecret(second)).toBe(TOKEN);
  });

  it('throws rather than returning garbage when the ciphertext is tampered with', () => {
    const encrypted = encryptSecret(TOKEN);
    const blob = Buffer.from(encrypted.slice('v1:'.length), 'base64');

    // Flip one bit in the ciphertext body, past the iv(12) and authTag(16).
    blob[blob.length - 1] ^= 0x01;
    const tampered = `v1:${blob.toString('base64')}`;

    expect(() => decryptSecret(tampered)).toThrow(TokenEncryptionError);
    expect(() => decryptSecret(tampered)).toThrow(/authentication failed/i);
  });

  it('throws when the auth tag is tampered with', () => {
    const blob = Buffer.from(encryptSecret(TOKEN).slice('v1:'.length), 'base64');
    blob[12] ^= 0xff; // first byte of the auth tag

    expect(() => decryptSecret(`v1:${blob.toString('base64')}`)).toThrow(TokenEncryptionError);
  });

  it('throws when decrypted under a different key', () => {
    const encrypted = encryptSecret(TOKEN);
    process.env[TOKEN_ENC_KEY_ENV] = Buffer.alloc(32, 0x01).toString('base64');

    expect(() => decryptSecret(encrypted)).toThrow(TokenEncryptionError);
  });

  it('refuses an unrecognised scheme prefix instead of assuming plaintext', () => {
    expect(() => decryptSecret('plaintext-token')).toThrow(/unrecognised scheme prefix/i);
    expect(() => decryptSecret('v2:AAAA')).toThrow(/unrecognised scheme prefix/i);
  });

  it('refuses a truncated blob', () => {
    expect(() => decryptSecret(`v1:${Buffer.alloc(8).toString('base64')}`)).toThrow(/truncated/i);
  });

  describe('key validation', () => {
    it('accepts a 32-byte base64 key', () => {
      expect(resolveEncryptionKey(VALID_KEY)).toHaveLength(32);
    });

    it('rejects a missing key with instructions', () => {
      // Called with no argument at all, so the env-var default kicks in — which
      // is the shape the real failure takes when nobody set the variable.
      delete process.env[TOKEN_ENC_KEY_ENV];

      expect(() => resolveEncryptionKey()).toThrow(/is not set/);
      expect(() => resolveEncryptionKey()).toThrow(/openssl rand -base64 32/);
      expect(() => resolveEncryptionKey('')).toThrow(/is not set/);
      expect(() => encryptSecret('anything')).toThrow(/is not set/);
    });

    it('rejects a key of the wrong length', () => {
      expect(() => resolveEncryptionKey(Buffer.alloc(16, 1).toString('base64'))).toThrow(
        /exactly 32 bytes, got 16/,
      );
    });

    it('rejects non-base64 rather than silently ignoring the junk', () => {
      expect(() => resolveEncryptionKey('not a key!!!')).toThrow(/not valid base64/);
    });
  });

  describe('typeorm transformer', () => {
    it('encrypts on write and decrypts on read', () => {
      const stored = encryptedSecretTransformer.to(TOKEN) as string;

      expect(stored).toMatch(/^v1:/);
      expect(encryptedSecretTransformer.from(stored)).toBe(TOKEN);
    });

    it('passes null through untouched', () => {
      expect(encryptedSecretTransformer.to(null)).toBeNull();
      expect(encryptedSecretTransformer.from(null)).toBeNull();
    });
  });
});
