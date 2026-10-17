'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { cx } from '@/lib/cx';

/**
 * Sticky header wrapper that gains a shadow once the page has scrolled.
 *
 * Split out as the only client component in the header chrome so the header
 * itself can stay a server component and render its links and labels without
 * shipping them to the browser.
 *
 * The scroll listener is passive — it never calls preventDefault, and marking it
 * so keeps it off the main thread's scroll-blocking path. The state only flips
 * at the 0/non-0 boundary, so a long scroll causes exactly one re-render.
 */
export function HeaderShell({ children }: { children: ReactNode }) {
  const [isScrolled, setIsScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setIsScrolled(window.scrollY > 4);
    onScroll(); // A refresh mid-page must not start with a flat header.
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <header
      className={cx(
        'sticky top-0 z-40 bg-surface transition-shadow duration-200',
        isScrolled ? 'shadow-card' : 'border-b border-border',
      )}
    >
      {children}
    </header>
  );
}
