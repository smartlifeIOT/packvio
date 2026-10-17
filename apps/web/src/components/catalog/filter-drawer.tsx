'use client';

import { useTranslations } from 'next-intl';
import { SlidersHorizontal, X } from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Icon } from '@/components/ui';
import { cx } from '@/lib/cx';

export type FilterDrawerProps = {
  /**
   * The rendered <FilterSidebar>, passed in as a child.
   *
   * The sidebar is a SERVER component — it fetches nothing but it does await
   * translations — and a client component cannot import one. Taking it as a
   * child keeps it server-rendered: the client boundary only blocks importing
   * across it, not passing already-rendered output through it.
   */
  children: ReactNode;
  /** Shown on the trigger so the count is visible without opening the drawer. */
  activeCount: number;
  className?: string;
};

/**
 * The filter sidebar on small screens.
 *
 * Desktop shows the same filters permanently in a column; below `lg` there is
 * no room, so they move behind this trigger. The panel is the same markup, not
 * a second implementation — which is why it takes the sidebar as a child.
 *
 * Opens from the inline-START edge, matching the navigation drawer, so both
 * drawers on the site come from the same side rather than teaching two habits.
 */
export function FilterDrawer({ children, activeCount, className }: FilterDrawerProps) {
  const t = useTranslations('products.filters');
  const [isOpen, setIsOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  /** Escape closes, focus returns to the trigger, and the page stops scrolling. */
  useEffect(() => {
    if (!isOpen) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsOpen(false);
        triggerRef.current?.focus();
        return;
      }

      // Focus trap: Tab past either end wraps to the other.
      if (event.key !== 'Tab') return;
      const focusables = panelRef.current?.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input, select, textarea, [tabindex]:not([tabindex="-1"])',
      );
      if (!focusables || focusables.length === 0) return;

      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (!first || !last) return;

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [isOpen]);

  return (
    <div className={className}>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setIsOpen(true)}
        aria-expanded={isOpen}
        className={cx(
          'inline-flex items-center gap-2 rounded-md border border-border px-3 py-2 text-body-sm text-ink',
          'transition-colors hover:border-brand-purple hover:text-brand-purple',
          'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-purple',
        )}
      >
        <Icon icon={SlidersHorizontal} size={16} />
        {t('open')}
        {activeCount > 0 && (
          <span className="inline-flex size-5 items-center justify-center rounded-pill bg-brand-purple text-caption font-semibold text-surface">
            {activeCount}
          </span>
        )}
      </button>

      {isOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            aria-label={t('close')}
            onClick={() => setIsOpen(false)}
            className="absolute inset-0 bg-ink/40"
          />

          <div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-label={t('title')}
            className={cx(
              'absolute inset-y-0 start-0 flex w-[85vw] max-w-sm flex-col bg-surface shadow-raised',
            )}
          >
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <h2 className="text-body font-semibold text-brand-purple">{t('title')}</h2>
              <button
                type="button"
                onClick={() => {
                  setIsOpen(false);
                  triggerRef.current?.focus();
                }}
                aria-label={t('close')}
                className="rounded-sm p-1.5 text-ink-muted transition-colors hover:bg-surface-alt hover:text-brand-purple focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-purple"
              >
                <Icon icon={X} size={20} />
              </button>
            </div>

            {/* Each filter link navigates, which closes the drawer by unmounting
                it — no explicit onClick handler needed or wanted. */}
            <div className="flex-1 overflow-y-auto p-4">{children}</div>
          </div>
        </div>
      )}
    </div>
  );
}
