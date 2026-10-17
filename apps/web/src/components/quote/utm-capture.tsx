'use client';

import { useEffect } from 'react';
import { captureUtm } from '@/lib/utm';

/**
 * Records the campaign parameters of whatever page the visitor landed on.
 *
 * Mounted in the layout so it runs on EVERY entry point — a paid link is as
 * likely to point at a product page or a category as at the home page, and
 * capturing only on `/` would miss most of the spend it is meant to measure.
 *
 * Renders nothing and reads `window.location.search` directly rather than
 * `useSearchParams()`: the hook opts the whole subtree into client-side
 * rendering, which for a component that draws nothing would cost the layout its
 * static shell to record a string.
 */
export function UtmCapture() {
  useEffect(() => {
    captureUtm(window.location.search);
  }, []);

  return null;
}
