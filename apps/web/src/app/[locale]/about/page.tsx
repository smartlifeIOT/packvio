import { getTranslations, setRequestLocale } from 'next-intl/server';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import {
  ArrowRight,
  Building2,
  Cake,
  ChefHat,
  Coffee,
  Hotel,
  Stethoscope,
  UtensilsCrossed,
} from 'lucide-react';
import { Breadcrumbs } from '@/components/catalog/breadcrumbs';
import { Button, CheckerBand, Icon, Prose, Section, Watermark } from '@/components/ui';
import { isLocale } from '@/i18n/routing';
import { getHome } from '@/lib/api';
import { cx } from '@/lib/cx';
import { formatNumber } from '@/lib/format';

type PageProps = { params: Promise<{ locale: string }> };

/** Who Packvio sells to, from the company profile. */
const SERVES = [
  { key: 'restaurants', icon: UtensilsCrossed },
  { key: 'cafes', icon: Coffee },
  { key: 'bakeries', icon: Cake },
  { key: 'catering', icon: ChefHat },
  { key: 'hospitals', icon: Stethoscope },
  { key: 'hotels', icon: Hotel },
] as const;

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const t = await getTranslations({ locale, namespace: 'about' });
  return { title: t('title'), description: t('lead') };
}

export default async function AboutPage({ params }: PageProps) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  setRequestLocale(locale);

  const [t, home] = await Promise.all([
    getTranslations({ locale, namespace: 'about' }),
    getHome(locale),
  ]);

  return (
    <>
      <Section spacing="lg">
        <Breadcrumbs locale={locale} trail={[{ label: t('heading') }]} />

        <div className="mt-lg max-w-[48rem]">
          <h1 className="text-display-2 font-semibold text-brand-purple">{t('heading')}</h1>
          <p className="mt-4 text-body-lg text-ink-muted">{t('lead')}</p>

          <Prose className="mt-lg">
            <p>{t('body1')}</p>
            <p>{t('body2')}</p>
          </Prose>
        </div>

        {/* Read from the catalog rather than written into the copy, so the
            numbers cannot drift from what the site actually lists. */}
        <dl className="mt-xl grid gap-4 sm:grid-cols-3">
          <Stat
            label={t('stats.products')}
            value={formatNumber(home.stats.productCount, locale)}
          />
          <Stat
            label={t('stats.categories')}
            value={formatNumber(home.stats.categoryCount, locale)}
          />
          <Stat label={t('stats.based')} value={t('stats.basedValue')} isNumeric={false} />
        </dl>
      </Section>

      <CheckerBand tone="cyan" height={12} />

      <Section tone="purple" spacing="lg" aria-labelledby="about-vision">
        <div className="max-w-[48rem]">
          <h2 id="about-vision" className="text-h1 font-semibold">
            {t('vision.heading')}
          </h2>
          <p className="mt-4 text-body-lg text-surface/90">{t('vision.body')}</p>
          <p className="mt-3 text-body text-surface/80">{t('vision.body2')}</p>
        </div>
      </Section>

      <Section spacing="lg" aria-labelledby="about-serves">
        <h2 id="about-serves" className="text-h1 font-semibold text-brand-purple">
          {t('serves.heading')}
        </h2>
        <p className="mt-2 max-w-[46rem] text-body text-ink-muted">{t('serves.intro')}</p>

        <ul className="mt-lg grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
          {SERVES.map((entry) => (
            <li
              key={entry.key}
              className="relative isolate flex flex-col items-center gap-3 overflow-hidden rounded-lg bg-panel panel-inset p-4 text-center"
            >
              <Watermark opacity={0.04} size={120} position="end-bottom" />
              <Icon icon={entry.icon} size={26} className="relative z-10 text-brand-purple" />
              <span className="relative z-10 text-body-sm font-medium text-ink">
                {t(`serves.${entry.key}`)}
              </span>
            </li>
          ))}
        </ul>
      </Section>

      <Section tone="alt" spacing="lg" aria-labelledby="about-company">
        <div className="max-w-[48rem]">
          <h2 id="about-company" className="text-h1 font-semibold text-brand-purple">
            {t('company.heading')}
          </h2>

          <Prose className="mt-4">
            <p>{t('company.body')}</p>
          </Prose>

          <p className="mt-lg inline-flex items-center gap-2 text-body-sm text-ink-muted">
            <Icon icon={Building2} size={16} />
            {t('company.registered')}
          </p>

          <div className="mt-xl flex flex-wrap gap-3">
            <Button as="a" href="/quote" size="lg" iconEnd={<Icon icon={ArrowRight} size={20} />}>
              {t('cta')}
            </Button>
            <Button as="a" href="/contact" size="lg" variant="secondary">
              {t('contactCta')}
            </Button>
          </div>
        </div>
      </Section>
    </>
  );
}

/**
 * `isNumeric` decides whether the value is bidi-isolated and set in the mono
 * face. A count like "213" is Latin digits that must not reorder inside Arabic
 * copy; a place name like "الرياض" is Arabic prose, and forcing it LTR in a
 * monospace face would be both wrong and ugly.
 */
function Stat({
  label,
  value,
  isNumeric = true,
}: {
  label: string;
  value: string;
  isNumeric?: boolean;
}) {
  return (
    <div className="rounded-md border border-border bg-surface-alt p-lg">
      <dt className="text-body-sm text-ink-muted">{label}</dt>
      <dd
        className={cx(
          'mt-1 text-display-3 font-semibold text-brand-purple',
          isNumeric && 'bidi-latin font-mono',
        )}
      >
        {value}
      </dd>
    </div>
  );
}
