import { getTranslations, setRequestLocale } from 'next-intl/server';
import type { Metadata } from 'next';
import { notFound, permanentRedirect } from 'next/navigation';
import { Breadcrumbs } from '@/components/catalog/breadcrumbs';
import { ProductGallery } from '@/components/catalog/product-gallery';
import { VariantPicker } from '@/components/catalog/variant-picker';
import { ProductRail } from '@/components/catalog/product-rail';
import { ProductActions } from '@/components/quote/product-actions';
import { Badge, Section, SpecTable, type SpecRow } from '@/components/ui';
import { Link, getPathname } from '@/i18n/navigation';
import { isLocale } from '@/i18n/routing';
import { getProductOrNotFound } from '@/lib/api';
import { formatNumber } from '@/lib/format';

type ProductPageProps = {
  params: Promise<{ locale: string; slug: string }>;
};

export async function generateMetadata({ params }: ProductPageProps): Promise<Metadata> {
  const { locale, slug } = await params;
  if (!isLocale(locale)) return {};

  const product = await getProductOrNotFound(decodeURIComponent(slug), locale);

  return {
    title: product.metaTitle ?? `${product.name} · ${product.code}`,
    description:
      product.metaDescription ?? product.shortDescription ?? product.description ?? undefined,
    alternates: {
      canonical: getPathname({
        locale,
        href: { pathname: '/product/[slug]', params: { slug: product.canonicalSlug } },
      }),
      languages: {
        ar: getPathname({
          locale: 'ar',
          href: {
            pathname: '/product/[slug]',
            params: { slug: locale === 'ar' ? product.slug : product.alternateSlug },
          },
        }),
        en: getPathname({
          locale: 'en',
          href: {
            pathname: '/product/[slug]',
            params: { slug: locale === 'en' ? product.slug : product.alternateSlug },
          },
        }),
      },
    },
  };
}

/**
 * Product detail.
 *
 * NO PRICE ANYWHERE, on purpose. Price is null on every row until the Salla
 * sync runs, and this is a quote-first wholesale catalog: the specs and the
 * case quantity carry the commercial detail, and the page's job is to get the
 * reader into the RFQ.
 */
