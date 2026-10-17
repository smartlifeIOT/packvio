'use client';

import { useLocale, useTranslations } from 'next-intl';
import { Search, X } from 'lucide-react';
import { useEffect, useId, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import type { CatalogSuggestionDto, Locale } from '@packvio/shared';
import { Icon } from '@/components/ui';
import { useRouter } from '@/i18n/navigation';
import { isLocale } from '@/i18n/routing';
import { cx } from '@/lib/cx';

const DEBOUNCE_MS = 250;
const MIN_QUERY_LENGTH = 1;

export type SearchBoxProps = {
  /** `header` is the desktop bar; `drawer` is the full-width mobile field. */
  variant?: 'header' | 'drawer';
  /** Called after a successful navigation, so the mobile drawer can close. */
  onNavigate?: () => void;
  className?: string;
};

/**
 * Header search with an autocomplete dropdown.
 *
 * Implements the ARIA combobox pattern rather than a div soup: the input owns
 * `role="combobox"` with `aria-expanded` and `aria-activedescendant`, and the
 * dropdown is a real `listbox` of `option`s. That is what makes arrow-key
 * navigation announce the highlighted product instead of silently moving a
 * visual highlight a screen reader cannot see.
 *
 * The result count goes to a polite live region for the same reason: a sighted
 * reader sees eight rows appear, and without the announcement nobody else knows
 * anything happened at all.
 */
export function SearchBox({ variant = 'header', onNavigate, className }: SearchBoxProps) {
  const t = useTranslations('search');
  const rawLocale = useLocale();
  const locale: Locale = isLocale(rawLocale) ? rawLocale : 'ar';
  const router = useRouter();

  const listboxId = useId();
  const optionId = (index: number) => `${listboxId}-option-${index}`;

  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState<CatalogSuggestionDto[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [hasSearched, setHasSearched] = useState(false);

  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  /** Debounced fetch. The abort controller kills the in-flight request when the
   *  query moves on, so a slow early keystroke cannot overwrite a fast later one. */
  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < MIN_QUERY_LENGTH) {
      setSuggestions([]);
      setHasSearched(false);
      setIsOpen(false);
      return;
    }

    const controller = new AbortController();
    const timer = setTimeout(() => {
      const params = new URLSearchParams({ q: trimmed, locale });
      fetch(`/api/suggest?${params.toString()}`, { signal: controller.signal })
        .then((response) => (response.ok ? response.json() : []))
        .then((data: CatalogSuggestionDto[]) => {
          setSuggestions(data);
          setHasSearched(true);
          setIsOpen(true);
          setActiveIndex(-1);
        })
        .catch(() => {
          // Aborted or failed — leave the previous state alone rather than
          // flashing "no results" at someone who is still typing.
        });
    }, DEBOUNCE_MS);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query, locale]);

  /** Close when focus or a click leaves the component entirely. */
  useEffect(() => {
    if (!isOpen) return;

    const onPointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setIsOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [isOpen]);

  const goToProduct = (suggestion: CatalogSuggestionDto) => {
    setIsOpen(false);
    router.push({ pathname: '/product/[slug]', params: { slug: suggestion.slug } });
    onNavigate?.();
  };

  const submitSearch = (event?: FormEvent) => {
    event?.preventDefault();
    const trimmed = query.trim();
    if (!trimmed) return;

    setIsOpen(false);
    router.push({ pathname: '/products', query: { q: trimmed } });
    onNavigate?.();
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Escape') {
      // Escape closes the list but keeps the text — the reader may still submit.
      setIsOpen(false);
      setActiveIndex(-1);
      return;
    }

    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      if (suggestions.length === 0) return;
      event.preventDefault();
      if (!isOpen) setIsOpen(true);

      const delta = event.key === 'ArrowDown' ? 1 : -1;
      setActiveIndex((current) => {
        const next = current + delta;
        // Wrap, so ArrowUp from the input jumps to the last result.
        if (next < 0) return suggestions.length - 1;
        if (next >= suggestions.length) return 0;
        return next;
      });
      return;
    }

    if (event.key === 'Enter') {
      const active = activeIndex >= 0 ? suggestions[activeIndex] : undefined;
      if (active) {
        event.preventDefault();
        goToProduct(active);
      }
      // Otherwise the form's submit handler runs and takes them to the results.
    }
  };

  const showDropdown = isOpen && hasSearched;

  return (
    <div ref={rootRef} className={cx('relative', className)}>
      <form role="search" onSubmit={submitSearch}>
        <label htmlFor={`${listboxId}-input`} className="sr-only">
          {t('label')}
        </label>

        <div
          className={cx(
            'flex items-center gap-2 rounded-md border border-border bg-surface',
            'focus-within:border-brand-purple focus-within:ring-2 focus-within:ring-brand-purple/20',
            variant === 'header' ? 'px-3 py-2' : 'px-3 py-2.5',
          )}
        >
          <Icon icon={Search} size={18} className="text-ink-muted" />

          <input
            ref={inputRef}
            id={`${listboxId}-input`}
            type="search"
            role="combobox"
            autoComplete="off"
            aria-expanded={showDropdown}
            aria-controls={listboxId}
            aria-autocomplete="list"
            aria-activedescendant={activeIndex >= 0 ? optionId(activeIndex) : undefined}
            placeholder={t('placeholder')}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={onKeyDown}
            onFocus={() => hasSearched && setIsOpen(true)}
            className={cx(
              'w-full bg-transparent text-body-sm text-ink outline-none',
              'placeholder:text-ink-muted',
              // Chrome draws its own clear button on type="search"; we have one.
              '[&::-webkit-search-cancel-button]:hidden',
            )}
          />

          {query && (
            <button
              type="button"
              onClick={() => {
                setQuery('');
                setIsOpen(false);
                inputRef.current?.focus();
              }}
              aria-label={t('clear')}
              className="cursor-pointer text-ink-muted hover:text-ink"
            >
              <Icon icon={X} size={16} />
            </button>
          )}
        </div>
      </form>

      {/* Announced to assistive tech; visually redundant with the dropdown. */}
      <p aria-live="polite" className="sr-only">
        {hasSearched
          ? suggestions.length > 0
            ? t('resultsCount', { count: suggestions.length })
            : t('noResults')
          : ''}
      </p>

      {showDropdown && (
        <div
          className={cx(
            'absolute start-0 end-0 top-full z-50 mt-1 overflow-hidden',
            'rounded-md border border-border bg-surface shadow-overlay',
          )}
        >
          {suggestions.length === 0 ? (
            <p className="px-3 py-4 text-body-sm text-ink-muted">{t('noResults')}</p>
          ) : (
            <ul id={listboxId} role="listbox" aria-label={t('label')} className="max-h-96 overflow-y-auto">
              {suggestions.map((suggestion, index) => (
                <li key={suggestion.id} role="none">
                  <button
                    type="button"
                    id={optionId(index)}
                    role="option"
                    aria-selected={index === activeIndex}
                    onClick={() => goToProduct(suggestion)}
                    onMouseEnter={() => setActiveIndex(index)}
                    className={cx(
                      'flex w-full cursor-pointer items-center gap-3 px-3 py-2 text-start',
                      index === activeIndex ? 'bg-panel' : 'bg-transparent hover:bg-surface-alt',
                    )}
                  >
                    <SuggestionThumbnail suggestion={suggestion} />

                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate text-body-sm text-ink">{suggestion.name}</span>
                      <span className="bidi-latin truncate font-mono text-caption text-ink-muted">
                        {suggestion.code}
                        {suggestion.categoryName ? ` · ${suggestion.categoryName}` : ''}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * 40px thumbnail. With no product photography yet this is the SKU on a panel
 * tint — the same visual language as the full-size ImagePlaceholder, just small.
 */
function SuggestionThumbnail({ suggestion }: { suggestion: CatalogSuggestionDto }) {
  if (suggestion.primaryImage) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- fixed 40px thumbnail in a
      // transient dropdown; next/image's wrapper and optimizer hop buy nothing here.
      <img
        src={suggestion.primaryImage}
        alt=""
        width={40}
        height={40}
        className="size-10 shrink-0 rounded-sm bg-panel object-contain"
      />
    );
  }

  return (
    <span
      aria-hidden="true"
      className="flex size-10 shrink-0 items-center justify-center rounded-sm bg-panel panel-inset"
    >
      <span className="bidi-latin font-mono text-[10px] text-brand-purple/70">
        {suggestion.code.slice(0, 6)}
      </span>
    </span>
  );
}
