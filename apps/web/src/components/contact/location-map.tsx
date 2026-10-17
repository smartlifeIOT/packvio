import { getTranslations } from 'next-intl/server';
import { ExternalLink, MapPin } from 'lucide-react';
import type { Locale } from '@packvio/shared';
import { Icon } from '@/components/ui';
import { cx } from '@/lib/cx';

/**
 * ===========================================================================
 * ADDRESS PENDING — THIS IS NOT PACKVIO'S REAL LOCATION YET.
 *
 * The coordinates below are central Riyadh (the Olaya district), used as a
 * stand-in until Packvio confirms the warehouse/office address. To correct it,
 * set these in .env — no code change needed:
 *
 *     NEXT_PUBLIC_MAP_LAT=24.xxxxx
 *     NEXT_PUBLIC_MAP_LNG=46.xxxxx
 *     NEXT_PUBLIC_MAP_ZOOM=16
 *
 * and update `contact.address` in messages/{ar,en}.json to the street address.
 * Until then the copy says "Riyadh, Saudi Arabia" and nothing on the page
 * claims a precise location the pin does not actually mark.
 * ===========================================================================
 */
const DEFAULT_LAT = 24.7136;
const DEFAULT_LNG = 46.6753;
const DEFAULT_ZOOM = 14;

/** A degree of latitude is ~111km; this window is roughly 1.5km across. */
const BBOX_SPAN = 0.012;

function coordinate(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

/**
 * The location map.
 *
 * OpenStreetMap rather than Google Maps, and that is a privacy decision with
 * teeth: a Google Maps embed sets cookies and sends the visitor's IP and
 * referrer to Google before they have agreed to anything, which under PDPL and
 * GDPR is the kind of third-party transfer that needs a consent banner in front
 * of it. OSM's embed sets no cookies and needs no API key, so the page stays
 * consent-free — and the site keeps its "no banner" property, which is worth
 * more than the slightly nicer tiles.
 *
 * `loading="lazy"` because the map sits at the bottom of a sidebar: most
 * readers never scroll to it, and an eager iframe would pull ~200KB of tiles on
 * every contact-page load for nothing.
 */
export async function LocationMap({ locale }: { locale: Locale }) {
  const t = await getTranslations({ locale, namespace: 'contact.map' });

  const lat = coordinate(process.env.NEXT_PUBLIC_MAP_LAT, DEFAULT_LAT);
  const lng = coordinate(process.env.NEXT_PUBLIC_MAP_LNG, DEFAULT_LNG);
  const zoom = coordinate(process.env.NEXT_PUBLIC_MAP_ZOOM, DEFAULT_ZOOM);

  const bbox = [lng - BBOX_SPAN, lat - BBOX_SPAN / 2, lng + BBOX_SPAN, lat + BBOX_SPAN / 2]
    .map((value) => value.toFixed(5))
    .join('%2C');

  const embedSrc =
    `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}` +
    `&layer=mapnik&marker=${lat.toFixed(5)}%2C${lng.toFixed(5)}`;

  /**
   * `geo:` first, with an OSM fallback.
   *
   * A `geo:` URI is the platform's own "open this in a map app" handoff — on
   * Android and iOS it opens whatever the reader actually uses, rather than
   * forcing them through a website. Desktop browsers ignore it, which is why
   * the visible link is the OSM one and `geo:` is offered alongside it.
   */
  const osmHref = `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=${Math.round(zoom)}/${lat}/${lng}`;

  return (
    <div className="overflow-hidden rounded-md border border-border">
      <iframe
        // A title is what a screen reader announces instead of "iframe", and
        // what the tab order lands on — an untitled map frame is a dead stop.
        title={t('frameTitle')}
        src={embedSrc}
        loading="lazy"
        referrerPolicy="no-referrer-when-downgrade"
        className="block h-56 w-full border-0 bg-surface-alt"
      />

      <div className="flex flex-col gap-2 border-t border-border bg-surface-alt p-4">
        <p className="inline-flex items-start gap-2 text-body-sm text-ink">
          <Icon icon={MapPin} size={16} className="mt-0.5 shrink-0 text-brand-purple" />
          <span>{t('addressLine')}</span>
        </p>

        <a
          href={osmHref}
          target="_blank"
          rel="noopener noreferrer"
          className={cx(
            'inline-flex items-center gap-1.5 text-body-sm font-medium text-brand-purple',
            'hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-purple',
          )}
        >
          {t('directions')}
          <Icon icon={ExternalLink} size={14} />
        </a>

        <p className="text-caption text-ink-muted">{t('pendingNote')}</p>
      </div>
    </div>
  );
}
