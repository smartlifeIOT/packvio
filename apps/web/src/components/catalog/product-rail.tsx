import type { CatalogProductSummaryDto } from '@packvio/shared';
import { cx } from '@/lib/cx';
import { ProductCard } from './product-card';

export type ProductRailProps = {
  products: CatalogProductSummaryDto[];
  /** Accessible name for the list. */
  label: string;
  /**
   * `rail` scrolls horizontally on mobile; `grid` always wraps two-up;
   * `listing` is the full-page grid — one card per row on a phone, where a
   * two-up grid would make every image a thumbnail too small to read the code
   * off, which is all there is to look at until photography lands.
   */
  layout?: 'rail' | 'grid' | 'listing';
  /** Marks the first card's image as priority — use once per page at most. */
  prioritizeFirst?: boolean;
  className?: string;
};

/**
 * A row of product cards.
 *
 * On mobile the `rail` layout scrolls horizontally with CSS scroll snapping,
 * which shows that more products exist without stacking twelve full-width cards
 * into a wall of scrolling. `snap-start` on each item means a flick always lands
 * on a card edge rather than halfway through one.
 *
 * The scroll container has no direction-specific styling: `overflow-x` and
 * flexbox already follow the document direction, so the rail starts from the
 * right in Arabic on its own.
 */
export function ProductRail({
  products,
  label,
  layout = 'rail',
  prioritizeFirst = false,
  className,
}: ProductRailProps) {
  if (products.length === 0) return null;

  const isRail = layout === 'rail';

  return (
    <ul
      aria-label={label}
      className={cx(
        isRail
          ? [
              'flex snap-x snap-mandatory gap-4 overflow-x-auto pb-2',
              // The gutter bleed lets the first and last card sit flush with the
              // page measure while still scrolling past the container edge.
              '-mx-4 px-4 sm:-mx-6 sm:px-6',
              'md:mx-0 md:grid md:grid-cols-3 md:overflow-visible md:px-0 lg:grid-cols-4',
            ].join(' ')
          : layout === 'listing'
            ? // The catalog ladder: 1 → 2 → 3 → 4 → 5 at 600/900/1280/1600.
              // Those thresholds are the card's, not Tailwind's — a product
              // card needs ~300px before its code stops wrapping. See the
              // --breakpoint-g* tokens in globals.css.
              'grid grid-cols-1 gap-6 lg:gap-8 g2:grid-cols-2 g3:grid-cols-3 g4:grid-cols-4 g5:grid-cols-5'
            : 'grid grid-cols-2 gap-6 lg:gap-8 g3:grid-cols-3 g4:grid-cols-4',
        className,
      )}
    >
      {products.map((product, index) => (
        <li
          key={product.id}
          className={cx(isRail && 'w-[60vw] shrink-0 snap-start sm:w-[40vw] md:w-auto')}
        >
          <ProductCard
            product={product}
            priority={prioritizeFirst && index === 0}
            sizes={
              isRail
                ? '(min-width: 1024px) 25vw, (min-width: 768px) 33vw, (min-width: 640px) 40vw, 60vw'
                : layout === 'listing'
                  ? '(min-width: 1600px) 20vw, (min-width: 1280px) 25vw, (min-width: 900px) 33vw, (min-width: 600px) 50vw, 100vw'
                  : '(min-width: 1280px) 25vw, (min-width: 900px) 33vw, 50vw'
            }
          />
        </li>
      ))}
    </ul>
  );
}
