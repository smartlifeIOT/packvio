import { getTranslations } from 'next-intl/server';
import { ExternalLink, MapPin } from 'lucide-react';
import type { Locale } from '@packvio/shared';
import { Icon } from '@/components/ui';
import { LOCATION } from '@/components/layout/nav-links';
import { cx } from '@/lib/cx';

/**
 * The office location, on Google Maps.
 *
 * The button opens Packvio's own Google Maps share link, so it always lands on
 * the exact pin. The embedded map uses the coordinates in `LOCATION`
 * (components/layout/nav-links.ts) — while those are unset it shows Riyadh, and
 * the button is the precise route.
 *
 * Google's keyless embed (`output=embed`) rather than OpenStreetMap: Packvio
 * asked for its Google location to be what the public sees. The trade is
 * privacy — Google's iframe sets cookies and receives the visitor's IP — so it
 * stays `loading="lazy"` at the bottom of the contact sidebar, and it only
 * loads for readers who scroll to it.
 */
export async function LocationMap({ locale }: { locale: Locale }) {
  const t = await getTranslations({ locale, namespace: 'contact.map' });

  const hasPin = LOCATION.lat !== null && LOCATION.lng !== null;
  const query = hasPin
    ? `${LOCATION.lat},${LOCATION.lng}`
    : `${LOCATION.city.en}, Saudi Arabia`;
  const embedSrc =
    `https://maps.google.com/maps?q=${encodeURIComponent(query)}` +
    `&z=${hasPin ? 16 : 11}&hl=${locale}&output=embed`;

  return (
    <div className="overflow-hidden rounded-md border border-border">
      <iframe
        title={t('frameTitle')}
        src={embedSrc}
        loading="lazy"
        referrerPolicy="no-referrer-when-downgrade"
        className="block h-64 w-full border-0 bg-surface-alt"
      />

      <div className="flex flex-col gap-3 border-t border-border bg-surface-alt p-4">
        <p className="inline-flex items-start gap-2 text-body-sm text-ink">
          <Icon icon={MapPin} size={16} className="mt-0.5 shrink-0 text-brand-purple" />
          <span>{t('addressLine')}</span>
        </p>

        <a
          href={LOCATION.mapsUrl}
          target="_blank"
          rel="noopener noreferrer"
          className={cx(
            'inline-flex items-center justify-center gap-2 self-start rounded-pill bg-brand-purple px-4 py-2',
            'text-body-sm font-medium text-surface transition-colors hover:bg-brand-purple/90',
            'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-purple',
          )}
        >
          {t('directions')}
          <Icon icon={ExternalLink} size={14} />
        </a>
      </div>
    </div>
  );
}
