/**
 * WCAG 2.1 contrast maths. Used by the styleguide to show live ratios next to
 * every swatch, so a token that drifts out of compliance is visible immediately
 * rather than discovered in an audit.
 */

function channels(hex: string): [number, number, number] {
  const value = hex.replace('#', '');
  const full =
    value.length === 3
      ? value
          .split('')
          .map((c) => c + c)
          .join('')
      : value;

  return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16) / 255) as [number, number, number];
}

/** Relative luminance per WCAG 2.1. */
export function luminance(hex: string): number {
  const [r, g, b] = channels(hex).map((c) =>
    c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4,
  ) as [number, number, number];

  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Contrast ratio between two hex colours, 1–21. */
export function contrastRatio(a: string, b: string): number {
  const [lighter, darker] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (lighter + 0.05) / (darker + 0.05);
}

export type ContrastGrade = 'AAA' | 'AA' | 'AA-large' | 'fail';

/**
 * Grade for NORMAL body text. 4.5 is the AA floor, 7 is AAA.
 * A ratio between 3 and 4.5 only passes for large text (>=24px, or >=18.66px bold),
 * which is why it is reported separately rather than rounded up to a pass.
 */
export function grade(ratio: number): ContrastGrade {
  if (ratio >= 7) return 'AAA';
  if (ratio >= 4.5) return 'AA';
  if (ratio >= 3) return 'AA-large';
  return 'fail';
}

export function formatRatio(ratio: number): string {
  return `${ratio.toFixed(2)}:1`;
}
