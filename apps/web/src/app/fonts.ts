import { IBM_Plex_Sans_Arabic, JetBrains_Mono, Poppins } from 'next/font/google';

/**
 * Self-hosted webfonts. next/font downloads these at BUILD time and serves them
 * from our own origin — there is no runtime request to Google, and no
 * render-blocking <link> to fonts.googleapis.com.
 *
 * Each font exposes a `--font-*-src` CSS variable. globals.css then composes the
 * public design token from it:
 *
 *     --font-display: var(--font-display-src), 'Poppins', system-ui, sans-serif;
 *
 * The indirection is deliberate. Tailwind v4's `@theme` writes --font-display on
 * :root, and next/font writes its variable on <html> — the same element. If both
 * used the bare name they would collide and the winner would depend on stylesheet
 * order, silently breaking the font. Components still only ever see the
 * `--font-display` / `--font-body` / `--font-mono` tokens.
 *
 * Subsets are kept minimal so `preload` only ships the glyph ranges we render:
 * Poppins and JetBrains Mono have no Arabic coverage, so they load `latin` only.
 */

/** Latin display + headings. */
export const displayFont = Poppins({
  subsets: ['latin'],
  weight: ['500', '600', '700'],
  display: 'swap',
  preload: true,
  variable: '--font-display-src',
});

/**
 * Arabic + Latin body copy, and Arabic headings.
 *
 * Substitute for Lama Sans — see CLAUDE.md § Deviations.
 *
 * `adjustFontFallback: false` IS THE POINT OF THIS BLOCK, and it is the one place
 * in the project where next/font's default is actively harmful.
 *
 * Left on, next/font synthesises an `@font-face` named "IBM Plex Sans Arabic
 * Fallback" with `src: local("Arial")` and a `size-adjust` computed by comparing
 * Arial's metrics to IBM Plex Sans Arabic's. That is the right trick for a Latin
 * face and nonsense for this one: Arial carries no Arabic glyphs at all, so every
 * Arabic character falls through to whatever the browser reaches for last, while
 * the size-adjust derived from LATIN metrics is still applied on top of it.
 *
 * Measured on the built site, the hero headline at 56px:
 *
 *     IBM Plex Sans Arabic (the real face)   756px
 *     "IBM Plex Sans Arabic Fallback"        590px   <- 22% narrow
 *     Segoe UI                               786px   <-  4% wide
 *
 * 22% is more than a line's worth of slack, so the headline set one line short
 * until the webfont landed and then re-wrapped, moving the subhead, the buttons,
 * the stat row and the section boundary 68px down the page. The synthesised
 * fallback was making the swap WORSE than having no adjustment at all.
 *
 * Turning it off hands the choice to the stack in globals.css, which names a real
 * Arabic face for every platform we serve. The cost is the ascent/descent
 * overrides that face carried; they are affordable here because every heading and
 * body style in this design sets an explicit line-height, so the line box does not
 * take its size from the font's own vertical metrics.
 */
export const bodyFont = IBM_Plex_Sans_Arabic({
  subsets: ['arabic', 'latin'],
  weight: ['400', '500', '600'],
  display: 'swap',
  preload: true,
  adjustFontFallback: false,
  variable: '--font-body-src',
});

/** Product codes, dimensions, spec values. */
export const monoFont = JetBrains_Mono({
  subsets: ['latin'],
  weight: ['400'],
  display: 'swap',
  preload: true,
  variable: '--font-mono-src',
});

/** Applied together on <html> by the locale layout. */
export const fontVariables = [displayFont.variable, bodyFont.variable, monoFont.variable].join(' ');
