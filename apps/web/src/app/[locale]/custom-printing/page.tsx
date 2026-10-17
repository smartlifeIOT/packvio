import { getTranslations, setRequestLocale } from 'next-intl/server';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { ArrowRight, Check, FileImage, Factory, Truck, Stamp } from 'lucide-react';
import { Breadcrumbs } from '@/components/catalog/breadcrumbs';
import {
  Button,
  CheckerBand,
  Icon,
  ProductPanel,
  Prose,
  Section,
  Watermark,
} from '@/components/ui';
import { isLocale } from '@/i18n/routing';
import { getProducts } from '@/lib/api';
import { cx } from '@/lib/cx';
import { formatNumber } from '@/lib/format';

type PageProps = { params: Promise<{ locale: string }> };

const CAPABILITIES = ['colours', 'materials', 'finishes', 'proofing'] as const;

/** send artwork → proof → production → delivery. */
const STEPS = [
  { key: 'artwork', icon: FileImage },
  { key: 'proof', icon: Stamp },
  { key: 'production', icon: Factory },
  { key: 'delivery', icon: Truck },
] as const;

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const t = await getTranslations({ locale, namespace: 'customPrinting' });
  return { title: t('title'), description: t('lead') };
}

/**
 * Custom logo printing.
 *
 * Built from the SAME devices as the catalog — CheckerBand, ProductPanel, the
 * P-mark watermark — rather than as a standalone marketing page, so a reader
 * arriving from a product page does not feel handed off to a different site.
 * The printable-product count is read from the API rather than written into the
 * copy, so it cannot go stale the way "over 100 products" would.
 */
export default async function CustomPrintingPage({ params }: PageProps) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  setRequestLocale(locale);

  const [t, printable] = await Promise.all([
    getTranslations({ locale, namespace: 'customPrinting' }),
    getProducts(locale, { customPrinting: true, perPage: 1 }),
  ]);

  return (
    <>
      <Section spacing="lg">
        <Breadcrumbs locale={locale} trail={[{ label: t('heading') }]} />

        <div className="mt-lg grid items-center gap-xl lg:grid-cols-2">
          <div>
            <h1 className="text-display-2 font-semibold text-brand-purple">{t('heading')}</h1>
            <p className="mt-4 text-body-lg text-ink-muted">{t('lead')}</p>

            <Prose className="mt-lg">
              <p>{t('body')}</p>
            </Prose>

            <div className="mt-xl flex flex-wrap gap-3">
              <Button as="a" href="/quote" size="lg" iconEnd={<Icon icon={ArrowRight} size={20} />}>
                {t('cta')}
              </Button>
              <Button
                as="a"
                href={{ pathname: '/products', query: { customPrinting: 'true' } }}
                size="lg"
                variant="secondary"
              >
                {t('browsePrintable', {
                  count: printable.total,
                  formatted: formatNumber(printable.total, locale),
                })}
              </Button>
            </div>
          </div>

          {/* The panel stands in for the artwork sample that will replace it —
              same tint, same watermark as a product panel, so the page reads as
              deliberate rather than as a missing image. */}
          <ProductPanel ratio="landscape" watermarkOpacity={0.06}>
            <div className="flex flex-col items-center gap-3 text-center">
              <Icon icon={Stamp} size={40} className="text-brand-purple/70" />
              <p className="text-h3 font-semibold text-brand-purple">{t('panel.title')}</p>
              <p className="max-w-[22rem] text-body-sm text-ink-muted">{t('panel.body')}</p>
            </div>
          </ProductPanel>
        </div>
      </Section>

      <CheckerBand tone="cyan" height={12} />

      <Section tone="alt" spacing="lg" aria-labelledby="printing-capabilities">
        <h2 id="printing-capabilities" className="text-h1 font-semibold text-brand-purple">
          {t('capabilities.heading')}
        </h2>

        <ul className="mt-lg grid gap-4 sm:grid-cols-2">
          {CAPABILITIES.map((key) => (
            <li key={key} className="flex items-start gap-3">
              <span className="mt-0.5 inline-flex size-6 shrink-0 items-center justify-center rounded-pill bg-brand-cyan">
                <Icon icon={Check} size={14} className="text-ink" />
              </span>
              <div>
                <p className="text-body font-medium text-ink">{t(`capabilities.${key}.title`)}</p>
                <p className="mt-0.5 text-body-sm text-ink-muted">
                  {t(`capabilities.${key}.body`)}
                </p>
              </div>
            </li>
          ))}
        </ul>
      </Section>

      <Section spacing="lg" aria-labelledby="printing-moq">
        <div className="relative isolate overflow-hidden rounded-lg bg-panel panel-inset p-lg sm:p-xl">
          <Watermark opacity={0.05} size={220} position="end-bottom" />
          <h2 id="printing-moq" className="relative z-10 text-h1 font-semibold text-brand-purple">
            {t('moq.heading')}
          </h2>
          <p className="relative z-10 mt-3 max-w-[46rem] text-body text-ink">{t('moq.body')}</p>
          <p className="relative z-10 mt-2 max-w-[46rem] text-body-sm text-ink-muted">
            {t('moq.note')}
          </p>
        </div>
      </Section>

      <Section tone="purple" spacing="lg" aria-labelledby="printing-process">
        <h2 id="printing-process" className="text-h1 font-semibold">
          {t('process.heading')}
        </h2>
        <p className="mt-2 max-w-[46rem] text-body text-surface/80">{t('process.intro')}</p>

        <ol className="mt-lg grid gap-lg sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map((step, index) => (
            <li key={step.key} className="flex flex-col gap-3">
              <span className="inline-flex size-11 items-center justify-center rounded-pill bg-brand-cyan text-ink">
                <Icon icon={step.icon} size={22} />
              </span>
              <p className="text-caption font-semibold uppercase tracking-wide text-brand-cyan">
                <span className="bidi-latin">{formatNumber(index + 1, locale)}</span>
              </p>
              <p className="text-h4 font-semibold">{t(`process.${step.key}.title`)}</p>
              <p className="text-body-sm text-surface/80">{t(`process.${step.key}.body`)}</p>
            </li>
          ))}
        </ol>

        <p className={cx('mt-xl rounded-md border border-surface/25 p-4 text-body-sm text-surface/90')}>
          {t('process.leadTime')}
        </p>

        <div className="mt-lg">
          <Button
            as="a"
            href="/quote"
            size="lg"
            variant="onPurple"
            iconEnd={<Icon icon={ArrowRight} size={20} />}
          >
            {t('cta')}
          </Button>
        </div>
      </Section>
    </>
  );
}
