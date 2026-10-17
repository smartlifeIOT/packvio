import { CategoryIconBase, type CategoryIconProps } from './icon-base';

/**
 * Paper, wraps and bags.
 *
 * Sub-grammar: a bag is a body with a handle or a folded top; a paper is a
 * rectangle with exactly one folded corner. The fold is always at the same
 * corner and the same size across the set — a fold that moves between icons
 * reads as a different object rather than the same treatment.
 */

/** Carry bag with rope handles. */
export function CarryBagIcon(props: CategoryIconProps) {
  return (
    <CategoryIconBase {...props}>
      <path d="M5.5 8h13l-1 11.2a1.6 1.6 0 0 1-1.6 1.4H8.1a1.6 1.6 0 0 1-1.6-1.4z" />
      <path d="M9 8V6.2a3 3 0 0 1 6 0V8" />
    </CategoryIconBase>
  );
}

/** Wrapping paper & bags, the parent: a sheet with one folded corner. */
export function WrappingPaperIcon(props: CategoryIconProps) {
  return (
    <CategoryIconBase {...props}>
      <path d="M5.5 4.5h9l5 5v10a1 1 0 0 1-1 1h-13a1 1 0 0 1-1-1v-14a1 1 0 0 1 1-1z" />
      <path d="M14.5 4.5v5h5" />
    </CategoryIconBase>
  );
}

/** Wraps: the same sheet, rolled — the roll is what separates it from paper. */
export function WrapIcon(props: CategoryIconProps) {
  return (
    <CategoryIconBase {...props}>
      <path d="M8 4.5h11a2.5 2.5 0 0 1 0 5H8z" />
      <path d="M8 4.5a2.5 2.5 0 0 0 0 5v10" />
    </CategoryIconBase>
  );
}

/** Bakery & burger bag: flat-bottomed bag with a folded-over top. */
export function BakeryBagIcon(props: CategoryIconProps) {
  return (
    <CategoryIconBase {...props}>
      <path d="M6 7.5h12v11.6a1.4 1.4 0 0 1-1.4 1.4H7.4A1.4 1.4 0 0 1 6 19.1z" />
      <path d="M6 7.5 7.6 4h8.8L18 7.5" />
    </CategoryIconBase>
  );
}
