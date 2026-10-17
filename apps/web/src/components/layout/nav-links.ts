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
