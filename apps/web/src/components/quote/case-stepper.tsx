'use client';

import { useLocale, useTranslations } from 'next-intl';
import { Minus, Plus } from 'lucide-react';
import { useId } from 'react';
import type { Locale } from '@packvio/shared';
import { Icon } from '@/components/ui';
import { isLocale } from '@/i18n/routing';
import { cx } from '@/lib/cx';
import { formatNumber } from '@/lib/format';

export type CaseStepperProps = {
  /** Current value, in CASES. */
  value: number;
  onChange: (next: number) => void;
  /** Units per case, for the "= 2,000 units" line. Null when unknown. */
  caseQuantity: number | null;
  /** Hidden when the stepper sits in a list that already labels its rows. */
  showTotal?: boolean;
  max?: number;
  className?: string;
};

/**
 * Quantity, stepped in CASES rather than singles.
 *
 * This is the difference between a wholesale catalog and a shop. Nobody buys
 * 1,000 individual cups; they buy one case that happens to contain 1,000. A
 * stepper that counted singles would ask the buyer to type "3000" and would
 * accept "1", which is not a thing Packvio sells.
 *
 * The unit total is shown underneath because a case count alone is ambiguous
 * across products — three cases is 3,000 cups or 600 lids depending on the SKU,
 * and the buyer is budgeting in units even while ordering in cases.
 */
export function CaseStepper({
  value,
  onChange,
  caseQuantity,
  showTotal = true,
  max = 9999,
  className,
}: CaseStepperProps) {
  const t = useTranslations('quote.stepper');
  const rawLocale = useLocale();
  const locale: Locale = isLocale(rawLocale) ? rawLocale : 'ar';
  const inputId = useId();

  const clamp = (next: number) => Math.min(max, Math.max(1, next));

  return (
    <div className={className}>
      <div className="flex items-center gap-2">
        <label htmlFor={inputId} className="sr-only">
          {t('label')}
        </label>

        <div className="inline-flex items-stretch overflow-hidden rounded-md border border-border">
          <StepButton
            label={t('decrease')}
            onClick={() => onChange(clamp(value - 1))}
            disabled={value <= 1}
            icon={Minus}
          />

          <input
            id={inputId}
            type="number"
            inputMode="numeric"
            min={1}
            max={max}
            value={value}
            onChange={(event) => {
              const parsed = Number.parseInt(event.target.value, 10);
              // An empty or half-typed field must not snap to 1 mid-keystroke;
              // NaN simply leaves the previous value alone.
              if (Number.isFinite(parsed)) onChange(clamp(parsed));
            }}
            aria-describedby={showTotal && caseQuantity ? `${inputId}-total` : undefined}
            className={cx(
              'w-16 border-x border-border bg-surface px-2 py-2 text-center text-body font-medium text-ink',
              // The native spinners duplicate the buttons either side of them
              // and make the field narrower than the digits it has to hold.
              '[appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none',
              'focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand-purple',
            )}
          />

          <StepButton
            label={t('increase')}
            onClick={() => onChange(clamp(value + 1))}
            disabled={value >= max}
            icon={Plus}
          />
        </div>

        <span className="text-body-sm text-ink-muted">
          {t('cases', { count: value, formatted: formatNumber(value, locale) })}
        </span>
      </div>

      {showTotal && caseQuantity !== null && (
        <p id={`${inputId}-total`} aria-live="polite" className="mt-1.5 text-body-sm text-ink-muted">
          {t('unitTotal', {
            cases: formatNumber(value, locale),
            units: formatNumber(value * caseQuantity, locale),
            count: value * caseQuantity,
          })}
        </p>
      )}
    </div>
  );
}

function StepButton({
  label,
  onClick,
  disabled,
  icon,
}: {
  label: string;
  onClick: () => void;
  disabled: boolean;
  icon: React.ComponentProps<typeof Icon>['icon'];
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className={cx(
        'inline-flex items-center justify-center px-2.5 text-ink transition-colors',
        'hover:bg-surface-alt hover:text-brand-purple',
        'disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent',
        'focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand-purple',
      )}
    >
      <Icon icon={icon} size={16} />
    </button>
  );
}
