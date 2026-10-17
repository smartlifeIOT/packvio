import { CategoryIconBase, type CategoryIconProps } from './icon-base';

/**
 * Boxes, bowls, trays and jars.
 *
 * These share a different sub-grammar from the cups: a container is drawn as a
 * body plus a single lid or rim line at the top, and every rim sits on the same
 * y so a row of them lines up. Depth is implied by that one line and never by a
 * second outline — an isometric box next to a side-on cup breaks the set.
 */

/** Kraft bowl: shallow, round-bottomed, wider than a soup cup. */
export function KraftBowlIcon(props: CategoryIconProps) {
  return (
    <CategoryIconBase {...props}>
      <path d="M3.5 10h17l-1.6 6.6a3.5 3.5 0 0 1-3.4 2.7H8.5a3.5 3.5 0 0 1-3.4-2.7z" />
      <path d="M4 13.5h16" />
    </CategoryIconBase>
  );
}

/** Lunch box: body with a separate lid plane on top. */
export function LunchBoxIcon(props: CategoryIconProps) {
  return (
    <CategoryIconBase {...props}>
      <path d="M4.5 10h15v8.2a1.6 1.6 0 0 1-1.6 1.5H6.1a1.6 1.6 0 0 1-1.6-1.5z" />
      <path d="M4.5 10 6.8 6.5h10.4L19.5 10" />
    </CategoryIconBase>
  );
}

/** Sushi tray: shallow rectangle divided into compartments. */
export function SushiTrayIcon(props: CategoryIconProps) {
  return (
    <CategoryIconBase {...props}>
      <path d="M3.5 8h17v7.5a1.6 1.6 0 0 1-1.6 1.5H5.1a1.6 1.6 0 0 1-1.6-1.5z" />
      <path d="M12 8v9" />
    </CategoryIconBase>
  );
}

/** Food tray: shallower than the sushi tray, tapered like the cups. */
export function FoodTrayIcon(props: CategoryIconProps) {
  return (
    <CategoryIconBase {...props}>
      <path d="M3 9.5h18l-1.6 6.1a2.2 2.2 0 0 1-2.1 1.6H6.7a2.2 2.2 0 0 1-2.1-1.6z" />
      <path d="M6.5 12.5h11" />
    </CategoryIconBase>
  );
}

/** HMR clamshell: base plus a hinged lid, drawn as one folded outline. */
export function HmrContainerIcon(props: CategoryIconProps) {
  return (
    <CategoryIconBase {...props}>
      <path d="M4 12.5h16v5.4a1.6 1.6 0 0 1-1.6 1.5H5.6A1.6 1.6 0 0 1 4 17.9z" />
      <path d="M4 12.5V8.6A1.6 1.6 0 0 1 5.6 7h12.8A1.6 1.6 0 0 1 20 8.6v3.9" />
    </CategoryIconBase>
  );
}

/** Bottle: neck, shoulder and body. The one tall silhouette in this group. */
export function BottleJarIcon(props: CategoryIconProps) {
  return (
    <CategoryIconBase {...props}>
      <path d="M10 3.5h4v3.2l2.4 3a3 3 0 0 1 .6 1.8v7.4a1.6 1.6 0 0 1-1.6 1.6H8.6A1.6 1.6 0 0 1 7 18.9v-7.4a3 3 0 0 1 .6-1.8L10 6.7z" />
      <path d="M7 14h10" />
    </CategoryIconBase>
  );
}
