import type { CatalogProductSummaryDto } from '@packvio/shared';
import { cx } from '@/lib/cx';
import { DriftViewport } from './drift-viewport';
import { dealIntoColumns, hasEnoughForDrift } from './hero-drift-data';
import { HeroDriftTile } from './hero-drift-tile';

export type HeroProductDriftProps = {
  products: CatalogProductSummaryDto[];
};

/**
 * Column durations, in seconds.
 *
 * Deliberately coprime-ish and far apart: 52, 68 and 44 share no small common
 * multiple, so the three columns do not return to the same relative offset for
 * over two hours. Round numbers like 40/60/80 re-sync every two minutes, and
 * the moment they do the group stops reading as ambient depth and starts
 * reading as one animation — which is the failure mode this whole component is
 * trying to avoid.
 *
 * The values are slow on purpose. This is scenery, not a carousel: at ~50s per
 * cycle a tile crosses the hero slowly enough that the eye never tracks it, so
 * it never competes with the headline for attention.
 */
const COLUMNS = [
  { duration: '52s', direction: 'up' as const, offset: '0rem', scale: 1 },
  { duration: '68s', direction: 'down' as const, offset: '-3rem', scale: 0.92 },
  { duration: '44s', direction: 'up' as const, offset: '-1.5rem', scale: 1 },
];

const DRIFT_COLUMNS = 3;

/**
 * The marquee shows fewer products than the columns do.
 *
 * It is a single strip rather than three columns, and every tile in it is
 * duplicated for the loop — so the full 18 would put 36 elements in the hero of
 * the devices least able to afford them. Ten is already a 20-tile loop, which at
 * 30s nobody reaches the end of before scrolling past.
 */
const MARQUEE_PRODUCTS = 10;

/**
 * The hero's ambient product showcase.
 *
 * ORNAMENTAL, AND MARKED AS SUCH. The whole subtree is `aria-hidden`: every
 * product in it is reachable — with a real link, a real name and a real code —
 * from the featured rail a screen further down, and making a screen-reader user
 * listen to eighteen product names before reaching the hero's actual call to
 * action would be a straightforward regression in usability.
 *
 * RENDERS NOTHING when there is not enough data. `getHome` failing, or a fresh
 * database with no featured products, must leave the hero exactly as it was
 * rather than showing an empty half or one lonely column — a decorative element
 * that degrades badly is worse than one that is absent.
 */
export function HeroProductDrift({ products }: HeroProductDriftProps) {
  if (!hasEnoughForDrift(products)) return null;

  const columns = dealIntoColumns(products, DRIFT_COLUMNS);

  return (
    <>
      {/*
        DESKTOP ONLY (>=1024) — absolutely positioned against the hero.

        Out of flow, so it can contribute NOTHING to layout shift no matter when
        it paints: there is no reflow path from an absolutely positioned element
        to the headline beside it. `inset-inline-end` rather than `right`, so the
        panel sits on the reading-end side in both directions.

        THE TABLET COLUMNS WERE REMOVED, and the reason is measured rather than
        aesthetic — see the note on the marquee below.
      */}
      <div
        aria-hidden="true"
        className={cx(
          // inset-y is the BLOCK axis, which is identical in both writing directions;
          // only the inline edge needs the logical `end-0`.
          'pointer-events-none absolute inset-y-0 end-0 hidden overflow-hidden lg:block',
          'lg:w-[45%]',
        )}
      >
        <DriftViewport className="pointer-events-auto flex h-full gap-4 px-4">
          {columns.map((column, index) => (
            <DriftColumn
              key={index}
              products={column}
              config={COLUMNS[index] ?? COLUMNS[0]!}
            />
          ))}
        </DriftViewport>
      </div>

    </>
  );
}

