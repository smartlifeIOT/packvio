import { getTranslations, setRequestLocale } from 'next-intl/server';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { ArrowRight, MessageCircle } from 'lucide-react';
import { Breadcrumbs } from '@/components/catalog/breadcrumbs';
import { FaqAccordion, type FaqItem } from '@/components/faq/faq-accordion';
import { FAQ_GROUPS } from '@/components/faq/faq-content';
import { FaqJsonLd } from '@/components/faq/faq-json-ld';
import { CONTACT } from '@/components/layout/nav-links';
import { Button, Icon, Section } from '@/components/ui';
import { isLocale } from '@/i18n/routing';

type PageProps = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const t = await getTranslations({ locale, namespace: 'faq' });
  return { title: t('title'), description: t('lead') };
}

/**
 * Frequently asked questions.
 *
 * Questions Packvio has not yet answered are still LISTED, with a placeholder
 * and a visible "pending" badge. Omitting them would be tidier and worse: the
 * questions a buyer actually asks before a first wholesale order — minimum
 * quantity, lead time, payment terms — are exactly the ones still open, and a
 * FAQ that skips them reads as evasive rather than incomplete. Showing the
 * question with an honest "we will confirm this" also tells Nedhal precisely
 * what to fill in.
 *
 * Only the answered ones reach the structured data — see FaqJsonLd.
 */
export default async function FaqPage({ params }: PageProps) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  setRequestLocale(locale);

  const t = await getTranslations({ locale, namespace: 'faq' });

  const groups = FAQ_GROUPS.map((group) => ({
    key: group.key,
    heading: t(`groups.${group.key}`),
    items: group.questions.map<FaqItem>((question) => ({
      id: `${group.key}-${question.key}`,
      question: t(`items.${group.key}.${question.key}.q`),
      answer: t(`items.${group.key}.${question.key}.a`),
      isAnswered: question.answered,
      pendingLabel: question.answered ? undefined : t('pendingLabel'),
    })),
  }));

  const allItems = groups.flatMap((group) => group.items);

  const whatsappHref = `https://wa.me/${CONTACT.whatsappNumber}?text=${encodeURIComponent(
    t('whatsappPrefill'),
  )}`;

  return (
    <>
      <Section spacing="lg">
        <Breadcrumbs locale={locale} trail={[{ label: t('heading') }]} />

        <div className="mt-lg max-w-[48rem]">
          <h1 className="text-display-2 font-semibold text-brand-purple">{t('heading')}</h1>
          <p className="mt-4 text-body-lg text-ink-muted">{t('lead')}</p>
        </div>

        <div className="mt-2xl grid gap-2xl lg:grid-cols-[1fr_20rem] lg:gap-3xl">
          <div className="min-w-0">
            {groups.map((group, groupIndex) => (
              <section
                key={group.key}
                aria-labelledby={`faq-${group.key}`}
                className={groupIndex > 0 ? 'mt-2xl' : undefined}
              >
                <h2 id={`faq-${group.key}`} className="text-h1 font-semibold text-brand-purple">
                  {group.heading}
                </h2>

                {/*
                  Only the very first row on the page opens by default. Opening
                  the first row of every group would leave five panels expanded
                  and the group headings scattered down a long page, which
                  defeats the point of collapsing them.
                */}
                <FaqAccordion
                  items={group.items}
                  defaultOpenIndex={groupIndex === 0 ? 0 : -1}
                />
              </section>
            ))}
          </div>

          <aside className="lg:pt-2">
            <div className="rounded-md border border-border bg-surface-alt p-lg lg:sticky lg:top-28">
              <h2 className="text-h3 font-semibold text-brand-purple">{t('aside.heading')}</h2>
              <p className="mt-2 text-body-sm text-ink-muted">{t('aside.body')}</p>

              <div className="mt-lg flex flex-col gap-3">
                <Button as="a" href="/quote" block iconEnd={<Icon icon={ArrowRight} size={18} />}>
                  {t('aside.quoteCta')}
                </Button>
                <Button
                  as="external"
                  href={whatsappHref}
                  target="_blank"
                  block
                  variant="secondary"
                  icon={<Icon icon={MessageCircle} size={18} />}
                >
                  {t('aside.whatsappCta')}
                </Button>
              </div>
            </div>
          </aside>
        </div>
      </Section>

      <FaqJsonLd items={allItems} />
    </>
  );
}