export default async function ProductPage({ params }: ProductPageProps) {
  const { locale, slug: rawSlug } = await params;
  if (!isLocale(locale)) notFound();
  setRequestLocale(locale);

  const slug = decodeURIComponent(rawSlug);
  const product = await getProductOrNotFound(slug, locale);

  // Same canonical-URL rule as the category page — see the note there.
  if (product.slugMatchedOtherLocale) {
    permanentRedirect(
      getPathname({
        locale,
        href: { pathname: '/product/[slug]', params: { slug: product.canonicalSlug } },
      }),
    );
  }

  const t = await getTranslations({ locale, namespace: 'product' });

  /**
   * Every value is bidi-isolated by SpecTable. These are Latin strings — a code
   * like "PCS/08", a size like "8 OZ", a material like "230G+18PE" — sitting in
   * an Arabic table, and without isolation "PCS/08" renders as "08/PCS".
   */
  const specs: SpecRow[] = [
    { label: t('specs.code'), value: product.code },
    ...(product.size ? [{ label: t('specs.size'), value: product.size }] : []),
    ...(product.material ? [{ label: t('specs.material'), value: product.material }] : []),
    ...(product.caseQuantity !== null
      ? [{ label: t('specs.caseQuantity'), value: formatNumber(product.caseQuantity, locale) }]
      : []),
  ];

  const category = product.categories[0];

  return (
    <>
      <Section spacing="lg">
        <Breadcrumbs
          locale={locale}
          trail={[
            { label: t('allProducts'), href: '/products' },
            ...(category
              ? [
                  {
                    label: category.name,
                    href: {
                      pathname: '/categories/[slug]' as const,
                      params: { slug: category.slug },
                    },
                  },
                ]
              : []),
            { label: product.name },
          ]}
        />

        <div className="mt-lg grid gap-xl lg:grid-cols-[1.1fr_1fr]">
          <ProductGallery
            images={product.images}
            code={product.code}
            name={product.name}
            categorySlug={product.primaryCategory?.slug}
            locale={locale}
          />

          <div>
            <div className="flex flex-wrap gap-2">
              {product.fulfilmentMode === 'quote' && <Badge tone="cyan">{t('quoteOnly')}</Badge>}
              {product.supportsCustomPrinting && (
                <Badge tone="purple">{t('badges.customPrinting')}</Badge>
              )}
              <Badge tone="neutral">{t('badges.foodSafe')}</Badge>
            </div>

            <h1 className="mt-3 text-display-3 font-semibold text-brand-purple">{product.name}</h1>

            <p className="bidi-latin mt-2 font-mono text-body text-ink-muted">{product.code}</p>

            {category && (
              <p className="mt-2 text-body-sm">
                <Link
                  href={{ pathname: '/categories/[slug]', params: { slug: category.slug } }}
                  className="text-brand-purple hover:underline"
                >
                  {category.name}
                </Link>
              </p>
            )}

            {product.shortDescription && (
              <p className="mt-4 text-body-lg text-ink">{product.shortDescription}</p>
            )}

            {product.description && (
              <p className="mt-3 text-body text-ink-muted">{product.description}</p>
            )}

            {/* Above the actions, because choosing the colour comes before
                choosing the quantity — and because a buyer who lands on the
                wrong colour should find the right one before filling in a
                case count they would then have to re-enter. */}
            {product.variantGroup && (
              <VariantPicker group={product.variantGroup} className="mt-lg" />
            )}

            <div className="mt-lg">
              <ProductActions
                code={product.code}
                name={product.name}
                slug={product.slug}
                caseQuantity={product.caseQuantity}
                fulfilmentMode={product.fulfilmentMode}
                sallaUrl={product.sallaUrl}
              />
            </div>
          </div>
        </div>

        <div className="mt-xl grid gap-xl lg:grid-cols-2">
          <div>
            <h2 className="text-h2 font-semibold text-brand-purple">{t('specsHeading')}</h2>
            <SpecTable
              rows={specs}
              caption={t('specsCaption', { name: product.name })}
              className="mt-4"
            />
          </div>

          {/*
            Price tiers: the whole block disappears when there are none, which
            today is always — no row has tiers until the Salla sync fills them.
            An empty "Pricing" heading over nothing reads as a broken page, and
            inventing a placeholder price would be worse than either.
          */}
          {product.priceTiers.length > 0 && (
            <div>
              <h2 className="text-h2 font-semibold text-brand-purple">{t('tiers.heading')}</h2>
              <table className="mt-4 w-full border-collapse text-body-sm">
                <caption className="sr-only">{t('tiers.caption', { name: product.name })}</caption>
                <thead>
                  <tr className="border-b border-border text-start">
                    <th scope="col" className="py-2 text-start font-semibold text-ink">
                      {t('tiers.minQuantity')}
                    </th>
                    <th scope="col" className="py-2 text-start font-semibold text-ink">
                      {t('tiers.unitPrice')}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {product.priceTiers.map((tier) => (
                    <tr key={tier.id} className="border-b border-border/60">
                      <td className="bidi-latin py-2 font-mono text-ink">
                        {formatNumber(tier.minQuantity, locale)}
                      </td>
                      <td className="bidi-latin py-2 font-mono text-ink">
                        {formatNumber(tier.unitPrice, locale)} {product.currency}
                        {tier.note && (
                          <span className="ms-2 font-sans text-caption text-ink-muted">
                            {tier.note}
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </Section>

      {product.related.length > 0 && (
        <Section tone="alt" spacing="lg" aria-labelledby="product-related">
          <h2 id="product-related" className="text-h1 font-semibold text-brand-purple">
            {t('related')}
          </h2>
          <ProductRail
            products={product.related}
            label={t('related')}
            layout="rail"
            className="mt-lg"
          />
        </Section>
      )}

      <ProductJsonLd
        name={product.name}
        code={product.code}
        description={product.metaDescription ?? product.shortDescription ?? product.description}
        image={product.images[0]?.url ?? null}
        category={category?.name ?? null}
      />
    </>
  );
}

/**
 * Product structured data, WITHOUT `offers`.
 *
 * schema.org/Product allows a product with no offer, and that is the honest
 * description of every row here: price is null until the Salla sync runs.
 * Emitting an `offers` block with a zero, a placeholder, or an invented
 * currency amount is fabricated pricing in a machine-readable format — Google
 * Merchant treats mismatched or fake price data as a policy violation and can
 * demote or suspend the whole domain for it. The `offers` block appears when
 * real prices do, and not one release earlier.
 */
function ProductJsonLd({
  name,
  code,
  description,
  image,
  category,
}: {
  name: string;
  code: string;
  description: string | null;
  image: string | null;
  category: string | null;
}) {
  const data = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name,
    sku: code,
    ...(description ? { description } : {}),
    ...(image ? { image } : {}),
    ...(category ? { category } : {}),
    brand: { '@type': 'Brand', name: 'Packvio' },
  };

  return (
    <script
      type="application/ld+json"
      // JSON.stringify output is the only thing that ever reaches this, and
      // `<` is escaped so a product name containing "</script>" cannot break out.
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, '\\u003c') }}
    />
  );
}
