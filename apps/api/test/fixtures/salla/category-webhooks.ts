/**
 * Salla `category.*` webhook payloads.
 *
 * Same SHAPE-UNCERTAIN policy as the product fixtures: `updated_at` appears in
 * both the Laravel object form and as an ISO string, and `image` appears both
 * as a bare URL string and as an object, because the documented shape and the
 * shape observed in list responses do not obviously agree.
 */

import { STORE_ID } from './product-webhooks';

/**
 * category.created for a category the SEED already holds under
 * `slug_en = 'coffee-cups'`. It has no `sallaId` yet, so this is the delivery
 * that links the two — by NAME, since a category has no SKU to match on.
 */
export const CATEGORY_CREATED = {
  event: 'category.created',
  merchant: STORE_ID,
  created_at: '2026-08-19 08:00:00',
  data: {
    id: 301001,
    name: 'Coffee Paper Cups',
    parent_id: null,
    status: 'active',
    sort_order: 1,
    // SHAPE-UNCERTAIN: object form.
    image: { url: 'https://cdn.salla.sa/packvio/cat-coffee-cups.jpg' },
    urls: { customer: 'https://packvio.salla.sa/coffee-paper-cups/c301001' },
    updated_at: {
      date: '2026-08-19 08:00:00.000000',
      timezone_type: 3,
      timezone: 'Asia/Riyadh',
    },
  },
};

/** category.updated — bare-string `image`, ISO `updated_at`, renamed. */
export const CATEGORY_UPDATED = {
  event: 'category.updated',
  merchant: STORE_ID,
  created_at: '2026-08-19 10:00:00',
  data: {
    id: 301001,
    name: 'Coffee Cups & Lids',
    parent_id: null,
    status: 'active',
    sort_order: 2,
    // SHAPE-UNCERTAIN: bare string form.
    image: 'https://cdn.salla.sa/packvio/cat-coffee-cups-v2.jpg',
    updated_at: '2026-08-19T10:00:00+03:00',
  },
};

/** A category Salla has that the seed does not — inserted, slugs generated. */
export const CATEGORY_CREATED_NEW = {
  event: 'category.created',
  merchant: STORE_ID,
  created_at: '2026-08-19 10:15:00',
  data: {
    id: 301099,
    name: 'Seasonal Packaging',
    parent_id: null,
    status: 'active',
    sort_order: 40,
    image: null,
    updated_at: '2026-08-19T10:15:00+03:00',
  },
};

/** An out-of-order redelivery: older `updated_at`, conflicting name. */
export const CATEGORY_UPDATED_STALE = {
  event: 'category.updated',
  merchant: STORE_ID,
  created_at: '2026-08-19 10:20:00',
  data: {
    id: 301001,
    name: 'STALE CATEGORY NAME THAT MUST NOT WIN',
    status: 'active',
    updated_at: '2026-08-19T09:00:00+03:00',
  },
};

/**
 * A category Salla reports as inactive. Maps to `is_active = false`, NOT a
 * delete — the products in it stay reachable by their own URLs.
 */
export const CATEGORY_UPDATED_INACTIVE = {
  event: 'category.updated',
  merchant: STORE_ID,
  created_at: '2026-08-19 10:30:00',
  data: {
    id: 301009,
    name: 'Hot Drinks',
    status: 'hidden',
    updated_at: '2026-08-19T10:30:00+03:00',
  },
};

/** category.deleted — identifiers only. Deactivates rather than destroys. */
export const CATEGORY_DELETED = {
  event: 'category.deleted',
  merchant: STORE_ID,
  created_at: '2026-08-19 13:00:00',
  data: {
    id: 301099,
    name: 'Seasonal Packaging',
  },
};

/** Every field that must never reach a local-only category column. */
export const CATEGORY_UPDATED_HOSTILE = {
  event: 'category.updated',
  merchant: STORE_ID,
  created_at: '2026-08-19 14:00:00',
  data: {
    id: 301001,
    name: 'Renamed In Salla',
    status: 'active',
    updated_at: '2026-08-19T14:00:00+03:00',

    slug: 'renamed-in-salla',
    slug_en: 'renamed-in-salla',
    slug_ar: 'اسم-جديد',
    icon_key: 'hijacked-icon',
    meta_title_en: 'Hijacked',
    meta_title_ar: 'مخطوف',
    meta_description_en: 'Hijacked',
    meta_description_ar: 'مخطوف',
  },
};
