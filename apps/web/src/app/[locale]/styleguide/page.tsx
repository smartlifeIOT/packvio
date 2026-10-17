import { useTranslations } from 'next-intl';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import {
  ArrowRight,
  ChevronRight,
  MoveRight,
  Package,
  Phone,
  ShieldCheck,
  Truck,
} from 'lucide-react';
import {
  Badge,
  Button,
  Card,
  CategoryTab,
  CheckerBand,
  Container,
  Icon,
  ProductPanel,
  Prose,
  Section,
  SpecTable,
  Watermark,
} from '@/components/ui';
import { CATEGORY_ICON_SLUGS, categoryIcon } from '@/components/icons/categories';
import { contrastRatio, formatRatio, grade } from '@/lib/contrast';
import { cx } from '@/lib/cx';

const WHITE = '#FFFFFF';
const PURPLE = '#39255F';

/**
 * Token tables. Class names are written as complete literals — Tailwind scans
 * source text, so a constructed name like `text-${token}` would never be
 * generated.
 */
const COLOUR_TOKENS = [
  { token: '--color-brand-cyan', hex: '#4FC0DF', swatch: 'bg-brand-cyan' },
  { token: '--color-brand-purple', hex: '#39255F', swatch: 'bg-brand-purple' },
  { token: '--color-brand-purple-deep', hex: '#2B1A48', swatch: 'bg-brand-purple-deep' },
  { token: '--color-panel', hex: '#EAF4FB', swatch: 'bg-panel' },
  { token: '--color-panel-edge', hex: '#D6E8F5', swatch: 'bg-panel-edge' },
  { token: '--color-ink', hex: '#1B1B1F', swatch: 'bg-ink' },
  { token: '--color-ink-muted', hex: '#5A5A66', swatch: 'bg-ink-muted' },
  { token: '--color-surface', hex: '#FFFFFF', swatch: 'bg-surface' },
  { token: '--color-surface-alt', hex: '#F7FAFC', swatch: 'bg-surface-alt' },
  { token: '--color-border', hex: '#E3E8EF', swatch: 'bg-border' },
  { token: '--color-success', hex: '#0E7A4B', swatch: 'bg-success' },
  { token: '--color-warning', hex: '#92400E', swatch: 'bg-warning' },
  { token: '--color-danger', hex: '#B3261E', swatch: 'bg-danger' },
] as const;

const TYPE_SCALE = [
  { token: 'display-1', className: 'text-display-1', size: '56px', leading: '1.05' },
  { token: 'display-2', className: 'text-display-2', size: '44px', leading: '1.10' },
  { token: 'display-3', className: 'text-display-3', size: '36px', leading: '1.15' },
  { token: 'h1', className: 'text-h1', size: '32px', leading: '1.20' },
  { token: 'h2', className: 'text-h2', size: '24px', leading: '1.25' },
  { token: 'h3', className: 'text-h3', size: '20px', leading: '1.35' },
  { token: 'h4', className: 'text-h4', size: '18px', leading: '1.40' },
  { token: 'body-lg', className: 'text-body-lg', size: '18px', leading: '1.65' },
  { token: 'body', className: 'text-body', size: '16px', leading: '1.70' },
  { token: 'body-sm', className: 'text-body-sm', size: '14px', leading: '1.60' },
  { token: 'caption', className: 'text-caption', size: '12px', leading: '1.50' },
  { token: 'spec', className: 'text-spec font-mono', size: '13px', leading: '1.45' },
] as const;

const SPACING_TOKENS = [
  { token: 'xs', px: '8px', bar: 'w-xs' },
  { token: 'sm', px: '16px', bar: 'w-sm' },
  { token: 'md', px: '24px', bar: 'w-md' },
  { token: 'lg', px: '32px', bar: 'w-lg' },
  { token: 'xl', px: '48px', bar: 'w-xl' },
  { token: '2xl', px: '64px', bar: 'w-2xl' },
  { token: '3xl', px: '96px', bar: 'w-3xl' },
] as const;

