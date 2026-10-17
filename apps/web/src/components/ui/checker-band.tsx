import type { CSSProperties } from 'react';
import { cx } from '@/lib/cx';

export type CheckerTone = 'cyan' | 'purple' | 'panel';

const TONE_COLOURS: Record<CheckerTone, string> = {
  cyan: 'var(--color-brand-cyan)',
  purple: 'var(--color-brand-purple)',
  panel: 'var(--color-panel-edge)',
};

export type CheckerBandProps = {
  tone?: CheckerTone;
  /** Band height in px. Squares are half this, giving two rows. */
  height?: number;
  className?: string;
};

/**
 * The catalog's checkerboard section divider.
 *
 * Pure CSS, no image: two repeating-linear-gradients on the inline axis, one
 * offset by a square on the block axis, which produces a true two-row
 * checkerboard rather than stripes. A checkerboard is symmetric, so it needs no
 * direction handling.
 */
export function CheckerBand({ tone = 'cyan', height = 12, className }: CheckerBandProps) {
  const square = height / 2;
  const colour = TONE_COLOURS[tone];

  const style: CSSProperties = {
    height: `${height}px`,
    backgroundImage: [
      `repeating-linear-gradient(90deg, ${colour} 0 ${square}px, transparent ${square}px ${square * 2}px)`,
      `repeating-linear-gradient(90deg, transparent 0 ${square}px, ${colour} ${square}px ${square * 2}px)`,
    ].join(', '),
    backgroundSize: `100% ${square}px, 100% ${square}px`,
    backgroundPosition: `0 0, 0 ${square}px`,
    backgroundRepeat: 'repeat-x, repeat-x',
  };

  return <div aria-hidden="true" className={cx('w-full', className)} style={style} />;
}
