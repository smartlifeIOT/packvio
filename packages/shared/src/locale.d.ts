/**
 * Supported locales. Arabic is the default; English is the secondary locale.
 * Keep this in sync with apps/web i18n routing config and messages/*.json.
 */
export type Locale = 'ar' | 'en';
export declare const LOCALES: readonly Locale[];
export declare const DEFAULT_LOCALE: Locale;
/** Text direction implied by a locale — drives <html dir> and logical CSS. */
export type Direction = 'rtl' | 'ltr';
/**
 * A string that exists in both locales. Every user-facing field mirrored from
 * Salla is stored this way so the web app can render either direction.
 */
export interface LocalizedText {
    ar: string;
    en: string;
}
