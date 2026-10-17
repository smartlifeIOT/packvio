'use client';

import { useTranslations } from 'next-intl';
import { ChevronDown, Mail, Menu, Phone, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { CatalogCategoryDto } from '@packvio/shared';
import { Icon } from '@/components/ui';
import { Link } from '@/i18n/navigation';
import { buildCategoryTree } from '@/lib/category-tree';
import { cx } from '@/lib/cx';
import { CONTACT, PRIMARY_NAV } from './nav-links';
import { SearchBox } from './search-box';

export type MobileDrawerProps = {
  categories: CatalogCategoryDto[];
  /**
   * The language switcher, rendered on the SERVER and passed in as a child.
   *
   * It cannot be imported here: this is a client component, and the switcher is
   * now a server component whose href is resolved per-request from the API. A
   * server component passed through a prop still renders on the server — the
   * client boundary only stops a client component from *importing* it.
   */
  localeSwitcher: ReactNode;
};

/**
 * Mobile navigation: a drawer sliding in from the INLINE-START edge.
 *
 * Inline-start, not left — so it enters from the right in Arabic and the left in
 * English, matching the side the reader's eye starts from and the side the menu
 * button sits on. Implemented with `start-0` and a direction-aware transform
 * (the RTL escape hatch below is the one place a physical axis is unavoidable,
 * because translate has no logical equivalent).
 *
 * Focus is trapped while open and Escape closes — without both, a screen reader
 * or keyboard user tabs straight out of the drawer into the page behind it,
 * which is still there and still scrollable.
 */
export function MobileDrawer({ categories, localeSwitcher }: MobileDrawerProps) {
  const t = useTranslations('nav');
  const [isOpen, setIsOpen] = useState(false);
  const [categoriesExpanded, setCategoriesExpanded] = useState(false);
  const tree = useMemo(() => buildCategoryTree(categories), [categories]);
  const panelRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!isOpen) return;

    const previouslyFocused = document.activeElement as HTMLElement | null;
    // The page behind must not scroll under the overlay.
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const focusables = () =>
      Array.from(
        panelRef.current?.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input, select, textarea, [tabindex]:not([tabindex="-1"])',
        ) ?? [],
      ).filter((element) => element.offsetParent !== null);

    focusables()[0]?.focus();

    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsOpen(false);
        return;
      }
      if (event.key !== 'Tab') return;

      const elements = focusables();
      if (elements.length === 0) return;

      const first = elements[0];
      const last = elements[elements.length - 1];
      if (!first || !last) return;

      // Wrap at both ends — this is the trap.
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
      previouslyFocused?.focus();
    };
  }, [isOpen]);

  const close = () => setIsOpen(false);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-expanded={isOpen}
        aria-label={t('openMenu')}
        onClick={() => setIsOpen(true)}
        className={cx(
          'cursor-pointer rounded-sm p-2 text-ink lg:hidden',
          'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-purple',
        )}
      >
        <Icon icon={Menu} size={24} />
      </button>

      {isOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            aria-label={t('closeMenu')}
            onClick={close}
            className="absolute inset-0 cursor-pointer bg-ink/40"
          />

          <div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-label={t('menuLabel')}
            className={cx(
              'absolute top-0 bottom-0 start-0 z-10 flex w-[min(20rem,85vw)] flex-col',
              'bg-surface shadow-overlay',
            )}
          >
            <div className="flex items-center justify-between gap-2 border-b border-border p-4">
              <span className="text-h4 font-semibold text-brand-purple">{t('menuLabel')}</span>
              <button
                type="button"
                onClick={close}
                aria-label={t('closeMenu')}
                className="cursor-pointer rounded-sm p-1 text-ink hover:text-brand-purple"
              >
                <Icon icon={X} size={22} />
              </button>
            </div>

            <div className="border-b border-border p-4">
              <SearchBox variant="drawer" onNavigate={close} />
            </div>

            <nav aria-label={t('menuLabel')} className="flex-1 overflow-y-auto p-4">
              <ul className="flex flex-col gap-1">
                {PRIMARY_NAV.map((item) => (
                  <li key={item.href}>
                    {item.hasMegaMenu ? (
                      <>
                        <div className="flex items-stretch">
                          <Link
                            href={item.href}
                            onClick={close}
                            className="flex-1 rounded-sm px-3 py-2.5 text-body font-medium text-ink hover:bg-surface-alt"
                          >
                            {t(item.messageKey)}
                          </Link>
                          <button
                            type="button"
                            aria-expanded={categoriesExpanded}
                            aria-label={t('browseCategories')}
                            onClick={() => setCategoriesExpanded((open) => !open)}
                            className="cursor-pointer rounded-sm px-3 text-ink hover:bg-surface-alt"
                          >
                            <Icon
                              icon={ChevronDown}
                              size={18}
                              className={cx('transition-transform', categoriesExpanded && 'rotate-180')}
                            />
                          </button>
                        </div>

                        {categoriesExpanded && (
                          <ul className="mt-1 flex flex-col border-s border-border ps-3">
                            {tree.map((category) => (
                              <li key={category.id}>
                                <Link
                                  href={{
                                    pathname: '/categories/[slug]',
                                    params: { slug: category.slug },
                                  }}
                                  onClick={close}
                                  className="flex items-baseline justify-between gap-2 rounded-sm px-3 py-2 text-body-sm font-medium text-ink hover:bg-panel"
                                >
                                  <span>{category.name}</span>
                                  <span className="bidi-latin font-mono text-caption text-ink-muted">
                                    {category.productCount}
                                  </span>
                                </Link>

                                {category.children.length > 0 && (
                                  <ul className="flex flex-col ps-3">
                                    {category.children.map((child) => (
                                      <li key={child.id}>
                                        <Link
                                          href={{
                                            pathname: '/categories/[slug]',
                                            params: { slug: child.slug },
                                          }}
                                          onClick={close}
                                          className="flex items-baseline justify-between gap-2 rounded-sm px-3 py-1.5 text-body-sm text-ink-muted hover:bg-panel"
                                        >
                                          <span>{child.name}</span>
                                          <span className="bidi-latin font-mono text-caption text-ink-muted">
                                            {child.productCount}
                                          </span>
                                        </Link>
                                      </li>
                                    ))}
                                  </ul>
                                )}
                              </li>
                            ))}
                          </ul>
                        )}
                      </>
                    ) : (
                      <Link
                        href={item.href}
                        onClick={close}
                        className="block rounded-sm px-3 py-2.5 text-body font-medium text-ink hover:bg-surface-alt"
                      >
                        {t(item.messageKey)}
                      </Link>
                    )}
                  </li>
                ))}
              </ul>
            </nav>

            <div className="flex flex-col gap-3 border-t border-border p-4">
              <a
                href={CONTACT.phoneHref}
                className="inline-flex items-center gap-2 text-body-sm text-brand-purple"
              >
                <Icon icon={Phone} size={16} />
                <span className="bidi-latin font-mono">{CONTACT.phoneDisplay}</span>
              </a>
              <a
                href={CONTACT.emailHref}
                className="inline-flex items-center gap-2 text-body-sm text-brand-purple"
              >
                <Icon icon={Mail} size={16} />
                <span className="bidi-latin">{CONTACT.email}</span>
              </a>
              <div className="self-start">{localeSwitcher}</div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
