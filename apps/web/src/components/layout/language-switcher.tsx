import { getTranslations } from 'next-intl/server';
import { Languages } from 'lucide-react';
import type { Locale } from '@packvio/shared';
import { Icon } from '@/components/ui';
import { otherLocale } from '@/i18n/routing';
import { cx } from '@/lib/cx';

export type LanguageSwitcherProps = {
  locale: Locale;
  /**
   * Where "the other language" leads for THIS request, resolved on the server
   * by `resolveAlternateHref`. Already localized and locale-prefixed, so it is
   * rendered on a plain <a>.
   */
  href: string;
  /** `compact` for the mobile drawer, `inline` for the desktop contact strip. */
  variant?: 'inline' | 'compact';
  className?: string;
};

/**
 * Switches locale while STAYING ON THE SAME PAGE.
 *
 * A SERVER component, and that is the whole point. The previous version was a
 * client component that read the alternate slug out of a React context which a
 * page populated in an effect — so the href in the initial HTML was always the
 * home-page fallback, and only became correct after hydration. Crawlers never
 * saw the right URL, and neither did anyone who clicked quickly.
 *
 * Now the href arrives already resolved from the layout (see
 * lib/locale-alternates.ts) and is correct in the first byte of HTML.
 *
 * A plain <a>, not next-intl's <Link>: the href is a complete, already-localized
 * URL rather than an internal pathname needing translation, and a full document
 * load is the honest behaviour for a language change — it swaps `dir`, the font
 * stack and every string on the page.
 */
export async function LanguageSwitcher({
  locale,
  href,
  variant = 'inline',
  className,
}: LanguageSwitcherProps) {
  const t = await getTranslations({ locale, namespace: 'nav' });
  const target = otherLocale(locale);

  return (
    <a
      href={href}
      hrefLang={target}
      lang={target}
      // The label is written in the language being switched TO, which is the
      // only version of it the reader who needs it can read.
      aria-label={t('switchTo', { language: t(`languageName.${target}`) })}
      className={cx(
        'inline-flex items-center gap-1.5 font-medium transition-colors',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-current',
        variant === 'inline'
          ? 'text-caption text-ink-muted hover:text-brand-purple'
          : 'rounded-md border border-border px-3 py-2 text-body-sm text-brand-purple hover:bg-surface-alt',
        className,
      )}
    >
      <Icon icon={Languages} size={variant === 'inline' ? 14 : 18} />
      <span>{t(`languageName.${target}`)}</span>
    </a>
  );
}
