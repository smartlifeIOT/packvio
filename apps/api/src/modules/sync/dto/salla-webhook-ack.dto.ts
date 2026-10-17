/** What the webhook route returns to Salla. Never echoes payload content. */
export class SallaWebhookAckDto {
  /** Always true when we reached 200 — Salla only needs to know we took it. */
  received!: boolean;

  /** True when this delivery collided with an event id already stored. */
  duplicate!: boolean;

  /** The idempotency key used, so a delivery can be traced in salla_events. */
  eventId!: string;
}
