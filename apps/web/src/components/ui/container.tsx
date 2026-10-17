import type { ReactNode } from 'react';
import { cx } from '@/lib/cx';

/** Semantic elements a Container is allowed to render as. */
export type ContainerElement =
  | 'div'
  | 'section'
  | 'main'
  | 'header'
  | 'footer'
  | 'article'
  | 'nav'
  | 'aside';

/**
 * `page` (1440px) is the default measure. `wide` (1600px) is for sections that
 * should breathe past it — the hero, the value band, anything full-bleed.
 *
 * Two measures rather than one because they solve opposite problems: a 1600px
 * column of body copy runs to roughly 180 characters and is genuinely hard to
 * read, while a 1440px hero on a 1920px display leaves 240px of dead margin on
 * each side and makes the whole page look like it was designed for a laptop.
 */
export type ContainerWidth = 'page' | 'wide';

const WIDTH_CLASSES: Record<ContainerWidth, string> = {
  page: 'max-w-page',
  wide: 'max-w-wide',
};

export type ContainerProps = {
  children: ReactNode;
  /** Semantic element to render. Defaults to `div`. */
  as?: ContainerElement;
  width?: ContainerWidth;
  /** Drop the horizontal gutters — for a container nested inside another. */
  flush?: boolean;
  className?: string;
  id?: string;
};

/**
 * The page measure, centred, with gutters that grow with the viewport:
 * 16px below 640px, 24px below 1024px, 40px above.
 *
 * The third step is the one that matters. At 24px a 1440px measure on a 1920px
 * screen puts content almost against the container edge on the way to the
 * browser chrome; 40px is what stops the layout reading as a narrow strip
 * pinned to the middle of a wide display.
 *
 * `px-*` maps to padding-inline, so the gutters are direction-agnostic.
 */
export function Container({
  children,
  as = 'div',
  width = 'page',
  flush = false,
  className,
  id,
}: ContainerProps) {
  const Component = as;

  return (
    <Component
      id={id}
      className={cx(
        'mx-auto w-full',
        WIDTH_CLASSES[width],
        !flush && 'px-4 sm:px-6 lg:px-10',
        className,
      )}
    >
      {children}
    </Component>
  );
}
