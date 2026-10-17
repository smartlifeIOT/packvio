'use client';

import { ChevronDown } from 'lucide-react';
import { useId, useState } from 'react';
import { Icon } from '@/components/ui';
import { cx } from '@/lib/cx';

export type FaqItem = {
  /** Stable key, also used to build the panel/button ids. */
  id: string;
  question: string;
  answer: string;
  /**
   * False when the answer is a placeholder awaiting Packvio's confirmation.
   *
   * Two things depend on it: the visible "pending" marker, and — more
   * importantly — whether the entry is eligible for FAQPage structured data.
   * See faq-json-ld.tsx.
   */
  isAnswered: boolean;
  /** Shown beside a placeholder answer. Omitted for real answers. */
  pendingLabel?: string;
};

export type FaqAccordionProps = {
  items: FaqItem[];
  /**
   * Index of the item open on first render. The first item by default: an
   * accordion that opens entirely closed gives a reader nothing to read and no
   * indication that the rows expand at all.
   */
  defaultOpenIndex?: number;
};

/**
 * A disclosure list, not a tab set.
 *
 * Each row is an independent `<button aria-expanded>` controlling its own
 * region — the pattern the ARIA authoring practices call a disclosure, and the
 * one that needs no keyboard handling of its own: a native button already
 * responds to Enter and Space, is in the tab order, and announces its state.
 * Hand-rolling arrow-key navigation here would make it behave like a listbox,
 * which is not what a page of questions is.
 *
 * Several rows can be open at once, deliberately. Someone comparing "what is
 * the minimum order" with "what is the minimum for printed items" should not
 * have the first close as they open the second.
 */
export function FaqAccordion({ items, defaultOpenIndex = 0 }: FaqAccordionProps) {
  const baseId = useId();
  const [openIds, setOpenIds] = useState<Set<string>>(
    () => new Set(items[defaultOpenIndex] ? [items[defaultOpenIndex].id] : []),
  );

  const toggle = (id: string) => {
    setOpenIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <ul className="divide-y divide-border border-y border-border">
      {items.map((item) => {
        const isOpen = openIds.has(item.id);
        const buttonId = `${baseId}-${item.id}-button`;
        const panelId = `${baseId}-${item.id}-panel`;

        return (
          <li key={item.id}>
            <h3>
              <button
                type="button"
                id={buttonId}
                aria-expanded={isOpen}
                aria-controls={panelId}
                onClick={() => toggle(item.id)}
                className={cx(
                  'flex w-full cursor-pointer items-start justify-between gap-4 py-5 text-start',
                  'text-body-lg font-medium text-ink transition-colors hover:text-brand-purple',
                  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-purple',
                )}
              >
                <span className="min-w-0">{item.question}</span>
                <Icon
                  icon={ChevronDown}
                  size={20}
                  className={cx(
                    'mt-1 shrink-0 text-brand-purple transition-transform duration-200',
                    isOpen && 'rotate-180',
                  )}
                />
              </button>
            </h3>

            {/*
              The panel stays in the DOM and is `hidden` when closed rather than
              unmounted. `hidden` is what makes browser find-in-page and the
              "expand all" some assistive tech offers able to reach the answer;
              unmounting hides it from both.
            */}
            <div
              id={panelId}
              role="region"
              aria-labelledby={buttonId}
              hidden={!isOpen}
              className="pb-6"
            >
              <p className="max-w-[52rem] text-body text-ink-muted">{item.answer}</p>

              {!item.isAnswered && item.pendingLabel && (
                <p className="mt-3 inline-flex rounded-sm border border-warning/40 bg-warning/5 px-2.5 py-1 text-caption font-medium text-warning">
                  {item.pendingLabel}
                </p>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
