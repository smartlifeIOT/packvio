/**
 * Whether Next's image optimiser can serve this URL.
 *
 * The optimiser only fetches local paths and the hosts listed in
 * `images.remotePatterns` (next.config.ts). Anything else comes back as a 400,
 * and the reader sees a broken image with its alt text — which is exactly how
 * the first synced Salla products looked: their photos lived on a host the
 * config did not list.
 *
 * So a product photo from an UNLISTED host is rendered `unoptimized` instead —
 * the browser fetches it directly. Slightly heavier bytes, but a real picture
 * rather than a broken one. Keep SALLA_IMAGE_HOST_SUFFIXES in step with
 * next.config.ts.
 */
export const SALLA_IMAGE_HOST_SUFFIXES = ['salla.sa', 'salla.network'] as const;

export function canOptimizeImage(src: string): boolean {
  if (src.startsWith('/')) return true;
  let host: string;
  try {
    host = new URL(src).hostname;
  } catch {
    return false;
  }
  return SALLA_IMAGE_HOST_SUFFIXES.some(
    (suffix) => host === suffix || host.endsWith(`.${suffix}`),
  );
}
