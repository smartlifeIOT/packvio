import { useLocale } from 'next-intl';
import type { LucideIcon } from 'lucide-react';
import { cx } from '@/lib/cx';
import { isLocale, localeDirections } from '@/i18n/routing';

/**
 * Lucide icons whose meaning is tied to reading direction. Under RTL these are
 * mirrored so "next" keeps pointing the way the reader is travelling.
 *
 * Mirroring (scaleX -1) rather than swapping ArrowRight -> ArrowLeft is
 * deliberate: it produces the identical glyph for the paired icons, and it also
 * covers diagonals and half-arrows that have no exact opposite in the set.
 */
const DIRECTIONAL_ICON_NAMES = new Set([
  'ArrowLeft',
  'ArrowRight',
  'ArrowUpLeft',
  'ArrowUpRight',
  'ArrowDownLeft',
  'ArrowDownRight',
  'ArrowLeftToLine',
  'ArrowRightToLine',
  'ChevronLeft',
  'ChevronRight',
  'ChevronsLeft',
  'ChevronsRight',
  'ChevronFirst',
  'ChevronLast',
  'CornerDownLeft',
  'CornerDownRight',
  'CornerUpLeft',
  'CornerUpRight',
  'MoveLeft',
  'MoveRight',
  'Reply',
  'Forward',
  'Undo',
  'Undo2',
  'Redo',
  'Redo2',
  'LogIn',
  'LogOut',
  'SkipBack',
  'SkipForward',
  'PanelLeft',
  'PanelRight',
  'IndentIncrease',
  'IndentDecrease',
]);

export type IconProps = {
  /** A lucide-react icon component, e.g. `ArrowRight`. */
  icon: LucideIcon;
  /** Rendered square size in px. */
  size?: number;
  strokeWidth?: number;
  className?: string;
  /**
   * Force mirroring on or off. Omit to auto-detect from the icon's name —
   * set this for a custom glyph the name list cannot know about.
   */
  directional?: boolean;
  /**
   * Accessible name. When omitted the icon is treated as decorative and hidden
   * from assistive tech, which is correct whenever adjacent text says the same.
   */
  label?: string;
};

export function Icon({
  icon: Glyph,
  size = 20,
  strokeWidth = 1.75,
  className,
  directional,
  label,
}: IconProps) {
  const locale = useLocale();
  const direction = isLocale(locale) ? localeDirections[locale] : 'rtl';

  // lucide sets displayName on every icon; fall back to no-flip if absent.
  const glyphName = (Glyph as { displayName?: string }).displayName ?? '';
  const shouldFlip = directional ?? DIRECTIONAL_ICON_NAMES.has(glyphName);
  const mirrored = shouldFlip && direction === 'rtl';

  return (
    <Glyph
      width={size}
      height={size}
      strokeWidth={strokeWidth}
      aria-hidden={label ? undefined : true}
      aria-label={label}
      role={label ? 'img' : undefined}
      className={cx('shrink-0', mirrored && '-scale-x-100', className)}
    />
  );
}
