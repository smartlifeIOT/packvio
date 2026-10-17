import { createNavigation } from 'next-intl/navigation';
import type { ComponentProps } from 'react';
import { routing } from './routing';

/**
 * Locale-aware replacements for next/link and next/navigation.
 * Always import Link / redirect / useRouter from here so the active locale
 * prefix is preserved.
 *
 * Because `routing` carries a `pathnames` map, these are TYPED: `href` only
 * accepts a pathname the app actually defines, and a route with a `[slug]`
 * requires its params. A typo in a link is a compile error rather than a 404
 * someone finds in production.
 */
export const { Link, redirect, usePathname, useRouter, getPathname } = createNavigation(routing);

/**
 * The href shape `Link` accepts, derived from the component rather than
 * restated — so adding a route to `pathnames` widens it automatically.
 */
export type AppHref = ComponentProps<typeof Link>['href'];
