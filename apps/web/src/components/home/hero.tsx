import { getTranslations } from 'next-intl/server';
import { ArrowRight, FileText } from 'lucide-react';
import type { CatalogProductSummaryDto, CatalogStatsDto, Locale } from '@packvio/shared';
import { Button, Container, Icon, Watermark } from '@/components/ui';
import { cx } from '@/lib/cx';
import { formatNumber } from '@/lib/format';
import { hasEnoughForDrift } from './hero-drift-data';
import { HeroProductDrift, HeroProductMarquee } from './hero-product-drift';

export type HeroProps = {
  locale: Locale;
  stats: CatalogStatsDto;
  /**
   * Products for the ambient drift. Pass an empty array (or too few) and the
   * hero renders exactly as it did before the drift existed — see
   * HeroProductDrift.
   */
  driftProducts?: CatalogProductSummaryDto[];
};

/**
 * Home hero.
 *
 * A purple gradient with the P-mark washed into it rather than a stock
 * photograph — deliberately. There is no Packvio product photography yet, and a
 * generic warehouse or coffee-cup stock shot would be the one element on the
 * page that visibly belongs to someone else's brand. The gradient is the brand's
 * own material, so it will still be right when real photography arrives.
 *
 * Everything here is sized in `rem`/`ch`, with no image to load, so the section
 * cannot shift once the fonts settle.
 */
export async function Hero({ locale, stats, driftProducts = [] }: HeroProps) {
  const t = await getTranslations({ locale, namespace: 'home.hero' });

  /**
   * Decided ONCE, here, and used to size the text column.
   *
   * The text has to narrow to make room for the drift — but only when the
   * drift is actually there. Narrowing unconditionally would leave the
   * degraded hero with a 52%-wide headline and half the section empty, which
   * is a worse layout than the one this feature started from.
   */
  const showDrift = hasEnoughForDrift(driftProducts);

  return (
    <section className="relative isolate overflow-hidden bg-brand-purple text-surface">
      {/* Depth without an image: a soft cyan bloom on the inline-end side. */}
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-[radial-gradient(120%_120%_at_85%_0%,rgba(79,192,223,0.35)_0%,transparent_55%)]"
      />
      <Watermark opacity={0.06} size={520} position="end-bottom" />

      {showDrift && <HeroProductDrift products={driftProducts} />}

      {/*
        `min-h` rather than a fixed height, and 72vh rather than 100vh: a full
        viewport hero pushes every proof point below the fold, and on a short
        laptop window 100vh leaves no hint that the page continues. `lg:` only,
        because a phone in portrait is already tall and 72vh of gradient there
        is just a wall.

        `wide` measure: the hero is the one place the page should reach past the
        1440px body measure, or it reads as a narrow strip on a 1920px display.
      */}
      {/*
        `pointer-events-none` on the CONTAINER, `auto` on the content column.

        The container is a full-width, full-height positioned box with nothing
        in most of it, and at z-10 it sat on top of the drift and swallowed
        every pointer event over the inline-end half — which silently disabled
        pause-on-hover. A layout wrapper should not intercept input for space it
        does not occupy, so it opts out and its one real child opts back in.
      */}
      <Container
        width="wide"
        className="pointer-events-none relative z-10 flex min-h-[32rem] flex-col justify-center py-3xl lg:min-h-[72vh] lg:py-5xl"
      >
        {/*
          Each block is spaced by its own margin rather than a flex `gap`,
          because the intervals are deliberately UNEQUAL: eyebrow→headline is a
          label attaching to its heading and stays tight, while CTAs→stats is a
          change of subject and gets the largest gap on the page. A single gap
          value would flatten that hierarchy into one dense block, which is
          exactly how this read before.
        */}
        {/*
          The column only narrows from `lg`, where the drift actually appears.
          Below that the marquee sits under the stats and the headline keeps the
          full measure — see HeroProductMarquee for why tablet gets the strip
          rather than a side panel.
        */}
        <div className={cx('pointer-events-auto max-w-[52rem]', showDrift && 'lg:max-w-[52%]')}>
          <p className="text-body-sm font-medium tracking-wide text-brand-cyan uppercase">
            {t('eyebrow')}
          </p>

          {/*
            NO HEIGHT RESERVATION HERE, AND THAT IS THE POINT.

            This headline briefly carried `lg:max-[1541px]:min-h-[2lh]`, holding
            two lines open so the Arabic headline could not gain one when the
            webfont swapped in and shove the subhead, the buttons and the stat
            row 68px down the page. That was a workaround for a bug in the font
            stack, not a property of the design: next/font was synthesising the
            Arabic fallback from Arial, which has no Arabic glyphs, so the
            headline set 22% narrow until the real face arrived. See fonts.ts.

            The fallback now names a real Arabic face on every platform, the
            width sweep shows both faces agreeing on the line count across this
            whole breakpoint range, and measuring with and without the
            reservation gives the same CLS. So it is gone. Do not reintroduce it
            without a measurement that says it does something — a reservation
            that is never reached is 68px of empty gradient waiting for a
            viewport where the content does not fill it.
          */}
          <h1 className="mt-5 text-display-2 font-semibold sm:text-display-1">{t('headline')}</h1>

          <p className="mt-lg max-w-[42rem] text-body-lg text-surface/85">{t('subhead')}</p>

          <div className="mt-xl flex flex-wrap items-center gap-4">
            <Button as="a" href="/products" size="lg" iconEnd={<Icon icon={ArrowRight} size={20} />}>
              {t('primaryCta')}
            </Button>

            <Button
              as="a"
              href="/quote"
              size="lg"
              variant="onPurple"
              icon={<Icon icon={FileText} size={20} />}
            >
              {t('secondaryCta')}
            </Button>
          </div>

          {/* Real counts from the API — concrete beats adjectives. */}
          <dl className="mt-2xl flex flex-wrap gap-x-3xl gap-y-lg border-t border-surface/15 pt-xl">
            <HeroStat
              value={formatNumber(stats.productCount, locale)}
              label={t('statProducts')}
            />
            <HeroStat
              value={formatNumber(stats.categoryCount, locale)}
              label={t('statCategories')}
            />
            <HeroStat value={t('statDeliveryValue')} label={t('statDelivery')} />
          </dl>

          {/* Phone and tablet — the desktop columns are absolutely positioned above. */}
          {showDrift && <HeroProductMarquee products={driftProducts} />}
        </div>
      </Container>
    </section>
  );
}

function HeroStat({ value, label }: { value: string; label: string }) {
  return (
    <div>
      <dt className="sr-only">{label}</dt>
      <dd>
        <span className="block text-h1 font-semibold text-brand-cyan">{value}</span>
        <span className="mt-1 block text-body-sm text-surface/75">{label}</span>
      </dd>
    </div>
  );
}
