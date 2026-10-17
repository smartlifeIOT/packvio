import type { ReactNode } from 'react';
import { cx } from '@/lib/cx';
import { Watermark } from './watermark';

export type ProductPanelRatio = 'square' | 'portrait' | 'landscape' | 'auto';

const RATIO_CLASSES: Record<ProductPanelRatio, string> = {
  square: 'aspect-square',
  portrait: 'aspect-[3/4]',
  landscape: 'aspect-[4/3]',
  auto: '',
};

export type ProductPanelProps = {
  /** The product image (or any node) to sit on the tinted panel. */
  children: ReactNode;
  ratio?: ProductPanelRatio;
  /** Watermark opacity, 0–1. The printed catalog sits around 3–5%. */
  watermarkOpacity?: number;
  /** Drop the P-mark wash entirely. */
  hideWatermark?: boolean;
  /** Content rendered over the panel on the inline-start top corner, e.g. a Badge. */
  overlay?: ReactNode;
  className?: string;
};

/**
 * The signature Packvio device: a panel-tinted rounded surface carrying a
 * product shot, with the "P" mark washed in behind it and a hairline inner edge.
 *
 * This is what makes the site read as continuous with the printed catalog, so
 * the three ingredients are not optional decoration:
 *   1. --color-panel fill (#EAF4FB)
 *   2. inset 1px --color-panel-edge hairline (`panel-inset`) — a printed border,
 *      not a drop shadow
 *   3. the P mark at 3–5% opacity
 */
export function ProductPanel({
  children,
  ratio = 'square',
  watermarkOpacity = 0.04,
  hideWatermark = false,
  overlay,
  className,
}: ProductPanelProps) {
  return (
    <div
      className={cx(
        'relative isolate overflow-hidden rounded-lg bg-panel panel-inset',
        RATIO_CLASSES[ratio],
        className,
      )}
    >
      {!hideWatermark && (
        <Watermark opacity={watermarkOpacity} position="end-bottom" size={280} />
      )}

      <div className="relative z-10 flex h-full w-full items-center justify-center p-md">
        {children}
      </div>

      {overlay && <div className="absolute start-3 top-3 z-20">{overlay}</div>}
    </div>
  );
}
