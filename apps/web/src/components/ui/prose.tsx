import type { ReactNode } from 'react';
import { cx } from '@/lib/cx';

export type ProseProps = {
  children: ReactNode;
  as?: 'div' | 'article' | 'section';
  className?: string;
};

/**
 * Typography wrapper for long-form copy blocks (about page, FAQ answers,
 * anything that arrives as a rich-text field rather than as designed layout).
 *
 * Styles live in the `prose-packvio` component layer in globals.css and use
 * logical properties throughout, so lists indent and blockquotes rule on the
 * correct side in both directions.
 */
export function Prose({ children, as = 'div', className }: ProseProps) {
  const Component = as;
  return <Component className={cx('prose-packvio', className)}>{children}</Component>;
}
