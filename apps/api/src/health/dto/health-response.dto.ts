/**
 * Shape returned by GET /api/v1/health.
 * Response-only, so there is nothing to validate with class-validator here —
 * request DTOs elsewhere in the app carry the validation decorators.
 */
export class HealthResponseDto {
  /** 'ok' when every dependency is reachable, 'degraded' when one is not. */
  status!: 'ok' | 'degraded';

  /** Process uptime in seconds, rounded. */
  uptime!: number;

  /** True when a `SELECT 1` against Postgres succeeded. */
  db!: boolean;
}
