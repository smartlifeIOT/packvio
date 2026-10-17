/**
 * Path prefix every seeded product image is served from.
 *
 * It lives in a module of its own because two very different places need it and
 * neither should drag the other in: the seed, which writes these rows, and the
 * Salla mapper, which must refuse to delete them. A seeded image is identified
 * by this prefix AND a null `salla_id` — a picture later uploaded to Salla gets
 * a real id and stops being the seed's business.
 */
export const SEEDED_IMAGE_PREFIX = '/products/';
