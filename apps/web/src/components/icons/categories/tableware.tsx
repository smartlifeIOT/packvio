import { CategoryIconBase, type CategoryIconProps } from './icon-base';

/**
 * Cutlery and the things handed over with it.
 *
 * Sub-grammar: every implement is drawn along the SAME diagonal axis, from
 * lower-left to upper-right, at the same angle. Utensils are the one family
 * where a mixed set of angles is instantly visible as sloppy, so the axis is
 * fixed even where a vertical drawing would be easier.
 *
 * Handles are a single stroke; heads are the only place a closed shape appears.
 */

/** Cutlery, the parent: a fork and knife crossed. */
export function CutleryIcon(props: CategoryIconProps) {
  return (
    <CategoryIconBase {...props}>
      <path d="M8.5 3.5v6.2a2.2 2.2 0 0 0 2.2 2.2L9.5 20.5" />
      <path d="M6.6 3.5v4.4m3.8-4.4v4.4" />
      <path d="M17.4 3.5c1.4 1.9 1.9 4.4 1.4 6.8l-1.4 1.6-1.2 8.6" />
    </CategoryIconBase>
  );
}

/** Spoon: closed oval head on the family diagonal. */
export function SpoonIcon(props: CategoryIconProps) {
  return (
    <CategoryIconBase {...props}>
      <path d="M14.6 4.4c1.7 1.7 1.9 4.3.5 5.7s-4 1.2-5.7-.5-1.9-4.3-.5-5.7 4-1.2 5.7.5Z" />
      <path d="M9.9 10.2 6.2 20.4" />
    </CategoryIconBase>
  );
}

/** Fork and knife, drawn apart so both heads are readable at 24px. */
export function ForkKnifeIcon(props: CategoryIconProps) {
  return (
    <CategoryIconBase {...props}>
      <path d="M7 3.5v5.6a2 2 0 0 0 2 2v9.4" />
      <path d="M5.2 3.5v4m3.6-4v4" />
      <path d="M16.6 3.5c1.5 1.9 2 4.5 1.4 6.9l-1.4 1.5v8.6" />
    </CategoryIconBase>
  );
}

/** Straws: two tubes on the family diagonal, one bent. */
export function StrawIcon(props: CategoryIconProps) {
  return (
    <CategoryIconBase {...props}>
      <path d="M9.5 20.5 14 4.2a1.6 1.6 0 0 1 3.1.8l-2.4 15.5" />
      <path d="M6.5 20.5 8.8 8.9" />
    </CategoryIconBase>
  );
}

/** Napkin: a square folded once across the diagonal. */
export function NapkinIcon(props: CategoryIconProps) {
  return (
    <CategoryIconBase {...props}>
      <path d="M4.5 5.6A1.1 1.1 0 0 1 5.6 4.5h12.8a1.1 1.1 0 0 1 1.1 1.1v12.8a1.1 1.1 0 0 1-1.1 1.1H5.6a1.1 1.1 0 0 1-1.1-1.1z" />
      <path d="M19.5 8.5 8.5 19.5" />
    </CategoryIconBase>
  );
}

/** Stirrers: two flat sticks, one with the spoon end this range carries. */
export function StirrerIcon(props: CategoryIconProps) {
  return (
    <CategoryIconBase {...props}>
      <path d="M14.8 4.2a1.4 1.4 0 0 1 2.7.7L14.9 20.4" />
      <path d="M6.6 20.4 9.2 5.3a1.4 1.4 0 0 1 2.8.3l-.3 2.6" />
    </CategoryIconBase>
  );
}

/** Other tableware: chopsticks, the clearest non-cutlery service item. */
export function OtherTablewareIcon(props: CategoryIconProps) {
  return (
    <CategoryIconBase {...props}>
      <path d="M6.5 20.5 13.8 4.1a1.2 1.2 0 0 1 2.3.6l-1.6 15.8" />
      <path d="M10 20.5 16.5 5" />
    </CategoryIconBase>
  );
}
