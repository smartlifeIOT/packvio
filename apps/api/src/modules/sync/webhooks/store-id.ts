/**
 * Salla puts the store id at the envelope level as `merchant`, but some payloads
 * only carry it nested under `data.merchant.id` (or `data.store.id`).
 *
 * Lives in its own file rather than next to its callers: both the webhook ingest
 * and the event processor need it, and importing it from either one would put a
 * cycle between them — which Nest resolves by handing the DI container an
 * `undefined` provider token, and the failure surfaces far from its cause.
 */
export function extractStoreId(
  merchant: number | string | null | undefined,
  data: Record<string, unknown> | undefined,
): string | null {
  if (typeof merchant === 'number' || (typeof merchant === 'string' && merchant.trim())) {
    return String(merchant).trim();
  }

  for (const key of ['merchant', 'store'] as const) {
    const nested = data?.[key];
    if (typeof nested === 'number' || (typeof nested === 'string' && nested.trim())) {
      return String(nested).trim();
    }
    if (typeof nested === 'object' && nested !== null) {
      const id = (nested as Record<string, unknown>).id;
      if (typeof id === 'number' || (typeof id === 'string' && id.trim())) return String(id).trim();
    }
  }

  return null;
}
