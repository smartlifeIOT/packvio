import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { cx } from '@/lib/cx';
import { Link, type AppHref } from '@/i18n/navigation';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'onPurple';
export type ButtonSize = 'sm' | 'md' | 'lg';

/**
 * Variants.
 *
 * `primary` puts ink on the cyan fill (8.12:1). Cyan is never used as a text
 * colour on light surfaces — see the CYAN RULE in globals.css — which is why
 * `secondary` and `ghost` are purple (13.09:1 on white).
 */
const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary:
    'bg-brand-cyan text-ink border border-brand-cyan hover:bg-brand-purple hover:border-brand-purple hover:text-surface',
  secondary:
    'bg-transparent text-brand-purple border border-brand-purple hover:bg-brand-purple hover:text-surface',
  ghost:
    'bg-transparent text-brand-purple border border-transparent hover:bg-surface-alt hover:border-border',
  onPurple:
    'bg-transparent text-surface border border-surface/70 hover:bg-surface hover:text-brand-purple hover:border-surface',
};

const SIZE_CLASSES: Record<ButtonSize, string> = {
  sm: 'text-body-sm gap-1.5 px-3 py-1.5 rounded-sm',
  md: 'text-body gap-2 px-5 py-2.5 rounded-md',
  lg: 'text-body-lg gap-2.5 px-7 py-3.5 rounded-md',
};

const BASE_CLASSES = [
  'inline-flex items-center justify-center',
  'font-medium leading-none whitespace-nowrap',
  'transition-colors duration-150',
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-purple',
  'disabled:pointer-events-none disabled:opacity-50',
  'cursor-pointer',
].join(' ');

type ButtonBaseProps = {
  children: ReactNode;
  variant?: ButtonVariant;
  size?: ButtonSize;
  /**
   * Rendered on the inline-START edge. Because the wrapper is a flex row, the
   * icon lands on the left in English and on the right in Arabic with no
   * direction-specific styling.
   */
  icon?: ReactNode;
  /** Rendered on the inline-END edge — for "continue"-style affordances. */
  iconEnd?: ReactNode;
  /** Stretch to the full width of the parent. */
  block?: boolean;
  className?: string;
};

type ButtonAsButtonProps = ButtonBaseProps & {
  as?: 'button';
} & Omit<ButtonHTMLAttributes<HTMLButtonElement>, keyof ButtonBaseProps>;

type ButtonAsLinkProps = ButtonBaseProps & {
  as: 'a';
  /**
   * An internal pathname from the routing config, e.g. `/products`, or an object
   * for a dynamic route: `{ pathname: '/product/[slug]', params: { slug } }`.
   * The locale prefix and the localized segment are added for you.
   */
  href: AppHref;
  target?: string;
  rel?: string;
};

type ButtonAsExternalProps = ButtonBaseProps & {
  /**
   * A link that leaves the app — `tel:`, `mailto:`, `https://wa.me/...`. These
   * must NOT go through the locale-aware Link, which would prefix them with
   * `/ar` and produce a dead URL.
   */
  as: 'external';
  href: string;
  target?: string;
  rel?: string;
};

export type ButtonProps = ButtonAsButtonProps | ButtonAsLinkProps | ButtonAsExternalProps;

export function Button(props: ButtonProps) {
  const {
    children,
    variant = 'primary',
    size = 'md',
    icon,
    iconEnd,
    block = false,
    className,
  } = props;

  const classes = cx(
    BASE_CLASSES,
    VARIANT_CLASSES[variant],
    SIZE_CLASSES[size],
    block && 'w-full',
    className,
  );

  const content = (
    <>
      {icon}
      <span>{children}</span>
      {iconEnd}
    </>
  );

  if (props.as === 'a') {
    const { href, target, rel } = props;
    return (
      <Link href={href} target={target} rel={rel} className={classes}>
        {content}
      </Link>
    );
  }

  if (props.as === 'external') {
    const { href, target, rel } = props;
    return (
      <a
        href={href}
        target={target}
        rel={target === '_blank' ? (rel ?? 'noopener noreferrer') : rel}
        className={classes}
      >
        {content}
      </a>
    );
  }

  const {
    as: _as,
    children: _children,
    variant: _variant,
    size: _size,
    icon: _icon,
    iconEnd: _iconEnd,
    block: _block,
    className: _className,
    type = 'button',
    ...buttonProps
  } = props;

  return (
    <button type={type} className={classes} {...buttonProps}>
      {content}
    </button>
  );
}
