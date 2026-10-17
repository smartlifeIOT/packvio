import { CategoryIconBase, type CategoryIconProps } from './icon-base';

/**
 * Cups and their lids.
 *
 * Every vessel here is the same trapezoid seen from the side — top edge wide,
 * bottom edge inset 2.5 units per side — so the family reads as one drawing
 * with the proportions changed, rather than as nine unrelated shapes. The lids
 * are the same trapezoid flattened, which is what makes a lid legible as
 * belonging to the cup above it in the nav.
 */

/** Tall single-wall paper cup. The reference silhouette for the whole set. */
export function CoffeeCupIcon(props: CategoryIconProps) {
  return (
    <CategoryIconBase {...props}>
      <path d="M6 5h12l-1.4 14.1a1.8 1.8 0 0 1-1.8 1.6H9.2a1.8 1.8 0 0 1-1.8-1.6z" />
      <path d="M6.5 9.5h11" />
    </CategoryIconBase>
  );
}

/** A flat lid seen from the side, with its central sip opening. */
export function CoffeeCupLidIcon(props: CategoryIconProps) {
  return (
    <CategoryIconBase {...props}>
      <path d="M3.5 12h17l-1 4.2a2 2 0 0 1-1.9 1.5H6.4a2 2 0 0 1-1.9-1.5z" />
      <path d="M10 8.5h4l.6 3.5H9.4z" />
    </CategoryIconBase>
  );
}

/** A cup sleeve: the band, tapered like the cup it wraps. */
export function CoffeeAccessoryIcon(props: CategoryIconProps) {
  return (
    <CategoryIconBase {...props}>
      <path d="M5.5 7.5h13l-1 9h-11z" />
      <path d="M8.5 7.5 8 16.5" />
    </CategoryIconBase>
  );
}

/** Soup cup: the same trapezoid, wider and shorter. */
export function SoupCupIcon(props: CategoryIconProps) {
  return (
    <CategoryIconBase {...props}>
      <path d="M4.5 7.5h15l-1.2 11.3a1.8 1.8 0 0 1-1.8 1.6H7.5a1.8 1.8 0 0 1-1.8-1.6z" />
      <path d="M5 11.5h14" />
    </CategoryIconBase>
  );
}

/** Domed soup lid — the one lid with a raised profile. */
export function SoupCupLidIcon(props: CategoryIconProps) {
  return (
    <CategoryIconBase {...props}>
      <path d="M3.5 14h17l-.8 2.7a2 2 0 0 1-1.9 1.4H6.2a2 2 0 0 1-1.9-1.4z" />
      <path d="M5.5 14a6.5 6.5 0 0 1 13 0" />
    </CategoryIconBase>
  );
}

/** Shaker cup: tall vessel with a domed top. */
export function ShakerIcon(props: CategoryIconProps) {
  return (
    <CategoryIconBase {...props}>
      <path d="M6.5 9h11l-1 10.2a1.6 1.6 0 0 1-1.6 1.4H9.1a1.6 1.6 0 0 1-1.6-1.4z" />
      <path d="M7.5 9a4.5 4.5 0 0 1 9 0" />
    </CategoryIconBase>
  );
}

/** Clear cup: the coffee-cup silhouette, marked by a fill line for clarity. */
export function ClearCupIcon(props: CategoryIconProps) {
  return (
    <CategoryIconBase {...props}>
      <path d="M6 5h12l-1.4 14.1a1.8 1.8 0 0 1-1.8 1.6H9.2a1.8 1.8 0 0 1-1.8-1.6z" />
      <path d="M7.2 13.5h9.6" />
    </CategoryIconBase>
  );
}

/** Flat clear lid with a straw cross. */
export function ClearCupLidIcon(props: CategoryIconProps) {
  return (
    <CategoryIconBase {...props}>
      <path d="M3.5 12h17l-1 4.2a2 2 0 0 1-1.9 1.5H6.4a2 2 0 0 1-1.9-1.5z" />
      <path d="M10.5 12v-1.5m3 1.5v-1.5M12 12v3" />
    </CategoryIconBase>
  );
}

/** A cold drink: clear cup with a straw through the lid. */
export function DrinkCupIcon(props: CategoryIconProps) {
  return (
    <CategoryIconBase {...props}>
      <path d="M6.5 8h11l-1.2 11.1a1.8 1.8 0 0 1-1.8 1.6H9.5a1.8 1.8 0 0 1-1.8-1.6z" />
      <path d="M14 3.5 11.5 8" />
    </CategoryIconBase>
  );
}

/** Portion cup: the family trapezoid at its smallest, with its lid above. */
export function PortionCupIcon(props: CategoryIconProps) {
  return (
    <CategoryIconBase {...props}>
      <path d="M7 11h10l-1 8.2a1.6 1.6 0 0 1-1.6 1.4H9.6A1.6 1.6 0 0 1 8 19.2z" />
      <path d="M5.5 7.5h13" />
    </CategoryIconBase>
  );
}