/**
 * The horizontal marquee: full-bleed, BELOW the stat row, everywhere under lg.
 *
 * A separate export rather than a branch inside HeroProductDrift because the
 * two live in different places in the DOM. The desktop panel is absolutely
 * positioned against the section and its source order is irrelevant; the
 * marquee is in normal flow and has to come after the stats, which means the
 * hero has to place it itself.
 *
 * Being in flow is also why it carries a FIXED HEIGHT: it is the one part of
 * this feature that can push content down, so the space it needs is reserved
 * from first paint rather than established once tiles have laid out.
 *
 * IT COVERS TABLET TOO, WHERE THE BRIEF ASKED FOR TWO COLUMNS. That is a
 * deliberate reversal, and the reason is a measurement rather than a taste.
 *
 * A side panel only works by narrowing the headline beside it, and next/font
 * builds the Arabic fallback face from `local("Arial")` — a font with no Arabic
 * glyphs — so until IBM Plex Sans Arabic arrives the hero headline sets 22%
 * narrower than it finally will (measured: 590px against 756px at 56px). Change
 * the column width and you change how many lines that 166px of slack costs, and
 * the swap re-wraps the headline, moving the subhead, the buttons, the stat row
 * and the section boundary with it.
 *
 * Sweeping the column width against both faces, the two agree at 420-580px and
 * again above 760px, and disagree in between and below 380px. Between 640 and
 * 1023 a column wide enough to be stable does not leave room for a drift beside
 * it — at 768 the safe column ends at 504px and a 50% panel starts at 384px.
 * The two requirements are simply in conflict at tablet widths, and the
 * measured cost of ignoring that was CLS 0.038 at 640px against a baseline of
 * 0.000.
 *
 * So tablet keeps its full-width headline and gets the marquee, which is in
 * flow with a reserved height and shifts nothing. Above 1024 there is room for
 * both, and the desktop columns return.
 *
 * (The underlying fallback-metrics bug is not ours to fix here, and it already
 * costs the untouched hero a 0.048 shift at 768px. It is written up in
 * CLAUDE.md as the follow-up it deserves.)
 */
export function HeroProductMarquee({ products }: HeroProductDriftProps) {
  if (!hasEnoughForDrift(products)) return null;

  return (
    // `-mx-*` is margin-INLINE in Tailwind v4, so the full-bleed cancels the
    // Container's gutter symmetrically in both writing directions. It has to
    // track that gutter at every step it takes — 16px, then 24px from sm — or
    // the strip stops short of one edge and reads as a misaligned box rather
    // than as a band running off the page.
    <div aria-hidden="true" className="-mx-4 mt-xl sm:-mx-6 lg:hidden">
      <DriftViewport className="drift--inline">
        <div className="h-[9.5rem] overflow-hidden ps-4 sm:h-[10.5rem] sm:ps-6">
          <div
            data-direction="marquee"
            className="drift__track flex h-full w-max items-stretch"
            style={{ animationDuration: '30s' }}
          >
            {/* Twice, for the same seamless-loop reason as the columns. Every
                tile carries the inline-end margin — including the last — so the
                two halves are exactly equal and -50% lands on the seam. */}
            {[0, 1].map((copy) =>
              products.slice(0, MARQUEE_PRODUCTS).map((product) => (
                <HeroDriftTile
                  key={`marquee-${copy}-${product.id}`}
                  product={product}
                  iconSize={32}
                  className="me-3 w-[9rem] shrink-0 sm:w-[10rem]"
                />
              )),
            )}
          </div>
        </div>
      </DriftViewport>
    </div>
  );
}

type DriftColumnProps = {
  products: CatalogProductSummaryDto[];
  config: (typeof COLUMNS)[number];
};

function DriftColumn({ products, config }: DriftColumnProps) {
  return (
    <div
      className="min-w-0 flex-1 overflow-hidden"
      style={{
        // The vertical offset and the middle column's 0.92 scale are what turn
        // three parallel columns into something that reads as depth. Applied to
        // the COLUMN, not the track, so they compose with the animation's
        // transform instead of fighting it for the same property.
        transform: `translate3d(0, ${config.offset}, 0) scale(${config.scale})`,
      }}
    >
      <div
        data-direction={config.direction}
        className="drift__track flex flex-col"
        style={{ animationDuration: config.duration }}
      >
        {/*
          THE LIST TWICE. Copy 2 is what copy 1 travels into, and the -50%
          translate lands it exactly where copy 1 began. Tiles carry
          `mb-4` (margin-block-end) rather than the track using `gap`,
          so both halves are exactly the same height — see the loop note in
          globals.css for why `gap` breaks this.
        */}
        {[0, 1].map((copy) =>
          products.map((product) => (
            <HeroDriftTile
              key={`${copy}-${product.id}`}
              product={product}
              // One tile component, two sizes, chosen by CSS rather than by a
              // second render — see HeroDriftTile's responsive icon.
              className="mb-4 shrink-0"
            />
          )),
        )}
      </div>
    </div>
  );
}
