'use client';

import { useState, type ReactNode } from 'react';
import type { QuoteRequestAcknowledgementDto, QuoteRequestSource } from '@packvio/shared';
import { QuoteForm, type QuoteFormProps } from './quote-form';
import { QuoteSuccess } from './quote-success';

export type QuoteFunnelProps = Omit<QuoteFormProps, 'onSuccess'> & {
  source?: QuoteRequestSource;
  /**
   * The page's heading and intro, rendered ABOVE the form and replaced along
   * with it on success.
   *
   * They live here rather than in the page for one reason: the success view
   * carries its own <h1> ("Request received"), and leaving the page's "Request
   * a quote" heading standing above it would put two h1s on the document and
   * label the screen with a question the reader has already answered. Passing
   * them in keeps the page's copy in the page while letting the funnel own when
   * it disappears.
   */
  intro?: ReactNode;
  /** Passed through to the thank-you view — see QuoteSuccess.headingLevel. */
  successHeadingLevel?: 'h1' | 'h2';
};

/**
 * Form → thank-you, in place.
 *
 * The success state deliberately does NOT navigate to a `/quote/thanks` route.
 * The reference only exists in the response to the submission, so a separate
 * page would have to carry it in the URL — where it would be shared, bookmarked
 * and reloaded, showing a stale confirmation for a request the reader may have
 * made weeks ago. Swapping in place means the confirmation exists exactly as
 * long as the moment it describes.
 *
 * The trade-off is that a refresh loses the reference, which is why the
 * thank-you view tells the buyer to note it down.
 */
export function QuoteFunnel({ intro, successHeadingLevel, ...formProps }: QuoteFunnelProps) {
  const [acknowledgement, setAcknowledgement] = useState<QuoteRequestAcknowledgementDto | null>(
    null,
  );

  if (acknowledgement) {
    return <QuoteSuccess acknowledgement={acknowledgement} headingLevel={successHeadingLevel} />;
  }

  return (
    <>
      {intro}
      <QuoteForm {...formProps} onSuccess={setAcknowledgement} />
    </>
  );
}
