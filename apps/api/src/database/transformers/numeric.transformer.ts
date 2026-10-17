import type { ValueTransformer } from 'typeorm';

/**
 * Postgres `numeric` comes back from pg as a string so no precision is lost in
 * transit. Every money column in this schema is numeric(12,2) — well inside
 * IEEE-754's exact-integer range once scaled — so exposing it as a JS `number`
 * is safe and keeps DTOs free of string-typed prices.
 */
export const numericTransformer: ValueTransformer = {
  to: (value: number | null | undefined): number | null => value ?? null,
  from: (value: string | null): number | null => (value === null ? null : Number(value)),
};
