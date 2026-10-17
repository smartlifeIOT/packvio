import { cx } from '@/lib/cx';

export type SpecRow = {
  /** Localised label, e.g. "سعة" / "Capacity". Comes from messages. */
  label: string;
  /** The spec value. Usually a Latin run — see the bidi note below. */
  value: string;
  /**
   * Set false for values that are genuinely Arabic prose rather than a code or
   * measurement, so they are not force-isolated to LTR.
   */
  isLatinValue?: boolean;
};

export type SpecTableProps = {
  rows: SpecRow[];
  /** Accessible table caption. Visually hidden unless `showCaption`. */
  caption: string;
  showCaption?: boolean;
  className?: string;
};

/**
 * Two-column key/value table for product specs.
 *
 * Every Latin value cell carries `bidi-latin` (unicode-bidi: isolate;
 * direction: ltr). Without it, a value like "301 GSM Ø80" inside an Arabic page
 * gets reordered by the bidi algorithm and renders as "Ø80 301 GSM" — or worse,
 * "PCS/08" flips to "08/PCS". Isolation is required, not cosmetic.
 */
export function SpecTable({ rows, caption, showCaption = false, className }: SpecTableProps) {
  return (
    <table
      className={cx(
        'w-full border-collapse overflow-hidden rounded-md border border-border text-body-sm',
        className,
      )}
    >
      <caption
        className={cx(
          'text-start',
          showCaption ? 'pb-2 text-caption text-ink-muted' : 'sr-only',
        )}
      >
        {caption}
      </caption>
      <tbody>
        {rows.map((row) => (
          <tr key={row.label} className="border-b border-border last:border-b-0 odd:bg-surface-alt">
            <th
              scope="row"
              className="w-2/5 px-3 py-2 text-start align-top font-medium leading-snug text-ink-muted"
            >
              {row.label}
            </th>
            <td
              className={cx(
                'px-3 py-2 text-start align-top leading-snug text-ink',
                'font-mono text-spec',
                row.isLatinValue !== false && 'bidi-latin',
              )}
            >
              {row.value}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