const RADII_TOKENS = [
  { token: 'sm', px: '6px', className: 'rounded-sm' },
  { token: 'md', px: '10px', className: 'rounded-md' },
  { token: 'lg', px: '16px', className: 'rounded-lg' },
  { token: 'pill', px: '999px', className: 'rounded-pill' },
] as const;

const SHADOW_TOKENS = [
  { token: 'card', className: 'shadow-card' },
  { token: 'raised', className: 'shadow-raised' },
  { token: 'overlay', className: 'shadow-overlay' },
] as const;

const DIRECTIONAL_ICONS = [ArrowRight, ChevronRight, MoveRight];
const STATIC_ICONS = [Package, Truck, ShieldCheck, Phone];

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'styleguide' });

  return {
    title: t('title'),
    // Internal tooling — never index, never follow.
    robots: { index: false, follow: false, nocache: true },
  };
}

export default async function StyleguidePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  // Development-only surface. In a production build this route resolves to 404.
  if (process.env.NODE_ENV === 'production') {
    notFound();
  }

  const { locale } = await params;
  setRequestLocale(locale);

  return <StyleguideContent />;
}

/* -------------------------------------------------------------------------- */
/* Layout helpers, local to this page                                          */
/* -------------------------------------------------------------------------- */

function Block({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="border-t border-border pt-lg">
      <h2 className="mb-md text-h2 font-semibold text-brand-purple">{title}</h2>
      {children}
    </section>
  );
}

