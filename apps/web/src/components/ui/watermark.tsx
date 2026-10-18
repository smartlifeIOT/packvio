import { cx } from '@/lib/cx';

/**
 * Width ÷ height of public/brand/packvio-mark.webp (300 × 487).
 *
 * Declared rather than inferred: the file is raster, so nothing at build time
 * would catch a mismatch, and the symptom of getting it wrong — a subtly
 * squashed mark at 4% opacity behind a product photo — is close to invisible
 * until someone turns the opacity up. Re-measure if the mark is re-exported.
 */
const MARK_ASPECT = 300 / 487;

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
      className={cx(
        'pointer-events-none absolute select-none',
        POSITION_CLASSES[position],
        className,
      )}
      style={{ opacity }}
    >
      {/* `size` is the HEIGHT, and the width follows the mark's own 0.6156:1
          ratio. The placeholder this replaced was square, so passing `size` to
          both was harmless; the real mark is noticeably taller than it is wide
          and a square box would squash it by 38%. `size` keeps its meaning —
          the largest dimension — so no caller had to change. */}
      {/* eslint-disable-next-line @next/next/no-img-element -- decorative,
          fixed-size; next/image would add a wrapper and an optimizer hop. */}
      <img
        src="/brand/packvio-mark.webp"
        alt=""
        width={Math.round(size * MARK_ASPECT)}
        height={size}
        draggable={false}
      />
    </div>
  );
}
