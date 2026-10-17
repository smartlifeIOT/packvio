/**
 * The FAQ's structure — which questions exist, in which group, and crucially
 * WHICH ONES HAVE A REAL ANSWER.
 *
 * `answered: false` means nobody at Packvio has confirmed the answer yet. The
 * copy for those is a clearly-marked placeholder, the page shows a "pending"
 * badge, and `FaqJsonLd` excludes them from the structured data entirely — so
 * a placeholder can never be published to a search result as Packvio's
 * official position.
 *
 * The rule for `answered: true` is strict: the answer must be derivable from
 * something already established — the printed catalog, the site's own
 * behaviour, the architecture, or a material fact that is true regardless of
 * this business. MOQs, lead times, prices, payment terms, delivery charges and
 * certifications are NOT derivable and are all flagged false. Inventing any of
 * them would put a number in front of a buyer that operations never agreed to.
 *
 * The strings themselves live in messages/{ar,en}.json under `faq.items.*`;
 * this file owns the shape and the answered/unanswered decision, so the two
 * locales cannot disagree about which answers are real.
 */

export type FaqGroupKey = 'ordering' | 'printing' | 'delivery' | 'products' | 'payment';

export interface FaqQuestionDefinition {
  /** Message key under `faq.items`, and the accordion's row id. */
  key: string;
  answered: boolean;
}

export interface FaqGroupDefinition {
  key: FaqGroupKey;
  questions: FaqQuestionDefinition[];
}

export const FAQ_GROUPS: readonly FaqGroupDefinition[] = [
  {
    key: 'ordering',
    questions: [
      // How the site itself works — verifiable by using it.
      { key: 'howToOrder', answered: true },
      // Case-only selling and the 200–6000 range come from the printed catalog.
      { key: 'caseOnly', answered: true },
      { key: 'notListed', answered: true },
      // The reference format is `PV-YYYY-NNNN`, produced by a Postgres sequence.
      { key: 'referenceNumber', answered: true },
      { key: 'minimumOrder', answered: false },
      { key: 'samples', answered: false },
      { key: 'quoteValidity', answered: false },
    ],
  },
  {
    key: 'printing',
    questions: [
      { key: 'canYouPrint', answered: true },
      { key: 'artworkFormat', answered: true },
      { key: 'proof', answered: true },
      { key: 'whichProducts', answered: true },
      { key: 'printMinimum', answered: false },
      { key: 'printLeadTime', answered: false },
    ],
  },
  {
    key: 'delivery',
    questions: [
      // Matches the sign-off-approved wording in CLAUDE.md exactly.
      { key: 'whereDeliver', answered: true },
      { key: 'deliveryTime', answered: false },
      { key: 'deliveryCharge', answered: false },
      { key: 'collection', answered: false },
    ],
  },
  {
    key: 'products',
    questions: [
      // The defensible food-contact wording, not the SFDA claim.
      { key: 'foodSafe', answered: true },
      // A material property, true independently of this supplier.
      { key: 'petVsPp', answered: true },
      { key: 'lidsFit', answered: true },
      { key: 'recyclable', answered: false },
      { key: 'shelfLife', answered: false },
    ],
  },
  {
    key: 'payment',
    questions: [
      { key: 'howToPay', answered: false },
      { key: 'creditAccount', answered: false },
      { key: 'taxInvoice', answered: false },
    ],
  },
] as const;

/** Every question key in page order — used by the page and by the report. */
export const FAQ_QUESTION_KEYS = FAQ_GROUPS.flatMap((group) =>
  group.questions.map((question) => `${group.key}.${question.key}`),
);

/** Keys whose answers are still placeholders. */
export const FAQ_PENDING_KEYS = FAQ_GROUPS.flatMap((group) =>
  group.questions.filter((question) => !question.answered).map((q) => `${group.key}.${q.key}`),
);
