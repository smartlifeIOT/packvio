import { getTranslations } from 'next-intl/server';
import { ArrowRight } from 'lucide-react';
import type { CatalogCategoryDto, Locale } from '@packvio/shared';
import { categoryImage, CATEGORY_TILE_SIZE } from '@/components/catalog/category-image';
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
 * Each tile leads with a PHOTOGRAPH of something from that category, over a
 * caption carrying the name and the product count. It previously led with the
 * category line icon on a panel-tinted card, which was the right answer while
 * there was no imagery — but a 44px stroke icon tells a buyer far less than a
 * picture of the actual cup, and "shop by category" is the page's main way in.
 *
 * `categoryImage()` returns null for a category with no photograph, and that
 * tile keeps the old icon treatment rather than showing a hole. Exactly one
 * category is in that state today (HMR containers), so the grid is seventeen
 * photographs and one icon — close enough to uniform that the odd one reads as
 * a category rather than as a bug.
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
          const image = categoryImage(category.slug);

          return (
            <li key={category.id}>
              <Link
                href={{ pathname: '/categories/[slug]', params: { slug: category.slug } }}
                className={[
                  'group relative isolate flex h-full flex-col overflow-hidden',
                  'rounded-lg bg-panel panel-inset transition-shadow duration-200',
                  'hover:shadow-raised',
                  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-purple',
                ].join(' ')}
              >
                {/* Square, because every tile file is 640x640 and a fixed ratio
                  is what keeps the grid from shifting as images decode. */}
                <div className="relative aspect-square overflow-hidden bg-panel">
                  {image ? (
                    // eslint-disable-next-line @next/next/no-img-element -- static
                    // local tile at a size the grid fixes; next/image would add an
                    // optimizer hop per category for no benefit.
                    <img
                      src={image}
                      alt=""
                      width={CATEGORY_TILE_SIZE}
                      height={CATEGORY_TILE_SIZE}
                      loading="lazy"
                      decoding="async"
                      className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
                    />
                  ) : (
                    // No photograph for this category. The icon treatment the
                    // whole grid used to wear, so the tile still reads as one of
                    // the set rather than as a failed image.
                    <div className="flex h-full w-full items-center justify-center">
                      <Watermark opacity={0.05} size={200} position="end-bottom" />
                      <CategoryIcon size={64} className="relative z-10 text-brand-purple/80" />
                    </div>
                  )}
                </div>

                <div className="flex flex-1 flex-col gap-1 p-lg">
                  <h3 className="text-h4 font-semibold text-brand-purple">{category.name}</h3>

                  <p className="mt-auto flex items-center justify-between gap-2 pt-2">
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
                </div>
              </Link>
            </li>
          );
        })}
      </ul>
    </Section>
  );
}
