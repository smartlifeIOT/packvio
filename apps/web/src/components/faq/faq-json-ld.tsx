import type { FaqItem } from './faq-accordion';

/**
 * FAQPage structured data — for the ANSWERED questions only.
 *
 * The filter is the whole point of this component. Google renders FAQ rich
 * results directly in the search page, so marking up "We will confirm this
 * shortly — placeholder pending Packvio's answer" would publish that sentence
 * as Packvio's official answer to "what is your minimum order", on the search
 * results page, under the brand's name. It is also a structured-data policy
 * violation: the guidelines require the marked-up answer to be the answer
 * visible on the page AND to actually answer the question.
 *
 * So `isAnswered` gates entry, and a page whose answers are all placeholders
 * emits no script at all rather than an empty FAQPage.
 */
export function FaqJsonLd({ items }: { items: FaqItem[] }) {
  const answered = items.filter((item) => item.isAnswered);
  if (answered.length === 0) return null;

  const data = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: answered.map((item) => ({
      '@type': 'Question',
      name: item.question,
      acceptedAnswer: { '@type': 'Answer', text: item.answer },
    })),
  };

  return (
    <script
      type="application/ld+json"
      // Only JSON.stringify output reaches this, and `<` is escaped so an
      // answer containing "</script>" cannot break out of the block.
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, '\\u003c') }}
    />
  );
}
