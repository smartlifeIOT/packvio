/**
 * Saudi mobile number normalisation, shared by the RFQ form and the API.
 *
 * It lives in packages/shared rather than in either app because both halves
 * have to agree exactly: the browser decides whether to show an inline error,
 * the server decides whether to persist, and a number the form accepts but the
 * API rejects is a lead lost at the last click. One implementation, imported
 * twice, cannot drift the way two copies would.
 *
 * ACCEPTED, all meaning the same subscriber:
 *   +966 59 481 6791   0594816791   594816791   00966594816791   966594816791
 * plus any spacing, hyphens or brackets, and Arabic-Indic digits (٠١٢…), which
 * an Arabic keyboard produces by default and which would otherwise be rejected
 * as "not a number" for the readers this site is primarily for.
 *
 * CANONICAL FORM is E.164: `+9665XXXXXXXX`. Stored that way so a phone column
 * is comparable and dialable, and so `tel:` links work from a mobile browser.
 *
 * Scope is deliberately Saudi MOBILE only (subscriber starts with 5). Packvio
 * sells wholesale to Saudi businesses and replies over WhatsApp, which needs a
 * mobile; accepting a landline would produce leads nobody can reach the way
 * this business actually contacts people.
 */

/** Arabic-Indic (٠-٩) and Eastern Arabic-Indic (۰-۹) digits → ASCII. */
const ARABIC_DIGITS = /[٠-٩۰-۹]/g;

function toAsciiDigits(value: string): string {
  return value.replace(ARABIC_DIGITS, (digit) => {
    const code = digit.charCodeAt(0);
    const base = code >= 0x06f0 ? 0x06f0 : 0x0660;
    return String(code - base);
  });
}

/**
 * Normalises to `+9665XXXXXXXX`, or returns null when the input is not a Saudi
 * mobile number. Null is the ONLY failure signal — callers must not try to
 * "fix up" a rejected value, because every fix-up is a guess about a number
 * someone will be phoned on.
 */
export function normalizeSaudiPhone(input: string): string | null {
  if (typeof input !== 'string') return null;

  // Strip everything a human might use as separators, keeping a leading +.
  const cleaned = toAsciiDigits(input).replace(/[\s()‐-―.\-]/g, '');
  if (!/^\+?\d+$/.test(cleaned)) return null;

  let digits = cleaned.replace(/^\+/, '');

  // 00 is the international prefix used across the Gulf; +966 and 00966 are
  // the same instruction to the network.
  if (digits.startsWith('00')) digits = digits.slice(2);

  // Peel the country code, then the trunk 0, in that order. A local number is
  // written 05XXXXXXXX but the trunk 0 is never dialled internationally, so
  // "966" followed by "0" (0096605…) is a real thing people type.
  if (digits.startsWith('966')) digits = digits.slice(3);
  if (digits.startsWith('0')) digits = digits.slice(1);

  // What must remain is a 9-digit mobile subscriber number starting with 5.
  if (!/^5\d{8}$/.test(digits)) return null;

  return `+966${digits}`;
}

/** True when `input` is a Saudi mobile number in any accepted spelling. */
export function isSaudiPhone(input: string): boolean {
  return normalizeSaudiPhone(input) !== null;
}

/**
 * Display form: `+966 59 481 6791`. Grouped for reading, never for storage —
 * anything persisted or compared uses `normalizeSaudiPhone`.
 */
export function formatSaudiPhone(input: string): string | null {
  const e164 = normalizeSaudiPhone(input);
  if (!e164) return null;
  const n = e164.slice(4); // drop "+966"
  return `+966 ${n.slice(0, 2)} ${n.slice(2, 5)} ${n.slice(5)}`;
}
