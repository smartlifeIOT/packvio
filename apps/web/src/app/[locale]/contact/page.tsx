import { getTranslations, setRequestLocale } from 'next-intl/server';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Clock, Mail, MapPin, MessageCircle, Phone } from 'lucide-react';
import { Breadcrumbs } from '@/components/catalog/breadcrumbs';
import { CONTACT } from '@/components/layout/nav-links';
import { LocationMap } from '@/components/contact/location-map';
import { QuoteFunnel } from '@/components/quote/quote-funnel';
import { Icon, Section } from '@/components/ui';
import { isLocale } from '@/i18n/routing';
import { cx } from '@/lib/cx';

type PageProps = { params: Promise<{ locale: string }> };

const HOURS = ['weekdays', 'thursday', 'weekend'] as const;

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const t = await getTranslations({ locale, namespace: 'contact' });
  return { title: t('title'), description: t('lead') };
}

/**
 * Contact.
 *
 * The enquiry form is the SAME `QuoteFunnel` the RFQ page uses, in its
 * `contact` variant: no line-item editor, a required message, and
 * `source: 'contact'` so sales can tell a general question from a priced
 * request. One endpoint, one inbox, one shape to read — a separate
 * contact-message table would mean two places to check and one of them
 * eventually going unchecked.
 */
export default async function ContactPage({ params }: PageProps) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  setRequestLocale(locale);

  const t = await getTranslations({ locale, namespace: 'contact' });

  const whatsappHref = `https://wa.me/${CONTACT.whatsappNumber}?text=${encodeURIComponent(
    t('whatsappPrefill'),
  )}`;

  return (
    <Section spacing="lg">
      <Breadcrumbs locale={locale} trail={[{ label: t('heading') }]} />

      <h1 className="mt-lg text-display-2 font-semibold text-brand-purple">{t('heading')}</h1>
      <p className="mt-3 max-w-[46rem] text-body-lg text-ink-muted">{t('lead')}</p>

      <div className="mt-xl grid gap-xl lg:grid-cols-[1fr_20rem]">
        <div className="min-w-0">
          <QuoteFunnel
            variant="contact"
            source="contact"
            successHeadingLevel="h2"
            intro={
              <div className="mb-lg">
                <h2 className="text-h2 font-semibold text-brand-purple">{t('formHeading')}</h2>
                <p className="mt-2 text-body-sm text-ink-muted">{t('formLead')}</p>
              </div>
            }
          />
        </div>

        <aside className="flex flex-col gap-lg">
          <div className="rounded-md border border-border bg-surface-alt p-lg">
            <h2 className="text-h3 font-semibold text-brand-purple">{t('detailsHeading')}</h2>

            <ul className="mt-4 flex flex-col gap-4 text-body-sm">
              <li className="flex items-start gap-2.5">
                <Icon icon={MapPin} size={18} className="mt-0.5 shrink-0 text-brand-purple" />
                <span className="text-ink">{t('address')}</span>
              </li>

              <li className="flex items-start gap-2.5">
                <Icon icon={Phone} size={18} className="mt-0.5 shrink-0 text-brand-purple" />
                <a href={CONTACT.phoneHref} className="text-brand-purple hover:underline">
                  <span className="bidi-latin font-mono">{CONTACT.phoneDisplay}</span>
                </a>
              </li>

              <li className="flex items-start gap-2.5">
                <Icon icon={Mail} size={18} className="mt-0.5 shrink-0 text-brand-purple" />
                <a href={CONTACT.emailHref} className="text-brand-purple hover:underline">
                  <span className="bidi-latin">{CONTACT.email}</span>
                </a>
              </li>

              <li className="flex items-start gap-2.5">
                <Icon
                  icon={MessageCircle}
                  size={18}
                  className="mt-0.5 shrink-0 text-brand-purple"
                />
                <a
                  href={whatsappHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-brand-purple hover:underline"
                >
                  {t('whatsappCta')}
                </a>
              </li>
            </ul>
          </div>

          <div className="rounded-md border border-border bg-surface-alt p-lg">
            <h2 className="inline-flex items-center gap-2 text-h3 font-semibold text-brand-purple">
              <Icon icon={Clock} size={18} />
              {t('hoursHeading')}
            </h2>

            <dl className="mt-4 flex flex-col gap-2 text-body-sm">
              {HOURS.map((key) => (
                <div key={key} className="flex flex-wrap justify-between gap-2">
                  <dt className="text-ink-muted">{t(`hours.${key}.days`)}</dt>
                  {/* Times are Latin digits inside Arabic copy — isolated so
                      "9:00 – 18:00" does not reorder into nonsense. */}
                  <dd className="bidi-latin font-mono text-ink">{t(`hours.${key}.time`)}</dd>
                </div>
              ))}
            </dl>

            <p className="mt-3 text-caption text-ink-muted">{t('hoursNote')}</p>
          </div>
          <LocationMap locale={locale} />
        </aside>
      </div>
    </Section>
  );
}
