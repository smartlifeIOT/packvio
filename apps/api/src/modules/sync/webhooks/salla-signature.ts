import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

/**
 * HMAC-SHA256 verification of a Salla webhook, computed over the RAW request
 * bytes. Pure functions, no DI, so the tests can hit them directly.
 */

export const SALLA_SIGNATURE_HEADER = 'x-salla-signature';
export const SALLA_SECURITY_STRATEGY_HEADER = 'x-salla-security-strategy';

/** Salla sends the digest as lowercase hex; base64 is accepted defensively. */
function decodeSignature(header: string): Buffer | null {
  const value = header.trim();
  if (/^[0-9a-fA-F]{64}$/.test(value)) return Buffer.from(value, 'hex');
  if (/^[A-Za-z0-9+/]{43}=?$/.test(value)) return Buffer.from(value, 'base64');
  return null;
}

export function verifySallaSignature(
  rawBody: Buffer | undefined,
  headerValue: string | undefined,
  secret: string,
): boolean {
  if (!rawBody || rawBody.length === 0) return false;
  if (!headerValue) return false;
  if (!secret) return false;

  const received = decodeSignature(headerValue);
  if (!received) return false;

  const expected = createHmac('sha256', secret).update(rawBody).digest();

  // timingSafeEqual throws on a length mismatch, so the length check has to come
  // first — and a wrong-length signature is a mismatch anyway.
  if (received.length !== expected.length) return false;

  return timingSafeEqual(expected, received);
}

/**
 * Idempotency key for a webhook delivery.
 *
 * Salla's webhook envelope carries no event id — only `event`, `merchant`,
 * `created_at` and `data`. So unless a future payload starts sending one (which
 * this checks for first), the key is derived deterministically:
 *
 *     sha256:<sha256( event | storeId | createdAt | sha256(rawBody) )>
 *
 * The inner hash is over the RAW bytes, not the parsed object: a redelivery of
 * the same event is byte-identical, so it collapses to the same key, while two
 * genuinely different deliveries differ somewhere in those bytes. Hashing a
 * re-serialised object instead would make the key depend on key ordering.
 */
export function deriveEventId(
  event: string,
  storeId: string | null,
  createdAt: string | null,
  rawBody: Buffer,
): string {
  const bodyHash = createHash('sha256').update(rawBody).digest('hex');
  const digest = createHash('sha256')
    .update(`${event}|${storeId ?? ''}|${createdAt ?? ''}|${bodyHash}`)
    .digest('hex');

  return `sha256:${digest}`;
}

/** Uses Salla's own id when one is present, otherwise the derived key above. */
export function resolveEventId(
  body: Record<string, unknown>,
  event: string,
  storeId: string | null,
  createdAt: string | null,
  rawBody: Buffer,
): { eventId: string; strategy: 'salla' | 'derived' } {
  // Only an explicit `event_id` counts. A bare top-level `id` is deliberately
  // NOT trusted: in Salla payloads that field identifies the app or the resource,
  // and mistaking it for an event id would collapse every delivery for that
  // resource into one row and silently drop real events.
  const candidate = body.event_id;
  if ((typeof candidate === 'string' && candidate.trim()) || typeof candidate === 'number') {
    return { eventId: `salla:${String(candidate).trim()}`, strategy: 'salla' };
  }
  return { eventId: deriveEventId(event, storeId, createdAt, rawBody), strategy: 'derived' };
}
