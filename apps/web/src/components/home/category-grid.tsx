import { getTranslations } from 'next-intl/server';
import { ArrowRight } from 'lucide-react';
import type { CatalogCategoryDto, Locale } from '@packvio/shared';
import { categoryIcon } from '@/components/icons/categories';
import { Icon, Section, Watermark } from '@/components/ui';
import { Link } from '@/i18n/navigation';
import { formatNumber } from '@/lib/format';

export type CategoryGridProps = {
  locale: Locale;
  categories: CatalogCategoryDto[];
};

/**
 * The category tiles: 4 columns on desktop, 2 on tablet, 1 on mobile.
 *
 * With no category imagery yet, each tile is a panel-tinted card carrying the
 * P-mark wash and the product count — the same device as ProductPanel, so the
 * grid reads as part of the catalog rather than as empty boxes waiting for art.
 */
export async function CategoryGrid({ locale, categories }: CategoryGridProps) {
  const t = await getTranslations({ locale, namespace: 'home.categories' });

  return (
    <Section spacing="lg" aria-labelledby="home-categories">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 id="home-categories" className="text-h1 font-semibold text-brand-purple">
            {t('heading')}
          </h2>
          <p className="mt-2 max-w-[42rem] text-body text-ink-muted">{t('intro')}</p>
        </div>

        <Link
          href="/products"
          className="inline-flex items-center gap-1.5 text-body-sm font-medium text-brand-purple hover:underline"
        >
          {t('viewAll')}
          <Icon icon={ArrowRight} size={16} />
        </Link>
      </div>

      <ul className="mt-xl grid grid-cols-1 gap-6 lg:gap-8 g2:grid-cols-2 g4:grid-cols-4">
        {categories.map((category) => {
          const CategoryIcon = categoryIcon(category.slug);

          return (
          <li key={category.id}>
            <Link
              href={{ pathname: '/categories/[slug]', params: { slug: category.slug } }}
              className={[
                // min-h + justify-between is what makes the tile a panel rather
                // than a label: without a floor the tallest name sets the row
                // height and short ones collapse to two cramped lines.
                'group relative isolate flex h-full min-h-[15rem] flex-col justify-between gap-lg overflow-hidden',
                'rounded-lg bg-panel panel-inset p-lg transition-shadow duration-200 lg:p-xl',
                'hover:shadow-raised',
                'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-purple',
              ].join(' ')}
            >
              <Watermark opacity={0.05} size={220} position="end-bottom" />

              <CategoryIcon
                size={44}
                className="relative z-10 text-brand-purple/85 transition-colors group-hover:text-brand-purple"
              />

              <h3 className="relative z-10 mt-auto text-h3 font-semibold text-brand-purple">
                {category.name}
              </h3>

              <p className="relative z-10 flex items-center justify-between gap-2">
                {/* Two args on purpose: `count` drives ICU plural selection —
                    Arabic has one/two/few/many forms — while `formatted` carries
                    the digits, so the grammar is right AND the numerals stay
                    Latin. See lib/format.ts. */}
                <span className="text-body-sm text-ink-muted">
                  {t('productCount', {
                    count: category.productCount,
                    formatted: formatNumber(category.productCount, locale),
                  })}
                </span>
                <Icon
                  icon={ArrowRight}
                  size={18}
                  className="text-brand-purple transition-transform group-hover:translate-x-0.5 rtl:group-hover:-translate-x-0.5"
                />
              </p>
            </Link>
          </li>
          );
        })}
      </ul>
    </Section>
  );
}
