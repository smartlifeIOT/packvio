import { getTranslations } from 'next-intl/server';
import { ArrowRight, Mail, MessageCircle, Phone } from 'lucide-react';
import type { Locale } from '@packvio/shared';
import { Button, Icon, Section } from '@/components/ui';
import { CONTACT } from '@/components/layout/nav-links';

/**
 * The closing conversion band.
 *
 * The quote request is the site's primary conversion, so the last thing on the
 * home page is an ask — with the three ways a Saudi buyer actually opens a
 * conversation (form, phone, WhatsApp) rather than only the one we would prefer.
 */
export async function QuoteCta({ locale }: { locale: Locale }) {
  const t = await getTranslations({ locale, namespace: 'home.quote' });
  const tContact = await getTranslations({ locale, namespace: 'contact' });

  const whatsappHref = `https://wa.me/${CONTACT.whatsappNumber}?text=${encodeURIComponent(
    tContact('whatsappPrefill'),
  )}`;

  return (
    <Section tone="panel" spacing="lg" aria-labelledby="home-quote">
      <div className="flex flex-col items-center gap-lg text-center">
        <div className="max-w-[44rem]">
          <h2 id="home-quote" className="text-h1 font-semibold text-brand-purple">
            {t('heading')}
          </h2>
          <p className="mt-3 text-body-lg text-ink-muted">{t('body')}</p>
          <p className="mt-2 text-body-sm text-ink-muted">{t('teaser')}</p>
        </div>

        <div className="flex flex-wrap items-center justify-center gap-3">
          <Button as="a" href="/quote" size="lg" iconEnd={<Icon icon={ArrowRight} size={20} />}>
            {t('cta')}
          </Button>

          <Button
            as="external"
            href={CONTACT.phoneHref}
            size="lg"
            variant="secondary"
            icon={<Icon icon={Phone} size={18} />}
          >
            {t('callUs')}
          </Button>

          <Button
            as="external"
            href={whatsappHref}
            target="_blank"
            size="lg"
            variant="ghost"
            icon={<Icon icon={MessageCircle} size={18} />}
          >
            {t('whatsapp')}
          </Button>
        </div>

        <p className="text-body-sm text-ink-muted">
          <Icon icon={Mail} size={14} className="inline align-[-2px]" />{' '}
          <a href={CONTACT.emailHref} className="bidi-latin text-brand-purple hover:underline">
            {CONTACT.email}
          </a>
        </p>
      </div>
    </Section>
  );
}
