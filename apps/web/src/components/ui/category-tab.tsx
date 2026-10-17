import { cx } from '@/lib/cx';
import { Link, type AppHref } from '@/i18n/navigation';

export type CategoryTabProps = {
  /** Localised label. Comes from messages — never hardcoded. */
  label: string;
  /** A routed pathname. Renders a non-interactive tab when omitted. */
  href?: AppHref;
  /**
   * `fixed` pins it to the viewport edge (the catalog behaviour). `absolute`
   * pins it to the nearest positioned ancestor — used inside the styleguide.
   */
  position?: 'fixed' | 'absolute';
  className?: string;
  id?: string;
};

/**
 * The rotated vertical tab that runs down the page edge in the printed catalog.
 *
 * Direction handling:
 *  - `end-0` is inset-inline-end, so the tab sits on the RIGHT edge in English
 *    and the LEFT edge in Arabic, with no per-locale branching.
 *  - `rounded-s-md` rounds the inline-start corners — which is the inward-facing
 *    side on both edges, again automatically.
 *
 * Padding note: `writing-mode: vertical-rl` swaps the axes. The inline axis now
 * runs top-to-bottom and the block axis runs horizontally. So `px-*`
 * (padding-inline) controls the tab's LENGTH and `py-*` (padding-block)
 * controls its THICKNESS. That inversion is intentional, not a typo.
 */
export function CategoryTab({ label, href, position = 'fixed', className, id }: CategoryTabProps) {
  const classes = cx(
    position,
    'top-1/2 end-0 z-30 -translate-y-1/2',
    'bg-brand-purple text-surface shadow-raised rounded-s-md',
    'transition-colors duration-150',
    href && 'hover:bg-brand-purple-deep focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-cyan',
    className,
  );

  const inner = (
    <span className="block [writing-mode:vertical-rl] px-5 py-3 text-body-sm font-medium tracking-wide">
      {label}
    </span>
  );

  if (href) {
    return (
      <Link id={id} href={href} className={classes}>
        {inner}
      </Link>
    );
  }

  return (
    <div id={id} className={classes}>
      {inner}
    </div>
  );
}
