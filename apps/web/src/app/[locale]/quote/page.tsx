import { getTranslations, setRequestLocale } from 'next-intl/server';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { HelpCircle, Mail, MessageCircle, Phone } from 'lucide-react';
import { CONTACT } from '@/components/layout/nav-links';
import { QuoteFunnel } from '@/components/quote/quote-funnel';
import { Icon, Section } from '@/components/ui';
import { Link } from '@/i18n/navigation';
import { isLocale } from '@/i18n/routing';
import { findProductByCode } from '@/lib/api';

type QuotePageProps = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ code?: string | string[]; quantity?: string | string[] }>;
};

export async function generateMetadata({ params }: QuotePageProps): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const t = await getTranslations({ locale, namespace: 'quote' });
  return {
    title: t('title'),
    description: t('lead'),
    // A prefilled quote form is a step in a funnel, not a landing page.
    robots: { index: true, follow: true },
  };
}

function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/**
 * The RFQ page — the site's primary conversion.
 *
 * `?code=` is resolved HERE, on the server, rather than by the form fetching
 * it after mount. The buyer arriving from a product page sees that product
 * already listed in the first paint, with its real name and case size, instead
 * of a blank form that fills itself in a moment later.
 *
 * An unknown code is not an error: the reader still gets the form, just without
 * a prefilled line. 404ing a quote form because a URL parameter was stale would
 * throw away a lead over a detail the buyer never chose.
 */
export default async function QuotePage({ params, searchParams }: QuotePageProps) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  setRequestLocale(locale);

  const query = await searchParams;
  const code = firstParam(query.code);
  const parsedQuantity = Number.parseInt(firstParam(query.quantity) ?? '1', 10);
  const quantity = Number.isFinite(parsedQuantity) && parsedQuantity > 0 ? parsedQuantity : 1;

  const t = await getTranslations({ locale, namespace: 'quote' });

  const product = code ? await findProductByCode(code, locale) : null;

  const whatsappHref = `https://wa.me/${CONTACT.whatsappNumber}?text=${encodeURIComponent(
    t('whatsappPrefill'),
  )}`;

  return (
    <Section spacing="lg">
      <div className="grid gap-xl lg:grid-cols-[1fr_18rem]">
        <div className="min-w-0">
          {/* The heading is passed INTO the funnel so it is replaced by the
              thank-you view rather than left standing above it — see
              QuoteFunnel's `intro`. */}
          <QuoteFunnel
            source={product ? 'product' : 'quote_page'}
            prefillCode={product?.code}
            prefillName={product?.name}
            prefillCaseQuantity={product?.caseQuantity ?? null}
            prefillQuantity={quantity}
            intro={
              <div className="mb-xl">
                <h1 className="text-display-3 font-semibold text-brand-purple">{t('heading')}</h1>
                <p className="mt-3 max-w-[46rem] text-body-lg text-ink-muted">{t('lead')}</p>
              </div>
            }
          />
        </div>

        <aside className="lg:pt-2">
          <div className="rounded-md border border-border bg-surface-alt p-lg">
            <h2 className="text-h3 font-semibold text-brand-purple">{t('aside.heading')}</h2>
            <p className="mt-2 text-body-sm text-ink-muted">{t('aside.body')}</p>

            <ul className="mt-lg flex flex-col gap-3 text-body-sm">
              <li>
                <a
                  href={whatsappHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 text-brand-purple hover:underline"
                >
                  <Icon icon={MessageCircle} size={16} />
                  {t('whatsappCta')}
                </a>
              </li>
              <li>
                <a
                  href={CONTACT.phoneHref}
                  className="inline-flex items-center gap-2 text-brand-purple hover:underline"
                >
                  <Icon icon={Phone} size={16} />
                  <span className="bidi-latin font-mono">{CONTACT.phoneDisplay}</span>
                </a>
              </li>
              <li>
                <a
                  href={CONTACT.emailHref}
                  className="inline-flex items-center gap-2 text-brand-purple hover:underline"
                >
                  <Icon icon={Mail} size={16} />
                  <span className="bidi-latin">{CONTACT.email}</span>
                </a>
              </li>
              <li>
                {/* Minimums, lead times and printing rules are the questions
                    that stall a first RFQ — answering them one click from the
                    form is worth more than answering them on a page nobody
                    reaches from here. */}
                <Link
                  href="/faq"
                  className="inline-flex items-center gap-2 text-brand-purple hover:underline"
                >
                  <Icon icon={HelpCircle} size={16} />
                  {t('aside.faqCta')}
                </Link>
              </li>
            </ul>
          </div>
        </aside>
      </div>
    </Section>
  );
}
