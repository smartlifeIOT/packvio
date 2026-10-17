import * as Joi from 'joi';

/**
 * Joi schema for every environment variable the API reads.
 * ConfigModule validates against this at bootstrap, so a missing or malformed
 * variable fails loudly on start rather than at the first request.
 *
 * Salla credentials are optional for now — the integration lands in a later
 * task — but they are declared here so the shape is documented in one place.
 */
export const envValidationSchema = Joi.object({
  NODE_ENV: Joi.string().valid('development', 'test', 'production').default('development'),

  // --- server ---
  API_PORT: Joi.number().port().default(4000),
  WEB_ORIGIN: Joi.string().uri().default('http://localhost:3000'),

  // --- database ---
  DATABASE_URL: Joi.string().uri({ scheme: ['postgres', 'postgresql'] }).required(),

  // --- Salla integration ---
  SALLA_CLIENT_ID: Joi.string().allow('').default(''),
  SALLA_CLIENT_SECRET: Joi.string().allow('').default(''),
  SALLA_WEBHOOK_SECRET: Joi.string().allow('').default(''),
  SALLA_API_BASE: Joi.string().uri().default('https://api.salla.dev/admin/v2'),
  SALLA_OAUTH_TOKEN_URL: Joi.string().uri().default('https://accounts.salla.sa/oauth2/token'),

  /**
   * Which language the Salla store's product content is written in.
   *
   * Salla returns one language per request, so this decides whether a sync
   * writes `name_ar` or `name_en` — and, just as importantly, which one it
   * leaves alone. Defaults to `ar`: the store is Saudi and Arabic is the site's
   * primary locale, so that is the column most likely to be authoritative.
   */
  SALLA_STORE_LOCALE: Joi.string().valid('ar', 'en').default('ar'),

  /**
   * AES-256 key for encrypting OAuth tokens at rest. Required, with no plaintext
   * fallback — a missing key must stop the process, not quietly downgrade the
   * storage of a credential that can read and write a live storefront.
   */
  SALLA_TOKEN_ENC_KEY: Joi.string()
    .required()
    .custom((value: string, helpers) => {
      if (!/^[A-Za-z0-9+/]+={0,2}$/.test(value)) return helpers.error('any.invalid');
      if (Buffer.from(value, 'base64').length !== 32) return helpers.error('any.invalid');
      return value;
    })
    .messages({
      'any.required':
        'SALLA_TOKEN_ENC_KEY is required — Salla tokens are encrypted at rest and there is no plaintext fallback. Generate one with: openssl rand -base64 32',
      'any.invalid':
        'SALLA_TOKEN_ENC_KEY must be base64 that decodes to exactly 32 bytes. Generate one with: openssl rand -base64 32',
    }),

  /** Shared secret for the /admin/* operational endpoints. Blank = endpoints locked. */
  ADMIN_API_KEY: Joi.string().allow('').default(''),

  /**
   * Salt for hashing RFQ submitters' IP addresses.
   *
   * Required, with no fallback, for the same reason SALLA_TOKEN_ENC_KEY is:
   * an UNSALTED hash of an IP is not anonymisation. There are only ~4.3 billion
   * IPv4 addresses, so a plain sha256 of one is reversed by exhausting the
   * space in minutes on a laptop. The salt is what makes `ip_hash` a column we
   * can justify keeping under PDPL rather than personal data wearing a
   * disguise. 32+ chars so it cannot itself be brute-forced alongside the IP.
   */
  QUOTE_IP_HASH_SALT: Joi.string()
    .min(32)
    .required()
    .messages({
      'any.required':
        'QUOTE_IP_HASH_SALT is required — RFQ submitter IPs are stored as salted hashes and an unsalted IP hash is trivially reversible. Generate one with: openssl rand -base64 32',
      'string.min':
        'QUOTE_IP_HASH_SALT must be at least 32 characters. Generate one with: openssl rand -base64 32',
    }),

  /** RFQ submissions allowed per IP per hour. */
  QUOTE_RATE_LIMIT: Joi.number().integer().min(1).default(5),

  // --- on-demand ISR revalidation of the Next.js site ---
  REVALIDATE_SECRET: Joi.string().allow('').default(''),
  NEXT_PUBLIC_SITE_URL: Joi.string().uri().default('http://localhost:3000'),
}).unknown(true);
