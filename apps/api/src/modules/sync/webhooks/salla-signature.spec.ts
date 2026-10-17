import { createHmac } from 'node:crypto';
import { APP_STORE_AUTHORIZE, PRODUCT_UPDATED } from '../../../../test/fixtures/salla-webhooks';
import { deriveEventId, resolveEventId, verifySallaSignature } from './salla-signature';

const SECRET = 'whsec_TESTONLY_5f4e3d2c1b0a9988776655443322110';

function sign(body: Buffer, secret = SECRET): string {
  return createHmac('sha256', secret).update(body).digest('hex');
}

describe('verifySallaSignature', () => {
  const rawBody = Buffer.from(JSON.stringify(APP_STORE_AUTHORIZE), 'utf8');

  it('accepts a signature over the exact bytes received', () => {
    expect(verifySallaSignature(rawBody, sign(rawBody), SECRET)).toBe(true);
  });

  it('accepts a base64-encoded digest as well as hex', () => {
    const base64 = createHmac('sha256', SECRET).update(rawBody).digest('base64');
    expect(verifySallaSignature(rawBody, base64, SECRET)).toBe(true);
  });

  it('rejects an altered body', () => {
    const signature = sign(rawBody);
    const altered = Buffer.from(
      JSON.stringify({ ...APP_STORE_AUTHORIZE, merchant: 999 }),
      'utf8',
    );

    expect(verifySallaSignature(altered, signature, SECRET)).toBe(false);
  });

  it('rejects a body that differs only in whitespace', () => {
    // This is the re-serialisation trap: same object, different bytes.
    const reSerialised = Buffer.from(JSON.stringify(APP_STORE_AUTHORIZE, null, 2), 'utf8');

    expect(verifySallaSignature(reSerialised, sign(rawBody), SECRET)).toBe(false);
  });

  it('rejects an altered signature', () => {
    const signature = sign(rawBody);
    const flipped = `${signature.slice(0, -1)}${signature.endsWith('a') ? 'b' : 'a'}`;

    expect(verifySallaSignature(rawBody, flipped, SECRET)).toBe(false);
  });

  it('rejects a signature made with the wrong secret', () => {
    expect(verifySallaSignature(rawBody, sign(rawBody, 'wrong-secret'), SECRET)).toBe(false);
  });

  it('rejects a missing signature', () => {
    expect(verifySallaSignature(rawBody, undefined, SECRET)).toBe(false);
    expect(verifySallaSignature(rawBody, '', SECRET)).toBe(false);
  });

  it('rejects a signature of the wrong length without throwing', () => {
    // timingSafeEqual throws on unequal lengths; the guard must come first.
    expect(() => verifySallaSignature(rawBody, 'abcd', SECRET)).not.toThrow();
    expect(verifySallaSignature(rawBody, 'abcd', SECRET)).toBe(false);
  });

  it('rejects when no secret is configured', () => {
    expect(verifySallaSignature(rawBody, sign(rawBody), '')).toBe(false);
  });

  it('rejects an empty body', () => {
    expect(verifySallaSignature(Buffer.alloc(0), sign(rawBody), SECRET)).toBe(false);
  });
});

describe('event id derivation', () => {
  const rawBody = Buffer.from(JSON.stringify(PRODUCT_UPDATED), 'utf8');

  it('is deterministic for identical bytes', () => {
    const first = deriveEventId('product.updated', '1234567890', '2026-08-18 10:30:00', rawBody);
    const second = deriveEventId('product.updated', '1234567890', '2026-08-18 10:30:00', rawBody);

    expect(first).toBe(second);
    expect(first).toMatch(/^sha256:[0-9a-f]{64}$/);
  });

  it('differs when the body differs', () => {
    const other = Buffer.from(JSON.stringify({ ...PRODUCT_UPDATED, data: { id: 1 } }), 'utf8');

    expect(deriveEventId('product.updated', '1', 'x', rawBody)).not.toBe(
      deriveEventId('product.updated', '1', 'x', other),
    );
  });

  it('differs when the event or store differs', () => {
    expect(deriveEventId('product.updated', '1', 'x', rawBody)).not.toBe(
      deriveEventId('product.created', '1', 'x', rawBody),
    );
    expect(deriveEventId('product.updated', '1', 'x', rawBody)).not.toBe(
      deriveEventId('product.updated', '2', 'x', rawBody),
    );
  });

  it('prefers an id from Salla when one is present', () => {
    const withId = { ...PRODUCT_UPDATED, event_id: 'evt_01H9ABCXYZ' };
    const result = resolveEventId(withId, 'product.updated', '1', 'x', rawBody);

    expect(result).toEqual({ eventId: 'salla:evt_01H9ABCXYZ', strategy: 'salla' });
  });

  it('falls back to the derived key when Salla sends no id', () => {
    const result = resolveEventId(PRODUCT_UPDATED, 'product.updated', '1', 'x', rawBody);

    expect(result.strategy).toBe('derived');
    expect(result.eventId).toMatch(/^sha256:/);
  });
});
