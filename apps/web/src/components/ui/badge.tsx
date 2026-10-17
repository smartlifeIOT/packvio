import type { ReactNode } from 'react';
import { cx } from '@/lib/cx';

export type BadgeTone = 'neutral' | 'cyan' | 'purple' | 'success' | 'warning' | 'danger';

/**
 * The `cyan` tone tints the fill but keeps PURPLE text — cyan text on a light
 * background is 2.11:1 and fails WCAG at every size. See globals.css.
 */
const TONE_CLASSES: Record<BadgeTone, string> = {
  neutral: 'bg-surface-alt text-ink-muted border-border',
  cyan: 'bg-brand-cyan/20 text-brand-purple border-brand-cyan/50',
  purple: 'bg-brand-purple text-surface border-brand-purple',
  success: 'bg-success/10 text-success border-success/30',
  warning: 'bg-warning/10 text-warning border-warning/30',
  danger: 'bg-danger/10 text-danger border-danger/30',
};

export type BadgeProps = {
  children: ReactNode;
  tone?: BadgeTone;
  /** Small glyph on the inline-start edge. */
  icon?: ReactNode;
  className?: string;
};

export function Badge({ children, tone = 'neutral', icon, className }: BadgeProps) {
  return (
    <span
      className={cx(
        'inline-flex items-center gap-1.5 rounded-pill border px-2.5 py-1',
        'text-caption font-medium whitespace-nowrap',
        TONE_CLASSES[tone],
        className,
      )}
    >
      {icon}
      {children}
    </span>
  );
}
