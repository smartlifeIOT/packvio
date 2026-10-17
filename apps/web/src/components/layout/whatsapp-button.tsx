import { getTranslations } from 'next-intl/server';
import type { Locale } from '@packvio/shared';
import { CONTACT } from './nav-links';

/**
 * Floating WhatsApp contact button.
 *
 * WhatsApp is the default business channel in Saudi Arabia — for a lot of buyers
 * it is the ONLY channel they will use to open a conversation, ahead of a form
 * or an email. The pre-filled message is written in the reader's own language so
 * the merchant can tell at a glance which language to reply in.
 *
 * Pinned to the inline-END bottom corner, so it sits bottom-left in Arabic and
 * bottom-right in English — out of the way of the reading direction either way.
 * `z-30` keeps it under the mobile drawer's overlay (z-50) rather than floating
 * on top of a modal.
 */
export async function WhatsAppButton({ locale }: { locale: Locale }) {
  const t = await getTranslations({ locale, namespace: 'contact' });

  const href = `https://wa.me/${CONTACT.whatsappNumber}?text=${encodeURIComponent(
    t('whatsappPrefill'),
  )}`;

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={t('whatsappLabel')}
      className={[
        'fixed bottom-5 end-5 z-30 inline-flex size-14 items-center justify-center',
        'rounded-pill bg-[#25D366] shadow-raised transition-transform',
        'hover:scale-105 focus-visible:outline-2 focus-visible:outline-offset-2',
        'focus-visible:outline-brand-purple',
      ].join(' ')}
    >
      {/* The WhatsApp glyph is a brand mark, not a UI icon — lucide has no
          equivalent, and substituting a generic speech bubble would lose the
          instant recognition that makes this button work. */}
      <svg
        viewBox="0 0 24 24"
        width={28}
        height={28}
        fill="#ffffff"
        aria-hidden="true"
        focusable="false"
      >
        <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.174.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51l-.57-.01c-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884a9.82 9.82 0 0 1 6.988 2.896 9.83 9.83 0 0 1 2.893 6.994c-.003 5.45-4.437 9.885-9.885 9.885M20.52 3.449C18.24 1.245 15.24 0 12.045 0 5.463 0 .104 5.359.101 11.945c0 2.096.549 4.14 1.595 5.945L0 24l6.335-1.652a11.9 11.9 0 0 0 5.71 1.454h.006c6.585 0 11.946-5.36 11.949-11.945a11.9 11.9 0 0 0-3.48-8.413Z" />
      </svg>
    </a>
  );
}
