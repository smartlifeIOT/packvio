'use client';

import { useEffect, useRef, type ReactNode } from 'react';
import { cx } from '@/lib/cx';

export type DriftViewportProps = {
  children: ReactNode;
  className?: string;
};

/**
 * Pauses the drift when the hero is off screen.
 *
 * THE OBSERVER NEVER POSITIONS ANYTHING. All it does is set
 * `data-paused="true|false"` on this element; CSS turns that into
 * `animation-play-state: paused` and drops `will-change`. Driving position from
 * JS — the obvious alternative — would put the animation on the main thread,
 * make it stutter whenever React is busy, and re-introduce exactly the
 * jank this component's CSS-only design exists to avoid.
 *
 * Pausing off screen is not a micro-optimisation: an infinite compositor
 * animation keeps the GPU waking to render frames nobody can see, which on a
 * laptop is measurable battery for zero benefit. Browsers throttle animations
 * in background TABS, but not ones merely scrolled out of view in the
 * foreground.
 *
 * Starts UNPAUSED so the server HTML and the first client render agree; the
 * observer corrects it on the first callback, which fires immediately on
 * observe.
 */
export function DriftViewport({ children, className }: DriftViewportProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;

    // No IntersectionObserver (very old browsers, some test runners): leave it
    // running. A drift that never pauses is a far smaller problem than one that
    // never starts.
    if (typeof IntersectionObserver === 'undefined') return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        node.dataset.paused = entry?.isIntersecting ? 'false' : 'true';
      },
      // A sliver visible is enough to keep it running: pausing while the hero
      // is still partly on screen would be visible as a stop.
      { threshold: 0 },
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={ref} data-paused="false" className={cx('drift', className)}>
      {children}
    </div>
  );
}
