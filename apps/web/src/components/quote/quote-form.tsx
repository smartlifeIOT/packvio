'use client';

import { useLocale, useTranslations } from 'next-intl';
import { Plus, Trash2 } from 'lucide-react';
import { useEffect, useId, useState } from 'react';
import type {
  CreateQuoteRequestDto,
  CreateQuoteRequestItemDto,
  Locale,
  QuoteRequestAcknowledgementDto,
  QuoteRequestSource,
} from '@packvio/shared';
import { normalizeSaudiPhone } from '@packvio/shared';
import { Button, Icon } from '@/components/ui';
import { isLocale } from '@/i18n/routing';
import { submitQuoteRequest } from '@/lib/api/quotes';
import { cx } from '@/lib/cx';
import { formatNumber } from '@/lib/format';
import { readUtm } from '@/lib/utm';
import { CaseStepper } from './case-stepper';
import { useQuoteBasket, type QuoteBasketLine } from './quote-basket';

export type QuoteFormProps = {
  /** From `?code=` — the product the reader arrived from, if any. */
  prefillCode?: string;
  prefillName?: string;
  prefillCaseQuantity?: number | null;
  prefillQuantity?: number;
  source?: QuoteRequestSource;
  /** Contact page: hide the line-item editor and send one free-text line. */
  variant?: 'quote' | 'contact';
  onSuccess?: (acknowledgement: QuoteRequestAcknowledgementDto) => void;
};

type FieldErrors = Partial<
  Record<'contactName' | 'phone' | 'email' | 'items' | 'message', string>
>;

type Line = QuoteBasketLine & { isFreeText: boolean };

/**
 * The RFQ form.
 *
 * Validation runs on the client for a fast, inline, bilingual answer — and the
 * phone rule is the SHARED `normalizeSaudiPhone` from packages/shared, the same
 * function the API validates with, so the form cannot accept a number the
 * server will reject. That mismatch is the worst failure a lead form has: the
 * buyer fills everything in, presses submit, and is told no by a rule the page
 * never showed them.
 *
 * Server errors are surfaced verbatim rather than swallowed, for the same
 * reason.
 */
