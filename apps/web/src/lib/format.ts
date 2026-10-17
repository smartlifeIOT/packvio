import type { Locale } from '@packvio/shared';

/**
 * Number formatting locales.
 *
 * NOTE THE `-u-nu-latn` ON ARABIC. Plain `ar-SA` renders digits in Arabic-Indic
 * form (١٬٠٠٠), which is correct for some Saudi contexts — government forms,
 * religious material — but is not what Saudi commercial sites use. Every major
 * KSA storefront, Salla included, shows Latin digits. It also has to sit
 * millimetres from a Latin product code ("PCS/08") and a Latin size ("8 OZ") on
 * the same card, and switching numeral systems between those three makes the
 * card read as a mistake.
 *
 * The Arabic grouping separator (٬) is kept, so the number is still localized —
 * only the digit shapes are Latin. Flagged for review in the handover.
 */
const NUMBER_LOCALES: Record<Locale, string> = {
  ar: 'ar-SA-u-nu-latn',
  en: 'en-US',
};

export function formatNumber(value: number, locale: Locale): string {
  return new Intl.NumberFormat(NUMBER_LOCALES[locale]).format(value);
}
