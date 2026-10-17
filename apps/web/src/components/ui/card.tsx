import type { ReactNode } from 'react';
import { cx } from '@/lib/cx';

export type CardElement = 'div' | 'article' | 'li' | 'section';

export type CardProps = {
  children: ReactNode;
  as?: CardElement;
  /** Apply the hover lift. Turn off for static/informational cards. */
  interactive?: boolean;
  /** Remove the default padding when the card holds a full-bleed panel or image. */
  flush?: boolean;
  className?: string;
};

export function Card({
  children,
  as = 'div',
  interactive = true,
  flush = false,
  className,
}: CardProps) {
  const Component = as;

  return (
    <Component
      className={cx(
        'bg-surface border border-border rounded-md shadow-card',
        !flush && 'p-md',
        interactive && 'transition-shadow duration-200 hover:shadow-raised',
        className,
      )}
    >
      {children}
    </Component>
  );
}
