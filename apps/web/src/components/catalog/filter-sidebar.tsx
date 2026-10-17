import { getTranslations } from 'next-intl/server';
import { Check } from 'lucide-react';
import type { CatalogCategoryDto, Locale } from '@packvio/shared';
import { Icon } from '@/components/ui';
import { Link } from '@/i18n/navigation';
import { buildCategoryTree } from '@/lib/category-tree';
import { cx } from '@/lib/cx';
import { formatNumber } from '@/lib/format';
import {
  FULFILMENT_MODES,
  listingHref,
  toggleCategory,
  withCustomPrinting,
  withFulfilmentMode,
  type ListingParams,
  type ListingTarget,
} from '@/lib/product-query';

export type FilterSidebarProps = {
  locale: Locale;
  categories: CatalogCategoryDto[];
  params: ListingParams;
  /** Where the filter links point — the listing, or a category page. */
  target: ListingTarget;
  className?: string;
};

/**
 * The listing's filters.
 *
 * EVERY CONTROL IS A LINK, not a checkbox with an onChange handler. That is the
 * whole design: a filter is a different URL, so ticking one is a navigation,
 * the back button undoes it, and the result can be copied out of the address
 * bar and sent to someone. It also means the sidebar works before hydration and
 * with JavaScript off, which no amount of client state can claim.
 *
 * The links are styled as checkboxes and carry `aria-pressed`, so a screen
 * reader announces the state a sighted reader sees in the tick box — `role`
 * stays as link, because that is what activating one does.
 */
export async function FilterSidebar({
  locale,
  categories,
  params,
  target,
  className,
}: FilterSidebarProps) {
  const t = await getTranslations({ locale, namespace: 'products.filters' });

  return (
    <div className={cx('flex flex-col gap-lg', className)}>
      <FilterGroup title={t('categories')}>
        {/*
          Nested, because the API now matches a parent's whole subtree: ticking
          "Cutlery" returns all 56 products under it. A flat list would show
          "Cutlery 56" beside "Spoons 19" as siblings and make the overlap look
          like double-counting.
        */}
        <ul className="flex flex-col gap-0.5">
          {buildCategoryTree(categories).map((category) => (
            <li key={category.id}>
              <FilterLink
                href={listingHref(target, toggleCategory(params, category.slug))}
                selected={params.categories.includes(category.slug)}
                label={category.name}
                count={formatNumber(category.productCount, locale)}
              />

              {category.children.length > 0 && (
                <ul className="flex flex-col gap-0.5 ps-6">
                  {category.children.map((child) => (
                    <li key={child.id}>
                      <FilterLink
                        href={listingHref(target, toggleCategory(params, child.slug))}
                        selected={params.categories.includes(child.slug)}
                        label={child.name}
                        count={formatNumber(child.productCount, locale)}
                      />
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
      </FilterGroup>

      <FilterGroup title={t('fulfilment')}>
        <ul className="flex flex-col gap-0.5">
          {FULFILMENT_MODES.map((mode) => {
            const selected = params.fulfilmentMode === mode;
            return (
              <li key={mode}>
                <FilterLink
                  href={listingHref(target, withFulfilmentMode(params, mode))}
                  selected={selected}
                  label={t(`fulfilmentMode.${mode}`)}
                />
              </li>
            );
          })}
        </ul>
      </FilterGroup>

      <FilterGroup title={t('printing')}>
        <FilterLink
          href={listingHref(target, withCustomPrinting(params, params.customPrinting !== true))}
          selected={params.customPrinting === true}
          label={t('customPrintingAvailable')}
        />
        <p className="mt-2 text-caption text-ink-muted">{t('customPrintingHint')}</p>
      </FilterGroup>
    </div>
  );
}

function FilterGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="mb-2 text-body-sm font-semibold text-brand-purple">{title}</h3>
      {children}
    </div>
  );
}

type FilterLinkProps = {
  href: React.ComponentProps<typeof Link>['href'];
  selected: boolean;
  label: string;
  count?: string;
};

function FilterLink({ href, selected, label, count }: FilterLinkProps) {
  return (
    <Link
      href={href}
      aria-pressed={selected}
      // `scroll: false` — a filter click should refine the grid in place, not
      // throw the reader back to the top of the page they were reading.
      scroll={false}
      className={cx(
        'group flex items-center gap-2.5 rounded-sm px-2 py-1.5 text-body-sm transition-colors',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-purple',
        selected ? 'text-brand-purple' : 'text-ink hover:bg-surface-alt',
      )}
    >
      <span
        aria-hidden="true"
        className={cx(
          'inline-flex size-4 shrink-0 items-center justify-center rounded-xs border transition-colors',
          selected
            ? 'border-brand-purple bg-brand-purple text-surface'
            : 'border-border bg-surface group-hover:border-brand-purple',
        )}
      >
        {selected && <Icon icon={Check} size={12} />}
      </span>

      <span className={cx('flex-1 text-start', selected && 'font-medium')}>{label}</span>

      {count !== undefined && (
        <span className="bidi-latin shrink-0 font-mono text-caption text-ink-muted">{count}</span>
      )}
    </Link>
  );
}
