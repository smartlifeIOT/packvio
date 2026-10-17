import type { ReactNode } from 'react';
import { cx } from '@/lib/cx';
import { Container, type ContainerWidth } from './container';

export type SectionTone = 'surface' | 'alt' | 'panel' | 'purple';
export type SectionSpacing = 'sm' | 'md' | 'lg';

/**
 * Background + the text colour that is legible on it. The purple tone flips to
 * light text automatically so callers never have to remember to do it — that
 * pairing is 13.09:1, comfortably AAA.
 */
const TONE_CLASSES: Record<SectionTone, string> = {
  surface: 'bg-surface text-ink',
  alt: 'bg-surface-alt text-ink',
  panel: 'bg-panel text-ink',
  purple: 'bg-brand-purple text-surface',
};

/**
 * Vertical rhythm, roughly doubling at desktop.
 *
 * The scale used to top out at 96px, which is generous on a laptop and visibly
 * mean at 1440px+: a section 1440px wide with 96px of air above and below reads
 * as a band rather than as a section, and the page becomes one continuous
 * column of content with no breathing room between ideas.
 *
 * Mobile is deliberately left near where it was. Vertical space costs a phone
 * reader scrolling, and 160px of padding on a 375px screen is a third of the
 * viewport spent on nothing — the problem being fixed here is a desktop
 * problem, so the fix is scoped to desktop.
 *
 *   step   <640px   >=640px   >=1024px
 *   sm      48        48        64
 *   md      64        64       112
 *   lg      64        96       160
 */
const SPACING_CLASSES: Record<SectionSpacing, string> = {
  sm: 'py-xl lg:py-2xl',
  md: 'py-2xl lg:py-4xl',
  lg: 'py-2xl sm:py-3xl lg:py-5xl',
};

export type SectionProps = {
  children: ReactNode;
  tone?: SectionTone;
  spacing?: SectionSpacing;
  /** Widen the inner measure to 1600px — see Container. */
  width?: ContainerWidth;
  /** Render the children full-bleed instead of inside the page Container. */
  bleed?: boolean;
  className?: string;
  id?: string;
  'aria-labelledby'?: string;
};

export function Section({
  children,
  tone = 'surface',
  spacing = 'md',
  width = 'page',
  bleed = false,
  className,
  id,
  'aria-labelledby': ariaLabelledBy,
}: SectionProps) {
  return (
    <section
      id={id}
      aria-labelledby={ariaLabelledBy}
      data-tone={tone}
      className={cx(TONE_CLASSES[tone], SPACING_CLASSES[spacing], className)}
    >
      {bleed ? children : <Container width={width}>{children}</Container>}
    </section>
  );
}
