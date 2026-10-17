/**
 * Salla `product.*` webhook payloads, shaped as faithfully as the public
 * documentation and the app's own observed traffic allow.
 *
 * FIELDS WHOSE EXACT SHAPE IS NOT CONFIRMED are modelled in BOTH plausible
 * forms across these fixtures, and the mapper is written to accept either. Each
 * one is marked `SHAPE-UNCERTAIN` below and listed in the handover so it can be
 * pinned against a real delivery:
 *
 *   1. `main_image` — a bare URL string, or an object alongside `images[]`.
 *   2. `price` / `sale_price` — `{ amount, currency }`, or a bare number with
 *      the currency only at the top level.
 *   3. `updated_at` — a Laravel-style `{ date, timezone_type, timezone }`
 *      object, or a plain ISO-8601 string.
 *   4. `categories[]` — objects with `id`/`name`, or bare numeric ids.
 *   5. `quantity` — absent entirely when `unlimited_quantity` is true.
 *
 * Tokens, ids and domains are fake but keep the shape and magnitude of the real
 * thing, so nothing accidentally depends on a short string or a small integer.
 */

export const STORE_ID = 1234567890;

/**
 * product.created — the "rich" shape: nested `main_image` OBJECT, `images[]`,
 * `options[]` with values, `categories[]` as objects, money as objects, and a
 * Laravel `updated_at` object.
 *
 * SKU is `PCS/08`, which the seed already holds. Matching on it is what marries
 * Salla's catalog to the seeded 213 instead of creating a duplicate.
 */
export const PRODUCT_CREATED = {
  event: 'product.created',
  merchant: STORE_ID,
  created_at: '2026-08-19 08:00:00',
  data: {
    id: 445566778,
    sku: 'PCS/08',
    name: 'Single Wall Coffee Cup 8 oz',
    description: '<p>Single-wall paper cup for hot drinks. 230 GSM board.</p>',
    price: { amount: 42.5, currency: 'SAR' },
    sale_price: { amount: 0, currency: 'SAR' },
    quantity: 120,
    unlimited_quantity: false,
    status: 'sale',
    sku_id: 9911223,
    urls: {
      customer: 'https://packvio.salla.sa/single-wall-coffee-cup-8-oz/p445566778',
      admin: 'https://s.salla.sa/products/445566778',
    },
    // SHAPE-UNCERTAIN (1): object form.
    main_image: {
      id: 70001,
      url: 'https://cdn.salla.sa/packvio/pcs08-main.jpg',
      alt: 'Single wall coffee cup 8 oz',
      sort: 0,
      main: true,
    },
    images: [
      {
        id: 70001,
        url: 'https://cdn.salla.sa/packvio/pcs08-main.jpg',
        alt: 'Single wall coffee cup 8 oz',
        sort: 0,
        main: true,
      },
      {
        id: 70002,
        url: 'https://cdn.salla.sa/packvio/pcs08-stack.jpg',
        alt: 'Stacked cups',
        sort: 1,
        main: false,
      },
    ],
    options: [
      {
        id: 5501,
        name: 'Lid',
        type: 'radio',
        values: [
          { id: 88001, name: 'Without lid', price: { amount: 0, currency: 'SAR' } },
          { id: 88002, name: 'With flat lid', price: { amount: 6, currency: 'SAR' } },
        ],
      },
    ],
    // SHAPE-UNCERTAIN (4): object form.
    categories: [
      { id: 301001, name: 'Coffee Paper Cups' },
      { id: 301009, name: 'Hot Drinks' },
    ],
    // SHAPE-UNCERTAIN (3): Laravel object form.
    updated_at: {
      date: '2026-08-19 08:00:00.000000',
      timezone_type: 3,
      timezone: 'Asia/Riyadh',
    },
  },
};

/**
 * product.updated — the "lean" shape, exercising every alternative:
 * `main_image` as a bare URL STRING, money as bare NUMBERS, `updated_at` as an
 * ISO string, `categories` as bare ids, and one unmodelled field.
 *
 * `updated_at` is LATER than PRODUCT_CREATED's, so this one must win.
 */
export const PRODUCT_UPDATED = {
  event: 'product.updated',
  merchant: STORE_ID,
  created_at: '2026-08-19 10:30:00',
  data: {
    id: 445566778,
    sku: 'PCS/08',
    name: 'Single Wall Coffee Cup 8 oz — Kraft',
    description: 'Single-wall kraft paper cup for hot drinks.',
    // SHAPE-UNCERTAIN (2): bare numbers, currency only at the top level.
    price: 44.0,
    sale_price: 39.75,
    currency: 'SAR',
    quantity: 96,
    unlimited_quantity: false,
    status: 'sale',
    urls: { customer: 'https://packvio.salla.sa/p445566778' },
    // SHAPE-UNCERTAIN (1): bare string form.
    main_image: 'https://cdn.salla.sa/packvio/pcs08-kraft.jpg',
    images: [
      { id: 70003, url: 'https://cdn.salla.sa/packvio/pcs08-kraft.jpg', sort: 0, main: true },
      { id: 70002, url: 'https://cdn.salla.sa/packvio/pcs08-stack.jpg', sort: 1, main: false },
    ],
    // SHAPE-UNCERTAIN (4): bare ids.
    categories: [301001],
    // SHAPE-UNCERTAIN (3): ISO string form.
    updated_at: '2026-08-19T10:30:00+03:00',
    // Salla is free to add fields; a payload carrying more must still process.
    some_new_field_salla_added_later: { nested: true },
  },
};

