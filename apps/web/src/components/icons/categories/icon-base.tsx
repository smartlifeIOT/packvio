import type { SVGProps } from 'react';

/**
 * The Packvio category icon set.
 *
 * DRAWING GRAMMAR — every icon in this directory obeys all of it, and an icon
 * that breaks one of these rules will look wrong next to the others long before
 * anyone can say why:
 *
 *   viewBox      24 × 24, no exceptions.
 *   stroke       1.75, uniform. No hairlines, no emphasis strokes.
 *   caps/joins   round, both.
 *   colour       currentColor on the stroke, `fill="none"` everywhere.
 *   optical box  content sits inside x/y 3–21, so a 24px render has ~3px of
 *                air and icons of different silhouettes look the same size.
 *   vessels      all cups taper on the same angle: the bottom edge is inset
 *                2.5 units from the top on each side. A cup, a bowl and a
 *                shaker have to read as the same family seen from the side.
 *   detail       at most one interior line per icon. At 24px a second one
 *                turns to mud, and these render at 24px far more often than at
 *                96px.
 *
 * These are STAND-INS drawn to be consistent, not final artwork — see the
 * handover for which ones are weak and worth a designer's time.
 */

export interface CategoryIconProps extends Omit<SVGProps<SVGSVGElement>, 'children'> {
  /** Rendered size in px, applied to both axes. */
  size?: number;
  /**
   * Accessible name. Omitted by default: these sit next to a visible text
   * label almost everywhere, where a second announcement is noise. Pass it
   * only when the icon is genuinely the sole label.
   */
  title?: string;
}

/**
 * The SVG shell every category icon shares.
 *
 * Centralising the attributes is what makes the grammar enforceable: an icon
 * file contains only its own path data, so it CANNOT quietly ship a different
 * stroke width or a stray fill.
 */
export function CategoryIconBase({
  size = 24,
  title,
  children,
  ...props
}: CategoryIconProps & { children: React.ReactNode }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      role={title ? 'img' : 'presentation'}
      aria-hidden={title ? undefined : true}
      focusable="false"
      {...props}
    >
      {title ? <title>{title}</title> : null}
      {children}
    </svg>
  );
}
