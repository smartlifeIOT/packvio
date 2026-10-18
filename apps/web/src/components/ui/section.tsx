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
 * Vertical rhythm.
 *
 * REVISED DOWN after looking at the built page. The previous scale ran
 * 48/112/160 at desktop, reasoning that 96px reads as mean at 1440px. On a
 * single section in isolation that was true; across a stacked page it was not,
 * because what the reader experiences is not one section's padding but the SUM
 * of two — a `md` section following another put 224px of nothing between them,
 * and `lg` put 320px. At that size the eye stops reading it as rhythm and
 * starts reading it as the page having ended.
 *
 *   step   <640px   >=640px   >=1024px      (was)
 *   sm      32        48        48          48 / 48 / 64
 *   md      48        64        80          64 / 64 / 112
 *   lg      48        64        96          64 / 96 / 160
 *
 * 80px between the content of two adjacent `md` sections is 160px of gap, which
 * is still generous — the common range for a spacious B2B site is 64–96.
 *
 * Mobile comes down too, which the previous revision deliberately avoided. It
 * was right not to ADD space on a phone; it does not follow that 64px of it was
 * already correct. 48px still separates sections clearly at 375px and gives
 * back most of a thumb-scroll per section across a long page.
 *
 * `--spacing-4xl` (112px) and `--spacing-5xl` (160px) are now unused by this
 * scale. They are left defined: the hero and the purple CTA band are the kind
 * of full-bleed feature that can still want them, and a token costs nothing.
 */
const SPACING_CLASSES: Record<SectionSpacing, string> = {
  sm: 'py-lg sm:py-xl',
  md: 'py-xl sm:py-2xl lg:py-2xhalf',
  lg: 'py-xl sm:py-2xl lg:py-3xl',
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
