import * as Joi from 'joi';

/**
 * Joi schema for every environment variable the API reads.
 * ConfigModule validates against this at bootstrap, so a missing or malformed
 * variable fails loudly on start rather than at the first request.
 */
export const envValidationSchema = Joi.object({
  NODE_ENV: Joi.string().valid('development', 'test', 'production').default('development'),

  // --- server ---
  API_PORT: Joi.number().port().default(4000),
  WEB_ORIGIN: Joi.string().uri().default('http://localhost:3000'),

  // --- database ---
  DATABASE_URL: Joi.string().uri({ scheme: ['postgres', 'postgresql'] }).required(),

  // --- quote requests ---
  /**
   * Salt for hashing RFQ submitters' IP addresses.
   *
   * Required, with no fallback:
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
}).unknown(true);
