'use client';

import { useTranslations } from 'next-intl';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import type { CatalogCategoryDto } from '@packvio/shared';
import { categoryIcon } from '@/components/icons/categories';
import { Icon } from '@/components/ui';
import { Link } from '@/i18n/navigation';
import { buildCategoryTree } from '@/lib/category-tree';
import { cx } from '@/lib/cx';

export type MegaMenuProps = {
  categories: CatalogCategoryDto[];
  /** Label for the trigger — comes from the nav namespace. */
  label: string;
};

/**
 * Desktop "Products" mega-menu: all categories in columns, each with its count.
 *
 * The trigger is a real <button> next to a real <a>, not a link that also opens
 * a panel. That split matters: a reader who wants the products page can click
 * the link, and a reader who wants to browse categories can open the panel,
 * without either action stealing the other's click. Keyboard users get the panel
 * on Enter/Space and close it with Escape, which a hover-only menu never gives
 * them at all.
 *
 * Opening on hover as well is a convenience, not the mechanism — the menu is
 * fully operable with the pointer never entering it.
 */
export function MegaMenu({ categories, label }: MegaMenuProps) {
  const t = useTranslations('nav');
  const panelId = useId();
  // Nested from the flat list the layout already fetched — see buildCategoryTree.
  const tree = useMemo(() => buildCategoryTree(categories), [categories]);
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  /** Escape closes from anywhere inside, and focus returns to the trigger. */
  useEffect(() => {
    if (!isOpen) return;

    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setIsOpen(false);
      containerRef.current?.querySelector<HTMLButtonElement>('[data-mega-trigger]')?.focus();
    };

    const onPointerDown = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setIsOpen(false);
    };

    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('mousedown', onPointerDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('mousedown', onPointerDown);
    };
  }, [isOpen]);

  /** A short close delay stops the panel vanishing while the pointer crosses
   *  the gap between the trigger and the panel edge. */
  const scheduleClose = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    closeTimer.current = setTimeout(() => setIsOpen(false), 120);
  };

  const cancelClose = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
  };

  useEffect(() => () => cancelClose(), []);

  return (
    <div
      ref={containerRef}
      className="static"
      onMouseEnter={() => {
        cancelClose();
        setIsOpen(true);
      }}
      onMouseLeave={scheduleClose}
    >
      <div className="flex items-center">
        <Link
          href="/products"
          className="px-3 py-2 text-body-sm font-medium text-ink hover:text-brand-purple"
        >
          {label}
        </Link>

        <button
          type="button"
          data-mega-trigger
          aria-expanded={isOpen}
          aria-controls={panelId}
          aria-label={t('browseCategories')}
          onClick={() => setIsOpen((open) => !open)}
          className={cx(
            'cursor-pointer rounded-sm p-1 text-ink transition-colors hover:text-brand-purple',
            'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-purple',
          )}
        >
          <Icon
            icon={ChevronDown}
            size={16}
            className={cx('transition-transform', isOpen && 'rotate-180')}
          />
        </button>
      </div>

      {isOpen && (
        <div
          id={panelId}
          onMouseEnter={cancelClose}
          onMouseLeave={scheduleClose}
          className={cx(
            // Full-bleed panel pinned under the header bar. `start-0 end-0`
            // rather than left/right so it spans correctly in both directions.
            'absolute start-0 end-0 top-full z-40',
            'border-t border-border bg-surface shadow-overlay',
          )}
        >
          <div className="mx-auto w-full max-w-page px-4 py-xl sm:px-6 lg:px-10">
            <div className="mb-md flex items-baseline justify-between gap-4">
              <h2 className="text-h4 font-semibold text-brand-purple">{t('allCategories')}</h2>
              <Link
                href="/products"
                onClick={() => setIsOpen(false)}
                className="text-body-sm font-medium text-brand-purple hover:underline"
              >
                {t('viewAllProducts')}
              </Link>
            </div>

            {/*
              Columns via CSS `columns`, not a grid.

              A grid would put each parent in a fixed cell and break the visual
              link between a parent and the children indented under it whenever
              a family straddled a column boundary. Multi-column flow keeps each
              family as one unbroken block (`break-inside-avoid`) and lets the
              browser balance the columns around them.
            */}
            <ul className="gap-x-xl [column-count:2] md:[column-count:3] g4:[column-count:4]">
              {tree.map((category) => {
                const CategoryIcon = categoryIcon(category.slug);
                const children = category.children ?? [];

                return (
                  <li key={category.id} className="mb-md break-inside-avoid">
                    <Link
                      href={{ pathname: '/categories/[slug]', params: { slug: category.slug } }}
                      onClick={() => setIsOpen(false)}
                      className={cx(
                        'flex items-center gap-2.5 rounded-sm px-2 py-1.5',
                        'text-body-sm font-medium text-ink transition-colors',
                        'hover:bg-panel hover:text-brand-purple',
                      )}
                    >
                      <CategoryIcon size={20} className="shrink-0 text-brand-purple/80" />
                      <span className="min-w-0 flex-1 truncate">{category.name}</span>
                      <span className="bidi-latin shrink-0 font-mono text-caption text-ink-muted">
                        {category.productCount}
                      </span>
                    </Link>

                    {children.length > 0 && (
                      // ps-* is padding-inline-start, so the indent that signals
                      // "child of the row above" flips with the direction.
                      <ul className="mt-0.5 ps-[1.9rem]">
                        {children.map((child) => (
                          <li key={child.id}>
                            <Link
                              href={{
                                pathname: '/categories/[slug]',
                                params: { slug: child.slug },
                              }}
                              onClick={() => setIsOpen(false)}
                              className={cx(
                                'flex items-baseline justify-between gap-2 rounded-sm px-2 py-1',
                                'text-body-sm text-ink-muted transition-colors',
                                'hover:bg-panel hover:text-brand-purple',
                              )}
                            >
                              <span className="min-w-0 truncate">{child.name}</span>
                              <span className="bidi-latin shrink-0 font-mono text-caption text-ink-muted">
                                {child.productCount}
                              </span>
                            </Link>
                          </li>
                        ))}
                      </ul>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
