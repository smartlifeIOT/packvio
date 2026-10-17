'use client';

import { useTranslations } from 'next-intl';
import { CheckCircle2, Mail, MessageCircle, Phone } from 'lucide-react';
import { useEffect, useRef } from 'react';
import type { QuoteRequestAcknowledgementDto } from '@packvio/shared';
import { CONTACT } from '@/components/layout/nav-links';
import { Button, Icon } from '@/components/ui';
import { cx } from '@/lib/cx';

export type QuoteSuccessProps = {
  acknowledgement: QuoteRequestAcknowledgementDto;
  /**
   * Heading level for "Request received".
   *
   * `h1` on the quote page, where the funnel replaces the page's own heading and
   * this becomes the document's title. `h2` on the contact page, where the page
   * keeps its `h1` ("Talk to us") and the form is one section within it — two
   * `h1`s on one document leaves a screen-reader user with no single answer to
   * "what page am I on".
   */
  headingLevel?: 'h1' | 'h2';
  className?: string;
};

const STEPS = ['one', 'two', 'three'] as const;

/**
 * The thank-you view.
 *
 * The REFERENCE is the point of this screen. It is the only thing the buyer has
 * to prove the request exists and the only string that lets sales find it, so
 * it is set large, in the mono face, bidi-isolated, and selectable rather than
 * buried in a sentence.
 *
 * "What happens next" is here because the alternative — silence after a
 * submission — is what makes people submit again, or phone to ask whether it
 * arrived. And the WhatsApp and phone contacts are repeated even though they
 * are in the header and footer: this is the moment a buyer most wants to add
 * something they forgot, and making them go looking loses the momentum.
 */
export function QuoteSuccess({
  acknowledgement,
  headingLevel: Heading = 'h1',
  className,
}: QuoteSuccessProps) {
  const t = useTranslations('quote.success');
  const headingRef = useRef<HTMLHeadingElement>(null);

  /**
   * Focus moves to the heading on mount. The form was replaced in place without
   * a navigation, so a screen-reader user would otherwise be left with focus on
   * a submit button that no longer exists and no announcement that anything
   * happened.
   */
  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  const whatsappHref = `https://wa.me/${CONTACT.whatsappNumber}?text=${encodeURIComponent(
    t('whatsappPrefill', { reference: acknowledgement.reference }),
  )}`;

  return (
    <div className={cx('mx-auto max-w-[44rem]', className)}>
      <div className="rounded-md border border-success/30 bg-success/5 p-lg text-center">
        <span className="inline-flex size-12 items-center justify-center rounded-pill bg-success/15 text-success">
          <Icon icon={CheckCircle2} size={28} />
        </span>

        <Heading
          ref={headingRef}
          tabIndex={-1}
          className="mt-4 text-display-3 font-semibold text-brand-purple focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand-purple"
        >
          {t('heading')}
        </Heading>

        <p className="mt-2 text-body-lg text-ink">{t('lead')}</p>

        <div className="mt-lg rounded-md border border-border bg-surface p-lg">
          <p className="text-body-sm text-ink-muted">{t('referenceLabel')}</p>
          <p className="bidi-latin mt-1 select-all font-mono text-display-3 font-semibold tracking-wide text-brand-purple">
            {acknowledgement.reference}
          </p>
          <p className="mt-2 text-caption text-ink-muted">{t('referenceHint')}</p>
        </div>
      </div>

      <section aria-labelledby="quote-next" className="mt-xl">
        <h2 id="quote-next" className="text-h2 font-semibold text-brand-purple">
          {t('nextHeading')}
        </h2>

        <ol className="mt-4 flex flex-col gap-3">
          {STEPS.map((step, index) => (
            <li key={step} className="flex items-start gap-3">
              <span className="mt-0.5 inline-flex size-6 shrink-0 items-center justify-center rounded-pill bg-brand-cyan text-caption font-semibold text-ink">
                <span className="bidi-latin">{index + 1}</span>
              </span>
              <span className="text-body text-ink">{t(`next.${step}`)}</span>
            </li>
          ))}
        </ol>
      </section>

      <section aria-labelledby="quote-contact" className="mt-xl">
        <h2 id="quote-contact" className="text-h3 font-semibold text-brand-purple">
          {t('contactHeading')}
        </h2>
        <p className="mt-1 text-body-sm text-ink-muted">{t('contactLead')}</p>

        <div className="mt-4 flex flex-wrap gap-3">
          <Button
            as="external"
            href={whatsappHref}
            target="_blank"
            icon={<Icon icon={MessageCircle} size={18} />}
          >
            {t('whatsappCta')}
          </Button>

          <Button
            as="external"
            href={CONTACT.phoneHref}
            variant="secondary"
            icon={<Icon icon={Phone} size={18} />}
          >
            <span className="bidi-latin font-mono">{CONTACT.phoneDisplay}</span>
          </Button>

          <Button
            as="external"
            href={CONTACT.emailHref}
            variant="ghost"
            icon={<Icon icon={Mail} size={18} />}
          >
            <span className="bidi-latin">{CONTACT.email}</span>
          </Button>
        </div>
      </section>

      <p className="mt-xl text-body-sm text-ink-muted">
        <Button as="a" href="/products" variant="ghost" size="sm">
          {t('keepBrowsing')}
        </Button>
      </p>
    </div>
  );
}