/**
 * An OUT-OF-ORDER redelivery of the same product: identical id, an OLDER
 * `updated_at` than PRODUCT_UPDATED, and a conflicting name. The processor must
 * skip it rather than let a stale webhook overwrite fresher data.
 */
export const PRODUCT_UPDATED_STALE = {
  event: 'product.updated',
  merchant: STORE_ID,
  created_at: '2026-08-19 10:31:00',
  data: {
    id: 445566778,
    sku: 'PCS/08',
    name: 'STALE NAME THAT MUST NOT WIN',
    price: { amount: 1, currency: 'SAR' },
    quantity: 1,
    status: 'sale',
    updated_at: '2026-08-19T09:00:00+03:00',
  },
};

/**
 * A product Salla has that the seed does NOT — no matching `code`, no
 * `salla_id` locally. This is a genuinely new product and must be inserted,
 * with slugs generated locally.
 *
 * `unlimited_quantity` is true and `quantity` is absent (SHAPE-UNCERTAIN 5).
 */
export const PRODUCT_CREATED_NEW = {
  event: 'product.created',
  merchant: STORE_ID,
  created_at: '2026-08-19 11:00:00',
  data: {
    id: 445566999,
    sku: 'NEW/SALLA/001',
    name: 'Bamboo Cutlery Set',
    description: 'Disposable bamboo cutlery, boxed.',
    price: { amount: 18, currency: 'SAR' },
    sale_price: null,
    unlimited_quantity: true,
    status: 'sale',
    urls: { customer: 'https://packvio.salla.sa/bamboo-cutlery-set/p445566999' },
    main_image: { id: 70010, url: 'https://cdn.salla.sa/packvio/bamboo.jpg', main: true },
    images: [{ id: 70010, url: 'https://cdn.salla.sa/packvio/bamboo.jpg', sort: 0, main: true }],
    options: [],
    categories: [{ id: 301013, name: 'Cutlery' }],
    updated_at: '2026-08-19T11:00:00+03:00',
  },
};

/** A product Salla reports as sold out — must map to our `out_of_stock`. */
export const PRODUCT_UPDATED_OUT_OF_STOCK = {
  event: 'product.updated',
  merchant: STORE_ID,
  created_at: '2026-08-19 12:00:00',
  data: {
    id: 445566780,
    sku: 'PCS/12',
    name: 'Single Wall Coffee Cup 12 oz',
    price: { amount: 48, currency: 'SAR' },
    quantity: 0,
    unlimited_quantity: false,
    status: 'out',
    updated_at: '2026-08-19T12:00:00+03:00',
  },
};

/** Salla `hidden` → our `hidden`. Not a delete: the row stays resolvable. */
export const PRODUCT_UPDATED_HIDDEN = {
  event: 'product.updated',
  merchant: STORE_ID,
  created_at: '2026-08-19 12:05:00',
  data: {
    id: 445566781,
    sku: 'DCL/08B',
    name: 'Dome Lid 8 oz Black',
    price: { amount: 12, currency: 'SAR' },
    status: 'hidden',
    updated_at: '2026-08-19T12:05:00+03:00',
  },
};

/**
 * A product with NO price at all. Null must stay null — a missing price is not
 * a free product, and writing 0 would make the site advertise one.
 */
export const PRODUCT_UPDATED_NO_PRICE = {
  event: 'product.updated',
  merchant: STORE_ID,
  created_at: '2026-08-19 12:10:00',
  data: {
    id: 445566782,
    sku: 'WT-KS508',
    name: 'Cup Sleeve Smooth Ripple',
    price: null,
    sale_price: null,
    status: 'sale',
    updated_at: '2026-08-19T12:10:00+03:00',
  },
};

/**
 * product.deleted — Salla sends only the identifiers. Must SOFT delete: a
 * historical quote request may still reference the row.
 */
export const PRODUCT_DELETED = {
  event: 'product.deleted',
  merchant: STORE_ID,
  created_at: '2026-08-19 13:00:00',
  data: {
    id: 445566778,
    sku: 'PCS/08',
    name: 'Single Wall Coffee Cup 8 oz — Kraft',
  },
};

/**
 * A FULL Salla payload whose every field collides with a local-only column.
 *
 * Salla cannot send `slug`, `is_featured` or `fulfilment_mode` — but a future
 * Salla release, or a metafield, could. This fixture asserts the allowlist is
 * doing the work rather than the absence of the fields: if the mapper ever
 * starts copying unknown keys through, this is the test that catches it.
 */
export const PRODUCT_UPDATED_HOSTILE = {
  event: 'product.updated',
  merchant: STORE_ID,
  created_at: '2026-08-19 14:00:00',
  data: {
    id: 445566778,
    sku: 'PCS/08',
    name: 'Renamed In Salla',
    price: { amount: 50, currency: 'SAR' },
    status: 'sale',
    updated_at: '2026-08-19T14:00:00+03:00',

    // None of the following may reach the database.
    slug: 'renamed-in-salla',
    slug_en: 'renamed-in-salla',
    slug_ar: 'اسم-جديد',
    is_featured: true,
    featured: true,
    supports_custom_printing: false,
    fulfilment_mode: 'cart',
    sort_order: 999,
    meta_title: 'Hijacked meta title',
    meta_title_en: 'Hijacked meta title',
    meta_title_ar: 'عنوان مخطوف',
    meta_description: 'Hijacked meta description',
    meta_description_en: 'Hijacked meta description',
    meta_description_ar: 'وصف مخطوف',
    price_tiers: [{ min_quantity: 10, unit_price: 1 }],
    code: 'HIJACKED/CODE',
  },
};