function Mono({ children }: { children: ReactNode }) {
  return <span className="bidi-latin font-mono text-spec text-ink-muted">{children}</span>;
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="mb-md">
      <p className="mb-2 text-caption font-medium tracking-wide text-ink-muted uppercase">{label}</p>
      <div className="flex flex-wrap items-center gap-3">{children}</div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */

function StyleguideContent() {
  const t = useTranslations('styleguide');
  const tSample = useTranslations('sample');

  const specRows = [
    { label: tSample('specs.code'), value: 'PCS/08' },
    { label: tSample('specs.capacity'), value: '8 OZ' },
    { label: tSample('specs.material'), value: '301 GSM' },
    { label: tSample('specs.diameter'), value: 'Ø80 mm' },
    { label: tSample('specs.caseQuantity'), value: '1000 PCS / CTN' },
    { label: tSample('specs.printing'), value: tSample('printingAvailable'), isLatinValue: false },
  ];

  return (
    <main className="pb-3xl">
      <Section tone="purple" spacing="sm">
        <h1 className="text-display-3 font-semibold">{t('title')}</h1>
        <p className="mt-2 max-w-2xl text-body-lg opacity-90">{t('intro')}</p>
      </Section>

      <CheckerBand tone="cyan" height={12} />

      <Container as="div" className="flex flex-col gap-2xl pt-2xl">
        {/* ---------------------------------------------------------------- */}
        <Block title={t('sections.colour')}>
          <p className="mb-md rounded-md border border-warning/30 bg-warning/10 p-3 text-body-sm text-warning">
            {t('labels.cyanRule')}
          </p>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {COLOUR_TOKENS.map((colour) => {
              const vsWhite = contrastRatio(colour.hex, WHITE);
              const vsPurple = contrastRatio(colour.hex, PURPLE);

              return (
                <div
                  key={colour.token}
                  className="flex items-center gap-3 rounded-md border border-border p-3"
                >
                  <div
                    className={`size-14 shrink-0 rounded-sm border border-border ${colour.swatch}`}
                  />
                  <div className="min-w-0">
                    <p className="truncate">
                      <Mono>{colour.token}</Mono>
                    </p>
                    <p>
                      <Mono>{colour.hex}</Mono>
                    </p>
                    <p className="text-caption text-ink-muted">
                      <Mono>{formatRatio(vsWhite)}</Mono> {t('labels.onWhite')} —{' '}
                      <Mono>{grade(vsWhite)}</Mono>
                    </p>
                    <p className="text-caption text-ink-muted">
                      <Mono>{formatRatio(vsPurple)}</Mono> {t('labels.onPurple')} —{' '}
                      <Mono>{grade(vsPurple)}</Mono>
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </Block>

        {/* ---------------------------------------------------------------- */}
        <Block title={t('sections.type')}>
          <p className="mb-md text-body-sm text-ink-muted">{t('labels.leadingNote')}</p>

          <div className="flex flex-col gap-lg">
            {TYPE_SCALE.map((step) => (
              <div key={step.token} className="border-b border-border pb-lg last:border-b-0">
                <p className="mb-2">
                  <Mono>
                    {step.token} · {step.size} · {step.leading}
                  </Mono>
                </p>
                <p className={`${step.className} text-ink`} lang="ar" dir="rtl">
                  {tSample('productName')}
                </p>
                <p className={`${step.className} text-ink`} lang="en" dir="ltr">
                  Packvio wholesale packaging
                </p>
              </div>
            ))}
          </div>
        </Block>

        {/* ---------------------------------------------------------------- */}
        <Block title={t('sections.spacing')}>
          <div className="flex flex-col gap-2">
            {SPACING_TOKENS.map((step) => (
              <div key={step.token} className="flex items-center gap-3">
                <span className="w-24 shrink-0">
                  <Mono>
                    {step.token} · {step.px}
                  </Mono>
                </span>
                <span className={`${step.bar} h-4 rounded-sm bg-brand-cyan`} />
              </div>
            ))}
          </div>
        </Block>

        {/* ---------------------------------------------------------------- */}
        <Block title={t('sections.radii')}>
          <div className="flex flex-wrap gap-lg">
            {RADII_TOKENS.map((radius) => (
              <div key={radius.token} className="flex flex-col items-center gap-2">
                <div
                  className={`size-24 border border-panel-edge bg-panel ${radius.className}`}
                />
                <Mono>
                  {radius.token} · {radius.px}
                </Mono>
              </div>
            ))}
          </div>
        </Block>

        {/* ---------------------------------------------------------------- */}
        <Block title={t('sections.shadows')}>
          <div className="flex flex-wrap gap-lg bg-surface-alt p-lg">
            {SHADOW_TOKENS.map((shadow) => (
              <div key={shadow.token} className="flex flex-col items-center gap-2">
                <div className={`size-28 rounded-md bg-surface ${shadow.className}`} />
                <Mono>{shadow.token}</Mono>
              </div>
            ))}
          </div>
        </Block>

        {/* ---------------------------------------------------------------- */}
        <Block title={t('sections.buttons')}>
          <Row label={t('labels.variants')}>
            <Button variant="primary">{t('buttons.primary')}</Button>
            <Button variant="secondary">{t('buttons.secondary')}</Button>
            <Button variant="ghost">{t('buttons.ghost')}</Button>
          </Row>

          <div className="mb-md rounded-md bg-brand-purple p-md">
            <p className="mb-2 text-caption font-medium tracking-wide text-surface/70 uppercase">
              {t('labels.onPurple')}
            </p>
            <Button variant="onPurple">{t('buttons.onPurple')}</Button>
          </div>

          <Row label={t('labels.sizes')}>
            <Button size="sm">{t('buttons.primary')}</Button>
            <Button size="md">{t('buttons.primary')}</Button>
            <Button size="lg">{t('buttons.primary')}</Button>
          </Row>

          <Row label={t('labels.withIcon')}>
            <Button icon={<Icon icon={Package} size={18} />}>{t('buttons.secondary')}</Button>
            <Button variant="secondary" iconEnd={<Icon icon={ArrowRight} size={18} />}>
              {t('buttons.ghost')}
            </Button>
          </Row>

          <Row label={t('labels.asLink')}>
            <Button as="a" href="/" variant="secondary" iconEnd={<Icon icon={ChevronRight} size={18} />}>
              {t('buttons.secondary')}
            </Button>
          </Row>
        </Block>

        {/* ---------------------------------------------------------------- */}
        <Block title={t('sections.badges')}>
          <div className="flex flex-wrap items-center gap-3">
            <Badge tone="neutral">{t('badges.neutral')}</Badge>
            <Badge tone="cyan">{t('badges.customPrint')}</Badge>
            <Badge tone="purple">{t('badges.foodSafe')}</Badge>
            <Badge tone="success" icon={<Icon icon={ShieldCheck} size={14} />}>
              {t('badges.inStock')}
            </Badge>
            <Badge tone="warning">{t('badges.lowStock')}</Badge>
            <Badge tone="danger">{t('badges.discontinued')}</Badge>
          </div>
        </Block>

        {/* ---------------------------------------------------------------- */}
        <Block title={t('sections.cards')}>
          <div className="grid gap-md sm:grid-cols-2 lg:grid-cols-3">
            <Card>
              <h3 className="text-h4 font-semibold text-brand-purple">{t('cards.title')}</h3>
              <p className="mt-2 text-body-sm text-ink-muted">{t('cards.body')}</p>
            </Card>
            <Card interactive={false}>
              <h3 className="text-h4 font-semibold text-brand-purple">{t('cards.title')}</h3>
              <p className="mt-2 text-body-sm text-ink-muted">{t('cards.body')}</p>
            </Card>
          </div>
        </Block>

        {/* ---------------------------------------------------------------- */}
        <Block title={t('sections.productPanel')}>
          <div className="grid gap-md sm:grid-cols-2 lg:grid-cols-3">
            <div>
              <ProductPanel overlay={<Badge tone="cyan">{t('badges.customPrint')}</Badge>}>
                <CupGlyph />
              </ProductPanel>
              <p className="mt-3 text-body font-medium text-ink">{tSample('productName')}</p>
              <p className="text-body-sm">
                <Mono>PCS/08</Mono>
              </p>
            </div>

            <div>
              <ProductPanel ratio="portrait">
                <CupGlyph />
              </ProductPanel>
              <p className="mt-3 text-body-sm text-ink-muted">
                <Mono>ratio=&quot;portrait&quot;</Mono>
              </p>
            </div>

            <div>
              <ProductPanel ratio="landscape" hideWatermark>
                <CupGlyph />
              </ProductPanel>
              <p className="mt-3 text-body-sm text-ink-muted">
                <Mono>hideWatermark</Mono>
              </p>
            </div>
          </div>
        </Block>

        {/* ---------------------------------------------------------------- */}
        <Block title={t('sections.specTable')}>
          <div className="max-w-xl">
            <SpecTable rows={specRows} caption={tSample('specCaption')} showCaption />
          </div>
        </Block>

        {/* ---------------------------------------------------------------- */}
        <Block title={t('sections.checkerBand')}>
          <div className="flex flex-col gap-md">
            <CheckerBand tone="cyan" height={12} />
            <CheckerBand tone="purple" height={16} />
            <CheckerBand tone="panel" height={8} />
          </div>
        </Block>

        {/* ---------------------------------------------------------------- */}
        <Block title={t('sections.categoryTab')}>
          <p className="mb-md text-body-sm text-ink-muted">{t('labels.tabNote')}</p>
          <div className="relative h-64 overflow-hidden rounded-lg border border-border bg-surface-alt">
            <CategoryTab
              id="styleguide-category-tab"
              label={tSample('categoryTab')}
              position="absolute"
            />
          </div>
        </Block>

        {/* ---------------------------------------------------------------- */}
        <Block title={t('sections.icons')}>
          <Row label={t('labels.directionalIcons')}>
            {DIRECTIONAL_ICONS.map((glyph, index) => (
              <span
                key={index}
                className="flex size-12 items-center justify-center rounded-md border border-border text-brand-purple"
              >
                <Icon icon={glyph} size={22} />
              </span>
            ))}
          </Row>
          <Row label={t('labels.staticIcons')}>
            {STATIC_ICONS.map((glyph, index) => (
              <span
                key={index}
                className="flex size-12 items-center justify-center rounded-md border border-border text-brand-purple"
              >
                <Icon icon={glyph} size={22} />
              </span>
            ))}
          </Row>
        </Block>

        {/* ---------------------------------------------------------------- */}
        <Block title={t('sections.categoryIcons')}>
          <p className="mb-lg max-w-[52rem] text-body-sm text-ink-muted">
            {t('labels.categoryIconNote')}
          </p>

          {/*
            The same set at 24, 48 and 96.

            Three sizes because the failures are size-dependent and invisible at
            one: at 24px an icon with too much interior detail turns to mud,
            while at 96px an inconsistent stroke weight or a corner radius that
            does not match its neighbours becomes obvious. Reviewing at a single
            size hides one of the two.
          */}
          {([24, 48, 96] as const).map((size) => (
            <div key={size} className="mb-xl">
              <p className="mb-3 font-mono text-spec text-ink-muted">
                <span className="bidi-latin">{size}px</span>
              </p>
              <ul
                className={cx(
                  'grid gap-4',
                  size === 96
                    ? 'grid-cols-3 sm:grid-cols-5 lg:grid-cols-7'
                    : 'grid-cols-4 sm:grid-cols-7 lg:grid-cols-10',
                )}
              >
                {CATEGORY_ICON_SLUGS.map((slug) => {
                  const CategoryIcon = categoryIcon(slug);
                  return (
                    <li
                      key={slug}
                      className="flex flex-col items-center gap-2 rounded-md border border-border p-3 text-center"
                    >
                      <span className="flex items-center justify-center text-brand-purple">
                        <CategoryIcon size={size} />
                      </span>
                      <span className="bidi-latin font-mono text-caption break-all text-ink-muted">
                        {slug}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </Block>

        {/* ---------------------------------------------------------------- */}
        <Block title={t('sections.prose')}>
          <div className="relative max-w-2xl overflow-hidden rounded-lg bg-panel p-lg panel-inset">
            <Watermark opacity={0.05} position="end-bottom" size={220} />
            <Prose className="relative">
              <h2>{t('prose.heading')}</h2>
              <p>{t('prose.paragraph')}</p>
              <p>{t('prose.listIntro')}</p>
              <ul>
                <li>{t('prose.listOne')}</li>
                <li>{t('prose.listTwo')}</li>
                <li>{t('prose.listThree')}</li>
              </ul>
            </Prose>
          </div>
        </Block>

        {/* ---------------------------------------------------------------- */}
        <Block title={t('sections.container')}>
          <div className="rounded-md bg-surface-alt py-md">
            <Container className="rounded-sm border border-dashed border-brand-cyan py-4">
              <Mono>max-w-page = 1280px · gutters 16px / 24px @640</Mono>
            </Container>
          </div>
        </Block>
      </Container>
    </main>
  );
}

/** Neutral product stand-in so ProductPanel can be judged with real content in it. */
function CupGlyph() {
  return (
    <svg viewBox="0 0 120 140" className="h-full w-auto max-h-40" role="presentation" aria-hidden="true">
      <path
        d="M22 22h76l-4 16H26z"
        fill="var(--color-surface)"
        stroke="var(--color-brand-purple)"
        strokeWidth="3"
        strokeLinejoin="round"
      />
      <path
        d="M26 38h68l-8 78a8 8 0 0 1-8 7H42a8 8 0 0 1-8-7z"
        fill="var(--color-surface)"
        stroke="var(--color-brand-purple)"
        strokeWidth="3"
        strokeLinejoin="round"
      />
      <path d="M32 70h56" stroke="var(--color-brand-cyan)" strokeWidth="6" strokeLinecap="round" />
    </svg>
  );
}
