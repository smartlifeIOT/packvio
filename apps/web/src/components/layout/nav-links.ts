import type { StaticAppPathname } from '@/i18n/routing';

/**
 * The primary navigation, defined once.
 *
 * `messageKey` indexes into the `nav` namespace, so the labels stay in
 * messages/*.json like every other user-facing string. `hasMegaMenu` marks the
 * one item that opens the category panel rather than navigating straight away —
 * it still links to /products, so it works with JavaScript disabled and for
 * anyone who hits Enter on it instead of hovering.
 */
export type NavItem = {
  href: StaticAppPathname;
  messageKey: string;
  hasMegaMenu?: boolean;
};

export const PRIMARY_NAV: readonly NavItem[] = [
  { href: '/', messageKey: 'home' },
  { href: '/products', messageKey: 'products', hasMegaMenu: true },
  { href: '/custom-printing', messageKey: 'customPrinting' },
  { href: '/about', messageKey: 'about' },
  { href: '/contact', messageKey: 'contact' },
] as const;

/** Business contact details, used by the header strip, footer and WhatsApp button. */
export const CONTACT = {
  phoneDisplay: '+966 59 481 6791',
  phoneHref: 'tel:+966594816791',
  whatsappNumber: '966594816791',
  email: 'nedhal@smavioltd.com',
  emailHref: 'mailto:nedhal@smavioltd.com',
} as const;

/**
 * Packvio's social accounts — one place, used by the footer, the contact page
 * and the Organization structured data (`sameAs`), so a handle changed here
 * changes everywhere search engines and AI assistants read it.
 */
export const SOCIAL_LINKS = [
  { network: 'instagram', label: 'Instagram', href: 'https://www.instagram.com/packvio.sa' },
  { network: 'tiktok', label: 'TikTok', href: 'https://www.tiktok.com/@packvio.sa' },
  { network: 'x', label: 'X', href: 'https://x.com/packviosa' },
  { network: 'snapchat', label: 'Snapchat', href: 'https://www.snapchat.com/add/packvio.sa' },
  { network: 'facebook', label: 'Facebook', href: 'https://www.facebook.com/packviosa' },
] as const;

export type SocialNetwork = (typeof SOCIAL_LINKS)[number]['network'];

/**
 * The office location.
 *
 * `mapsUrl` is Packvio's own Google Maps share link, so "Open in Google Maps"
 * lands on the exact pin. `lat`/`lng` drive the embedded map and the GeoCoordinates
 * in the structured data; until they are filled in from that pin, the map shows
 * Riyadh and the structured data omits coordinates rather than inventing them.
 * To fill them: open the link, press and hold the red pin, copy the two numbers.
 */
export const LOCATION = {
  mapsUrl: 'https://maps.app.goo.gl/aeqbm2NfD7TU2Xck7',
  lat: 24.814159660498632 as number | null,
  lng: 46.79884730981973 as number | null,
  city: { en: 'Riyadh', ar: 'الرياض' },
  country: 'SA',
} as const;
