import { cx } from '@/lib/cx';

export type WatermarkPosition = 'center' | 'start-top' | 'start-bottom' | 'end-top' | 'end-bottom';

/**
 * Positions use inset-inline-start / inset-inline-end (Tailwind `start-*` /
 * `end-*`), so "end-bottom" is the bottom-right corner in English and the
 * bottom-left corner in Arabic.
 */
const POSITION_CLASSES: Record<WatermarkPosition, string> = {
  center: 'inset-0 flex items-center justify-center',
  'start-top': 'start-0 top-0 -translate-y-1/4',
  'start-bottom': 'start-0 bottom-0 translate-y-1/4',
  'end-top': 'end-0 top-0 -translate-y-1/4',
  'end-bottom': 'end-0 bottom-0 translate-y-1/4',
};

export type WatermarkProps = {
  /** 0–1. The catalog uses 3–5% on product panels. */
  opacity?: number;
  /** Rendered width in px. Height follows the 1:1 viewBox. */
  size?: number;
  position?: WatermarkPosition;
  className?: string;
};

/**
 * The Packvio "P" mark as a decorative background wash. Purely presentational —
 * hidden from assistive tech and non-interactive.
 */
export function Watermark({
  opacity = 0.04,
  size = 320,
  position = 'end-bottom',
  className,
}: WatermarkProps) {
  return (
    <div
      aria-hidden="true"
      className={cx('pointer-events-none absolute select-none', POSITION_CLASSES[position], className)}
      style={{ opacity }}
    >
      {/* Plain <img>: the mark is decorative, fixed-size and already an SVG, so
          next/image would add a wrapper and an optimizer hop for no benefit. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/brand/packvio-mark.svg" alt="" width={size} height={size} draggable={false} />
    </div>
  );
}