export function QuoteForm({
  prefillCode,
  prefillName,
  prefillCaseQuantity = null,
  prefillQuantity = 1,
  source = 'quote_page',
  variant = 'quote',
  onSuccess,
}: QuoteFormProps) {
  const t = useTranslations('quote.form');
  const rawLocale = useLocale();
  const locale: Locale = isLocale(rawLocale) ? rawLocale : 'ar';
  const basket = useQuoteBasket();
  const formId = useId();

  const [lines, setLines] = useState<Line[]>([]);
  const [contactName, setContactName] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [city, setCity] = useState('');
  const [message, setMessage] = useState('');
  const [needsCustomPrinting, setNeedsCustomPrinting] = useState(false);
  const [website, setWebsite] = useState(''); // honeypot

  const [errors, setErrors] = useState<FieldErrors>({});
  const [serverErrors, setServerErrors] = useState<string[]>([]);
  const [status, setStatus] = useState<'idle' | 'submitting'>('idle');

  /**
   * Seed the lines from the basket and the `?code=` parameter, once the basket
   * has loaded. Runs on `isReady` rather than on mount because the basket reads
   * sessionStorage in its own effect — seeding before that lands would produce
   * an empty list for a reader who has ten items waiting.
   */
  useEffect(() => {
    if (!basket.isReady || variant === 'contact') return;

    setLines((current) => {
      if (current.length > 0) return current;

      const seeded: Line[] = basket.lines.map((line) => ({ ...line, isFreeText: false }));

      if (prefillCode && !seeded.some((line) => line.code === prefillCode)) {
        seeded.push({
          code: prefillCode,
          name: prefillName ?? prefillCode,
          slug: '',
          caseQuantity: prefillCaseQuantity,
          quantity: prefillQuantity,
          isFreeText: false,
        });
      }

      return seeded;
    });
  }, [
    basket.isReady,
    basket.lines,
    prefillCode,
    prefillName,
    prefillCaseQuantity,
    prefillQuantity,
    variant,
  ]);

  const updateLine = (index: number, changes: Partial<Line>) => {
    setLines((current) =>
      current.map((line, position) => (position === index ? { ...line, ...changes } : line)),
    );
  };

  const removeLine = (index: number) => {
    setLines((current) => current.filter((_, position) => position !== index));
  };

  const addFreeTextLine = () => {
    setLines((current) => [
      ...current,
      { code: '', name: '', slug: '', caseQuantity: null, quantity: 1, isFreeText: true },
    ]);
  };

  function validate(): FieldErrors {
    const next: FieldErrors = {};

    if (contactName.trim().length < 2) next.contactName = t('errors.contactName');
    if (!normalizeSaudiPhone(phone)) next.phone = t('errors.phone');
    // Deliberately loose: the server runs the authoritative check, and a strict
    // client-side email regex rejects valid addresses far more often than it
    // catches typos.
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) next.email = t('errors.email');

    if (variant === 'contact') {
      if (message.trim().length < 5) next.message = t('errors.message');
    } else {
      const usable = lines.filter((line) => line.name.trim().length > 0);
      if (usable.length === 0) next.items = t('errors.items');
    }

    return next;
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setServerErrors([]);

    const found = validate();
    setErrors(found);
    if (Object.keys(found).length > 0) {
      // Move focus to the first problem so a keyboard or screen-reader user is
      // not left at the submit button wondering what happened.
      const firstKey = Object.keys(found)[0];
      document.getElementById(`${formId}-${firstKey}`)?.focus();
      return;
    }

    setStatus('submitting');

    const items: CreateQuoteRequestItemDto[] =
      variant === 'contact'
        ? [
            {
              productCode: null,
              productName: t('contactLineName'),
              quantity: 1,
              unit: 'piece',
              note: null,
            },
          ]
        : lines
            .filter((line) => line.name.trim().length > 0)
            .map((line) => ({
              productCode: line.isFreeText || !line.code ? null : line.code,
              productName: line.name.trim(),
              quantity: line.quantity,
              // A free-text line has no case size to count in, so it is
              // expressed in pieces — see QuoteRequestUnit.
              unit: line.isFreeText ? 'piece' : 'case',
              note: null,
            }));

    const payload: CreateQuoteRequestDto = {
      contactName: contactName.trim(),
      companyName: companyName.trim() || null,
      // Normalised here as well as on the server, so what is sent is what gets
      // stored and the two cannot disagree about the same number.
      phone: normalizeSaudiPhone(phone) ?? phone.trim(),
      email: email.trim().toLowerCase(),
      city: city.trim() || null,
      message: message.trim() || null,
      locale,
      source,
      needsCustomPrinting,
      items,
      ...readUtm(),
      website: website || null,
    };

    const result = await submitQuoteRequest(payload);
    setStatus('idle');

    if (result.ok) {
      // Only on success. Clearing earlier would lose the buyer's shortlist to a
      // network blip and leave them retyping ten SKUs.
      basket.clear();
      onSuccess?.(result.acknowledgement);
      return;
    }

    setServerErrors(
      result.kind === 'validation' && result.messages.length > 0
        ? result.messages
        : [t(`errors.${result.kind}`)],
    );
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-lg">
      {serverErrors.length > 0 && (
        <div
          role="alert"
          className="rounded-md border border-danger/40 bg-danger/5 p-4 text-body-sm text-danger"
        >
          <p className="font-medium">{t('errors.title')}</p>
          <ul className="mt-1 list-inside list-disc">
            {serverErrors.map((error) => (
              <li key={error}>{error}</li>
            ))}
          </ul>
        </div>
      )}

      {variant === 'quote' && (
        <fieldset>
          <legend className="text-h3 font-semibold text-brand-purple">{t('itemsLegend')}</legend>
          <p className="mt-1 text-body-sm text-ink-muted">{t('itemsHelp')}</p>

          {errors.items && (
            <p id={`${formId}-items`} tabIndex={-1} role="alert" className="mt-2 text-body-sm text-danger">
              {errors.items}
            </p>
          )}

          <ul className="mt-4 flex flex-col gap-3">
            {lines.map((line, index) => (
              <li
                key={`${line.code}-${index}`}
                className="rounded-md border border-border bg-surface p-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    {line.isFreeText ? (
                      <>
                        <label
                          htmlFor={`${formId}-line-${index}`}
                          className="text-body-sm font-medium text-ink"
                        >
                          {t('freeTextLabel')}
                        </label>
                        <input
                          id={`${formId}-line-${index}`}
                          type="text"
                          value={line.name}
                          onChange={(event) => updateLine(index, { name: event.target.value })}
                          placeholder={t('freeTextPlaceholder')}
                          className={inputClasses}
                        />
                      </>
                    ) : (
                      <>
                        <p className="text-body font-medium text-ink">{line.name}</p>
                        <p className="bidi-latin mt-0.5 font-mono text-spec text-ink-muted">
                          {line.code}
                        </p>
                        {line.caseQuantity !== null && (
                          <p className="mt-1 text-caption text-ink-muted">
                            {t('perCase', {
                              count: line.caseQuantity,
                              formatted: formatNumber(line.caseQuantity, locale),
                            })}
                          </p>
                        )}
                      </>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={() => removeLine(index)}
                    aria-label={t('removeLine', { name: line.name || t('freeTextLabel') })}
                    className="rounded-sm p-2 text-ink-muted transition-colors hover:bg-surface-alt hover:text-danger focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-purple"
                  >
                    <Icon icon={Trash2} size={18} />
                  </button>
                </div>

                <CaseStepper
                  value={line.quantity}
                  onChange={(quantity) => updateLine(index, { quantity })}
                  caseQuantity={line.caseQuantity}
                  showTotal={!line.isFreeText}
                  className="mt-3"
                />
              </li>
            ))}
          </ul>

          <Button
            as="button"
            type="button"
            variant="ghost"
            size="sm"
            icon={<Icon icon={Plus} size={16} />}
            onClick={addFreeTextLine}
            className="mt-3"
          >
            {t('addFreeText')}
          </Button>
        </fieldset>
      )}

      <fieldset>
        <legend className="text-h3 font-semibold text-brand-purple">{t('contactLegend')}</legend>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Field
            id={`${formId}-contactName`}
            label={t('contactName')}
            required
            error={errors.contactName}
          >
            <input
              id={`${formId}-contactName`}
              type="text"
              autoComplete="name"
              value={contactName}
              onChange={(event) => setContactName(event.target.value)}
              aria-invalid={errors.contactName ? true : undefined}
              aria-describedby={errors.contactName ? `${formId}-contactName-error` : undefined}
              className={inputClasses}
            />
          </Field>

          <Field id={`${formId}-companyName`} label={t('companyName')}>
            <input
              id={`${formId}-companyName`}
              type="text"
              autoComplete="organization"
              value={companyName}
              onChange={(event) => setCompanyName(event.target.value)}
              className={inputClasses}
            />
          </Field>

          <Field
            id={`${formId}-phone`}
            label={t('phone')}
            required
            error={errors.phone}
            hint={t('phoneHint')}
          >
            <input
              id={`${formId}-phone`}
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              dir="ltr"
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
              aria-invalid={errors.phone ? true : undefined}
              aria-describedby={errors.phone ? `${formId}-phone-error` : `${formId}-phone-hint`}
              className={cx(inputClasses, 'text-start')}
            />
          </Field>

          <Field id={`${formId}-email`} label={t('email')} required error={errors.email}>
            <input
              id={`${formId}-email`}
              type="email"
              autoComplete="email"
              dir="ltr"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              aria-invalid={errors.email ? true : undefined}
              aria-describedby={errors.email ? `${formId}-email-error` : undefined}
              className={cx(inputClasses, 'text-start')}
            />
          </Field>

          <Field id={`${formId}-city`} label={t('city')}>
            <input
              id={`${formId}-city`}
              type="text"
              autoComplete="address-level2"
              value={city}
              onChange={(event) => setCity(event.target.value)}
              className={inputClasses}
            />
          </Field>
        </div>

        <Field
          id={`${formId}-message`}
          label={variant === 'contact' ? t('messageContact') : t('message')}
          required={variant === 'contact'}
          error={errors.message}
          className="mt-4"
        >
          <textarea
            id={`${formId}-message`}
            rows={4}
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            aria-invalid={errors.message ? true : undefined}
            aria-describedby={errors.message ? `${formId}-message-error` : undefined}
            className={inputClasses}
          />
        </Field>

        <label className="mt-4 flex items-start gap-2.5 text-body-sm text-ink">
          <input
            type="checkbox"
            checked={needsCustomPrinting}
            onChange={(event) => setNeedsCustomPrinting(event.target.checked)}
            className="mt-0.5 size-4 accent-[--color-brand-purple]"
          />
          {t('needsCustomPrinting')}
        </label>
      </fieldset>

      {/*
        HONEYPOT. Hidden from people, filled in by bots. Not `display:none` —
        some form-filling scripts skip those — but pushed out of view and out of
        the tab order, with autocomplete off so a browser never fills it for a
        real person. See the DTO for why a filled one is accepted, not rejected.
      */}
      <div aria-hidden="true" className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
        <label htmlFor={`${formId}-website`}>{t('honeypot')}</label>
        <input
          id={`${formId}-website`}
          type="text"
          tabIndex={-1}
          autoComplete="off"
          value={website}
          onChange={(event) => setWebsite(event.target.value)}
        />
      </div>

      <div className="flex flex-wrap items-center gap-4">
        <Button as="button" type="submit" size="lg" disabled={status === 'submitting'}>
          {status === 'submitting' ? t('submitting') : t('submit')}
        </Button>
        <p className="text-body-sm text-ink-muted">{t('privacy')}</p>
      </div>
    </form>
  );
}

const inputClasses = cx(
  'mt-1 w-full rounded-md border border-border bg-surface px-3 py-2.5 text-body text-ink',
  'placeholder:text-ink-muted/60',
  'focus-visible:outline-2 focus-visible:-outline-offset-1 focus-visible:outline-brand-purple',
  'aria-[invalid=true]:border-danger',
);

function Field({
  id,
  label,
  required = false,
  error,
  hint,
  className,
  children,
}: {
  id: string;
  label: string;
  required?: boolean;
  error?: string;
  hint?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={className}>
      <label htmlFor={id} className="text-body-sm font-medium text-ink">
        {label}
        {required && (
          <span aria-hidden="true" className="ms-1 text-danger">
            *
          </span>
        )}
      </label>

      {children}

      {hint && !error && (
        <p id={`${id}-hint`} className="mt-1 text-caption text-ink-muted">
          {hint}
        </p>
      )}

      {error && (
        <p id={`${id}-error`} role="alert" className="mt-1 text-caption text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
