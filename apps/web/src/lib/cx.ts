type ClassValue = string | false | null | undefined;

/**
 * Tiny className joiner. Avoids pulling in clsx for what is a one-liner and
 * keeps every primitive free of runtime dependencies.
 */
export function cx(...parts: ClassValue[]): string {
  return parts.filter(Boolean).join(' ');
}
