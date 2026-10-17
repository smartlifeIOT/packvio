import { getTranslations, setRequestLocale } from 'next-intl/server';
import { ArrowRight } from 'lucide-react';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { ProductRail } from '@/components/catalog/product-rail';
import { CategoryGrid } from '@/components/home/category-grid';
import { CustomPrintingCta } from '@/components/home/custom-printing-cta';
import { Hero } from '@/components/home/hero';
import { selectDriftProducts } from '@/components/home/hero-drift-data';
import { QuoteCta } from '@/components/home/quote-cta';
import { ValueBand } from '@/components/home/value-band';
import { CheckerBand, Icon, Section } from '@/components/ui';
import { Link } from '@/i18n/navigation';
import { isLocale } from '@/i18n/routing';
import { getHome } from '@/lib/api';

type HomePageProps = {
  params: Promise<{ locale: string }>;
};

export async function generateMetadata({ params }: HomePageProps): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};

  const t = await getTranslations({ locale, namespace: 'home.meta' });

  return {
    title: t('title'),
    description: t('description'),
    alternates: {
      canonical: `/${locale}`,
      languages: { ar: '/ar', en: '/en' },
    },
  };
}

/**
 * The home page.
 *
 * ONE API call for the whole page — `/catalog/home` returns the categories,
 * the featured twelve, the newest eight and the totals together, so the most
 * visited page on the site is a single round trip and a single ISR cache entry
 * rather than four that expire independently.
 */
export default async function HomePage({ params }: HomePageProps) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();

  setRequestLocale(locale);

  const [home, t] = await Promise.all([
    getHome(locale),
    getTranslations({ locale, namespace: 'home' }),
  ]);

  /**
   * The drift reuses the products this page ALREADY fetched. `/catalog/home`
   * returns featured and newest in the same round trip that produces the stats,
   * so the hero's showcase costs no additional request on the page whose LCP
   * budget is tightest.
   */
  const driftProducts = selectDriftProducts(home.featured, home.newest);

  return (
    <>
      <Hero locale={locale} stats={home.stats} driftProducts={driftProducts} />

      <CheckerBand tone="cyan" height={12} />

      <CategoryGrid locale={locale} categories={home.categories} />

      <ValueBand locale={locale} />

      {/* Featured rail. Renders nothing at all when nothing is flagged — an
          empty section with a heading over it is worse than no section. */}
      {home.featured.length > 0 && (
        <Section spacing="lg" aria-labelledby="home-featured">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <h2 id="home-featured" className="text-h1 font-semibold text-brand-purple">
                {t('featured.heading')}
              </h2>
              <p className="mt-2 max-w-[42rem] text-body text-ink-muted">{t('featured.intro')}</p>
            </div>

            <Link
              href="/products"
              className="inline-flex items-center gap-1.5 text-body-sm font-medium text-brand-purple hover:underline"
            >
              {t('featured.viewAll')}
              <Icon icon={ArrowRight} size={16} />
            </Link>
          </div>

          <ProductRail
            products={home.featured}
            label={t('featured.heading')}
            layout="rail"
            className="mt-lg"
          />
        </Section>
      )}

      <CustomPrintingCta locale={locale} />

      {home.newest.length > 0 && (
        <Section tone="surface" spacing="lg" aria-labelledby="home-newest">
          <h2 id="home-newest" className="text-h1 font-semibold text-brand-purple">
            {t('newest.heading')}
          </h2>
          <p className="mt-2 max-w-[42rem] text-body text-ink-muted">{t('newest.intro')}</p>

          <ProductRail
            products={home.newest}
            label={t('newest.heading')}
            layout="grid"
            className="mt-lg"
          />
        </Section>
      )}

      <QuoteCta locale={locale} />
    </>
  );
}
