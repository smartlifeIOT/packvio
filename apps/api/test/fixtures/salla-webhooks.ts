/**
 * Real-shaped Salla webhook payloads. Token values are obviously fake but keep
 * the length and character set of the real thing, so nothing accidentally
 * depends on a short string.
 */

export const APP_STORE_AUTHORIZE = {
  event: 'app.store.authorize',
  merchant: 1234567890,
  created_at: '2026-08-18 09:15:22',
  data: {
    access_token: 'ory_at_TESTONLY_0f8c1d2e3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b',
    expires_in: 1209600,
    refresh_token: 'ory_rt_TESTONLY_9e8d7c6b5a4f3e2d1c0b9a8f7e6d5c4b3a2f1e0d9c8b7a6f',
    scope: 'offline_access settings.read products.read_write orders.read',
    token_type: 'bearer',
    merchant: {
      id: 1234567890,
      username: 'packvio',
      name: 'Packvio',
      domain: 'https://packvio.salla.sa',
    },
  },
};

export const APP_INSTALLED = {
  event: 'app.installed',
  merchant: 1234567890,
  created_at: '2026-08-18 09:15:20',
  data: {
    id: 998877,
    app_name: 'Packvio Site Sync',
    app_description: 'Mirrors the Salla catalog into the Packvio website.',
    installation_date: '2026-08-18 09:15:20',
  },
};

export const APP_UNINSTALLED = {
  event: 'app.uninstalled',
  merchant: 1234567890,
  created_at: '2026-08-20 11:02:41',
  data: {
    id: 998877,
    app_name: 'Packvio Site Sync',
    uninstallation_date: '2026-08-20 11:02:41',
  },
};

/** A catalog event — must be stored and left pending by this task. */
export const PRODUCT_UPDATED = {
  event: 'product.updated',
  merchant: 1234567890,
  created_at: '2026-08-18 10:30:00',
  data: {
    id: 445566778,
    sku: 'PCS/08',
    name: 'Single Wall Coffee Cup 8 oz',
    price: { amount: 42.5, currency: 'SAR' },
    quantity: 120,
    status: 'sale',
    // A field we do not model — the receiver must not reject a payload for
    // carrying more than we asked for.
    some_new_field_salla_added_later: { nested: true },
  },
};
