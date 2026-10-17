import { renderToStaticMarkup } from 'react-dom/server';
import { driftProducts } from './hero-drift-fixtures';
import { MIN_DRIFT_PRODUCTS } from './hero-drift-data';
import { HeroProductDrift, HeroProductMarquee } from './hero-product-drift';

/**
 * The drift's RENDER contract.
 *
 * Two things are worth a test here and the rest is CSS. The first is
 * degradation: too little data has to produce literally nothing, because a
 * decorative element that half-renders is worse than one that is absent, and
 * "nothing" is the only outcome that leaves the hero exactly as it was. The
 * second is the seamless loop, which rests on a structural invariant — the
 * track holds the tile list exactly twice — that is easy to break by editing
 * the component and impossible to notice for the ~50 seconds before the wrap.
 */

/**
 * The tile's `next/image` branch is stubbed, not exercised.
 *
 * `next/image` reaches for Next's build-time image config and its request
 * context, neither of which exists in a bare React renderer, and none of what
 * it would tell us is about this component: the drift's contract is that it
 * renders the image when `primaryImage` is set and the icon when it is not,
 * which the stub reports just as well. Every fixture here leaves
 * `primaryImage` null anyway — matching production until photography lands —
 * so the stub is only reached if someone changes that.
 */
jest.mock('next/image', () => ({
  __esModule: true,
  default: (props: { src: string }) => <img src={props.src} alt="" />,
}));

/** Tiles are `<article>`s and nothing else in this subtree is. */
function countTiles(markup: string): number {
  return markup.split('<article').length - 1;
}

describe('HeroProductDrift — degradation', () => {
  it('renders nothing at all for an empty product list', () => {
    // The path taken when /catalog/home returns no featured products, and the
    // one the hero relies on to keep its pre-drift layout.
    expect(renderToStaticMarkup(<HeroProductDrift products={[]} />)).toBe('');
  });

  it('renders nothing just below the minimum, rather than one lonely column', () => {
    const markup = renderToStaticMarkup(
      <HeroProductDrift products={driftProducts(MIN_DRIFT_PRODUCTS - 1)} />,
    );

    expect(markup).toBe('');
  });

  it('renders nothing from the mobile marquee on the same input', () => {
    // Both entry points share one gate. If they ever disagree, a phone gets a
    // marquee in a hero that has no columns — the exact broken half-state the
    // gate exists to prevent.
    expect(renderToStaticMarkup(<HeroProductMarquee products={[]} />)).toBe('');
    expect(
      renderToStaticMarkup(<HeroProductMarquee products={driftProducts(MIN_DRIFT_PRODUCTS - 1)} />),
    ).toBe('');
  });
});

describe('HeroProductDrift — the loop', () => {
  it('renders each product exactly twice, so -50% lands on the seam', () => {
    // This is the whole seamless-loop mechanism expressed as a count. The
    // animation travels -50% of the track's height; that only returns to the
    // starting image if the second half is an exact copy of the first.
    const products = driftProducts(15);
    const markup = renderToStaticMarkup(<HeroProductDrift products={products} />);

    expect(countTiles(markup)).toBe(products.length * 2);

    for (const product of products) {
      expect(markup.split(product.code).length - 1).toBe(2);
    }
  });

  it('gives every track a duration and a direction, and never leaves one unset', () => {
    const markup = renderToStaticMarkup(<HeroProductDrift products={driftProducts(15)} />);
    const durations = [...markup.matchAll(/animation-duration:\s*([\ds]+)/g)].map((m) => m[1]);

    // Three columns, three distinct durations. Equal durations would re-sync
    // the columns into one visible animation, which is what the odd numbers in
    // COLUMNS exist to prevent.
    expect(durations).toEqual(['52s', '68s', '44s']);
    expect(new Set(durations).size).toBe(durations.length);

    expect(markup).toContain('data-direction="up"');
    expect(markup).toContain('data-direction="down"');
  });

  it('duplicates the marquee list too, and caps it below the column count', () => {
    const products = driftProducts(18);
    const markup = renderToStaticMarkup(<HeroProductMarquee products={products} />);

    // 10 products × 2 copies. The phone gets a shorter loop on purpose — 36
    // tiles in the hero of the device least able to afford them.
    expect(countTiles(markup)).toBe(20);
    expect(markup).toContain('data-direction="marquee"');
  });
});

describe('HeroProductDrift — ornament, not content', () => {
  it('marks the whole subtree aria-hidden in both placements', () => {
    // Every product here is reachable with a real link from the featured rail
    // one screen down. A screen reader that announced eighteen product names
    // before the hero's call to action would be a straight usability
    // regression, so the decoration opts out of the accessibility tree.
    const products = driftProducts(15);

    expect(renderToStaticMarkup(<HeroProductDrift products={products} />)).toContain(
      'aria-hidden="true"',
    );
    expect(renderToStaticMarkup(<HeroProductMarquee products={products} />)).toContain(
      'aria-hidden="true"',
    );
  });

  it('contains no anchors — nothing in the drift is a tab stop', () => {
    // aria-hidden hides a focusable element from the accessibility tree while
    // leaving it in the tab order, which produces a focus stop that announces
    // nothing. The drift avoids that by holding no interactive elements at all.
    const markup = renderToStaticMarkup(<HeroProductDrift products={driftProducts(15)} />);

    expect(markup).not.toContain('<a ');
    expect(markup).not.toContain('<button');
  });
});
