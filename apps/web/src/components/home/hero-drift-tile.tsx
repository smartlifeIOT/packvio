import Image from 'next/image';
import type { CatalogProductSummaryDto } from '@packvio/shared';
import { categoryIcon } from '@/components/icons/categories';
import { cx } from '@/lib/cx';

export type HeroDriftTileProps = {
  product: CatalogProductSummaryDto;
  /**
   * Fixed icon size in px. Only the mobile marquee sets it — the column tiles
   * leave it undefined and scale the icon with CSS instead, so one rendered DOM
   * serves both the tablet and desktop breakpoints.
   */
  iconSize?: number;
  className?: string;
};

/**
 * One tile in the hero drift.
 *
 * TRANSLUCENT, not the opaque panel tint. A `bg-panel` rectangle on the purple
 * gradient reads as a screenshot pasted onto the hero — the tint was designed
 * to sit on white. 8% white with a 12% white hairline lets the gradient and the
 * cyan bloom show through, so the tiles feel embedded in the hero rather than
 * placed on top of it.
 *
 * THE IMAGE PATH IS ALREADY WIRED. Every product's `primaryImage` is null today
 * (there is no photography yet), so every tile renders its category icon. When
 * photos land the same component starts rendering them with no change here and
 * none at the call site — which is the point of branching on the data rather
 * than on a flag.
 */
export function HeroDriftTile({ product, iconSize, className }: HeroDriftTileProps) {
  const CategoryIcon = categoryIcon(product.primaryCategory?.slug ?? '');
  const image = product.primaryImage;

  return (
    <article
      className={cx(
        'flex flex-col gap-3 rounded-lg border border-surface/12 bg-surface/8 p-4',
        // backdrop-blur is deliberately absent: it forces a separate compositor
        // layer per tile and, on a moving track, repaints the blur every frame.
        // The translucency alone gives the effect at none of the cost.
        className,
      )}
    >
      {/*
        Fixed aspect box, so the icon branch and the image branch occupy exactly
        the same space and nothing reflows on the day photography lands.

        (The loop itself does not require uniform tile heights — the track holds
        the list twice, so the two halves are equal by construction whatever the
        individual tiles measure. What it does require is that spacing comes
        from a per-tile margin rather than a flex `gap`; see globals.css.)
      */}
      <div className="relative flex aspect-[4/3] w-full items-center justify-center overflow-hidden rounded-md bg-surface/6">
        {image ? (
          <Image
            src={image.url}
            alt=""
            fill
            sizes="(min-width: 1024px) 15vw, (min-width: 640px) 22vw, 45vw"
            /*
              ALWAYS lazy, even in the initial viewport, and never `priority`.
              This is ornamental duplicated content sitting next to the LCP
              element; letting one of these compete for the LCP slot — or for
              bandwidth during the headline's paint — is exactly the regression
              this whole component has to avoid. `fill` inside a fixed-ratio box
              means the space is reserved before the bytes arrive, so lazy
              loading costs no layout stability.
            */
            loading="lazy"
            className="object-contain"
          />
        ) : (
          /*
            `size` is only passed by the marquee. Otherwise the icon is sized in
            CSS — 36px on tablet, 48px from lg — because the same DOM serves
            both breakpoints and a JS-chosen size would need a second render of
            the whole column set to change.
          */
          <CategoryIcon
            size={iconSize}
            className={cx(
              'text-brand-cyan/70',
              iconSize === undefined && 'size-9 lg:size-12',
            )}
          />
        )}
      </div>

      <div className="min-w-0">
        <p
          className="text-body-sm font-medium text-surface/90"
          style={{
            // Two lines, then ellipsis. A fixed `line-clamp-2` utility would do
            // it, but writing it out keeps the two-line cap next to the reason
            // for it: a name allowed to run to four lines would make one column
            // visibly taller than its neighbours and break the depth illusion.
            display: '-webkit-box',
            WebkitBoxOrient: 'vertical',
            WebkitLineClamp: 2,
            overflow: 'hidden',
            /*
              Two lines are RESERVED, not merely permitted — `minHeight` as well
              as the clamp.
              Without it a one-line name becomes a two-line name the moment the
              Arabic webfont swaps in, the tile grows, the track grows, and every
              tile below it moves: a measured 23px of travel across 36 tiles,
              which is layout shift charged to an element that is pure ornament.
              Reserving the second line costs a few pixels of empty space under
              the short names and makes the tiles a uniform height, which the
              columns wanted anyway.
            */
            minHeight: '2lh',
          }}
        >
          {product.name}
        </p>

        {/*
          ONE LINE, ALWAYS — `truncate`, not because long codes are common but
          because a wrapping one costs a layout shift.

          JetBrains Mono keeps next/font's synthesised fallback (Arial at
          `size-adjust: 134.59%`, so 35% wider than the real face), and in a
          narrow column that is the difference between a code fitting and not:
          measured at 1280px, `TC-170-PS-SPN-W` set on two lines until the
          webfont arrived and then collapsed to one, taking 21px off the tile and
          pulling every tile below it up with it.

          Unlike the Arabic body face this fallback is FINE — the codes are Latin,
          which Arial has — so the fix belongs here rather than in the font stack.
          A SKU that wraps mid-token reads as broken anyway; clipping it is both
          the stable answer and the better-looking one.
        */}
        <p className="bidi-latin mt-1 truncate font-mono text-caption text-brand-cyan/80">
          {product.code}
        </p>
      </div>
    </article>
  );
}
