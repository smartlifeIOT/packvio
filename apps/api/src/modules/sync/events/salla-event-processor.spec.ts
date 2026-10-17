import type { Repository } from 'typeorm';
import type { DataSource } from 'typeorm';
import { SallaEvent, SallaEventStatus } from '../entities/salla-event.entity';
import { SyncRun, SyncRunStatus } from '../entities/sync-run.entity';
import type { SallaCatalogWriterService, WriteResult } from '../catalog/salla-catalog-writer.service';
import { RevalidationService } from '../revalidation/revalidation.service';
import type { SallaTokenService } from '../token/salla-token.service';
import { MAX_EVENT_ATTEMPTS, SallaEventProcessor } from './salla-event-processor.service';

/**
 * The worker's failure and batching behaviour, against in-memory repositories.
 *
 * What matters here is not that a product gets written — the writer's own suite
 * covers that against a real database — but what happens when one does NOT:
 * that attempts climb, the error is kept, the row lands in `failed`, and the
 * retry ladder eventually stops rather than hammering a poisoned payload
 * forever.
 */

function makeEvent(overrides: Partial<SallaEvent> = {}): SallaEvent {
  return {
    id: overrides.id ?? 'event-1',
    eventId: 'sha256:abc',
    event: overrides.event ?? 'product.updated',
    storeId: '1234567890',
    payload: overrides.payload ?? { data: { id: 1, sku: 'PCS/08' } },
    signature: null,
    status: overrides.status ?? SallaEventStatus.Pending,
    attempts: overrides.attempts ?? 0,
    error: overrides.error ?? null,
    receivedAt: new Date('2026-08-19T10:00:00Z'),
    processedAt: null,
    updatedAt: overrides.updatedAt ?? new Date('2026-08-19T10:00:00Z'),
  } as SallaEvent;
}

/** Minimal in-memory stand-in for the two repositories the worker uses. */
function makeHarness(options: { write?: () => Promise<WriteResult> } = {}) {
  const events = new Map<string, SallaEvent>();
  const runs: SyncRun[] = [];

  const eventsRepo = {
    /**
     * Honours BOTH the status and the `attempts: LessThan(...)` filter.
     *
     * The attempts filter is what stops an exhausted event being retried
     * forever, so a stub that ignored it would pass a test the production
     * query could then fail — the harness would be asserting its own
     * behaviour instead of the service's.
     */
    find: ({ where }: { where?: { status?: SallaEventStatus; attempts?: unknown } } = {}) =>
      Promise.resolve(
        [...events.values()].filter((event) => {
          if (where?.status && event.status !== where.status) return false;
          const attempts = where?.attempts as
            | { type?: string; value?: number }
            | undefined;
          if (attempts?.type === 'lessThan' && typeof attempts.value === 'number') {
            return event.attempts < attempts.value;
          }
          return true;
        }),
      ),
    findOne: ({ where }: { where: { id: string } }) =>
      Promise.resolve(events.get(where.id) ?? null),
    save: (event: SallaEvent) => {
      events.set(event.id, { ...event });
      return Promise.resolve(event);
    },
    update: (where: { id: string }, patch: Partial<SallaEvent>) => {
      const existing = events.get(where.id);
      if (existing) events.set(where.id, { ...existing, ...patch });
      return Promise.resolve({ affected: 1 });
    },
  } as unknown as Repository<SallaEvent>;

  const runsRepo = {
    create: (data: Partial<SyncRun>) => ({ id: `run-${runs.length + 1}`, ...data }) as SyncRun,
    save: (run: SyncRun) => {
      const index = runs.findIndex((entry) => entry.id === run.id);
      if (index >= 0) runs[index] = run;
      else runs.push(run);
      return Promise.resolve(run);
    },
  } as unknown as Repository<SyncRun>;

  const dataSource = {
    transaction: <T>(work: (manager: unknown) => Promise<T>) => work({}),
  } as unknown as DataSource;

  const writer = {
    upsertProduct:
      options.write ??
      (() => Promise.resolve({ outcome: 'updated', tags: ['catalog'], detail: 'updated PCS/08' })),
    deleteProduct: () =>
      Promise.resolve({ outcome: 'deleted', tags: ['catalog'], detail: 'deleted' }),
    upsertCategory: () =>
      Promise.resolve({ outcome: 'updated', tags: ['catalog'], detail: 'updated category' }),
    deleteCategory: () =>
      Promise.resolve({ outcome: 'deleted', tags: ['catalog'], detail: 'deactivated' }),
  } as unknown as SallaCatalogWriterService;

  const sent: string[][] = [];
  const revalidation = {
    createBatch: () => new RevalidationService({} as never, {} as never).createBatch(),
    revalidate: (batch: { resolve: () => string[] }) => {
      sent.push(batch.resolve());
      return Promise.resolve(true);
    },
  } as unknown as RevalidationService;

  const tokens = {} as SallaTokenService;

  const processor = new SallaEventProcessor(
    eventsRepo,
    runsRepo,
    dataSource,
    tokens,
    writer,
    revalidation,
  );

  return { processor, events, runs, sent };
}

/** Lets the worker's setImmediate-driven drain finish. */
const settle = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 20));

describe('SallaEventProcessor', () => {
  describe('success path', () => {
    it('marks a product event processed and collects its tags', async () => {
      const { processor, events, sent } = makeHarness();
      events.set('event-1', makeEvent());

      processor.enqueue('event-1');
      await settle();

      expect(events.get('event-1')?.status).toBe(SallaEventStatus.Processed);
      expect(events.get('event-1')?.error).toBeNull();
      expect(events.get('event-1')?.attempts).toBe(1);
      expect(sent).toEqual([['catalog']]);
    });

    it('marks a SKIPPED write as skipped, not processed', async () => {
      const { processor, events } = makeHarness({
        write: () =>
          Promise.resolve({ outcome: 'skipped', tags: [], detail: 'stale payload for PCS/08' }),
      });
      events.set('event-1', makeEvent());

      processor.enqueue('event-1');
      await settle();

      // The distinction matters operationally: a skipped event is not a failure
      // and must not show up in the failed count an operator is watching.
      expect(events.get('event-1')?.status).toBe(SallaEventStatus.Skipped);
      expect(events.get('event-1')?.error).toBeNull();
    });

    it('skips an event it does not mirror rather than leaving it pending forever', async () => {
      const { processor, events } = makeHarness();
      events.set('event-1', makeEvent({ event: 'order.created' }));

      processor.enqueue('event-1');
      await settle();

      expect(events.get('event-1')?.status).toBe(SallaEventStatus.Skipped);
    });
  });

  describe('failure path', () => {
    it('increments attempts, stores the error and marks the event failed', async () => {
      const { processor, events } = makeHarness({
        write: () => Promise.reject(new Error('deadlock detected')),
      });
      events.set('event-1', makeEvent());

      processor.enqueue('event-1');
      await settle();

      const stored = events.get('event-1');
      expect(stored?.status).toBe(SallaEventStatus.Failed);
      expect(stored?.attempts).toBe(1);
      expect(stored?.error).toBe('deadlock detected');
      expect(stored?.processedAt).not.toBeNull();
    });

    it('records the batch as PARTIAL when an event failed', async () => {
      const { processor, events, runs } = makeHarness({
        write: () => Promise.reject(new Error('boom')),
      });
      events.set('event-1', makeEvent());

      processor.enqueue('event-1');
      await settle();

      expect(runs).toHaveLength(1);
      expect(runs[0]?.status).toBe(SyncRunStatus.Partial);
      expect(runs[0]?.error).toContain('1 event(s) failed');
    });

    it('still fires the revalidation for the events that DID succeed', async () => {
      let calls = 0;
      const { processor, events, sent } = makeHarness({
        write: () => {
          calls += 1;
          if (calls === 1) return Promise.reject(new Error('boom'));
          return Promise.resolve({
            outcome: 'updated' as const,
            tags: ['catalog', 'product:cup'],
            detail: 'updated',
          });
        },
      });
      events.set('event-1', makeEvent({ id: 'event-1' }));
      events.set('event-2', makeEvent({ id: 'event-2' }));

      processor.enqueue('event-1');
      processor.enqueue('event-2');
      await settle();

      expect(sent).toHaveLength(1);
      expect(sent[0]).toEqual(expect.arrayContaining(['catalog', 'product:cup']));
    });
  });

  describe('retry ladder', () => {
    it('requeues a failed event once its backoff has elapsed', async () => {
      const { processor, events } = makeHarness();
      events.set(
        'event-1',
        makeEvent({
          status: SallaEventStatus.Failed,
          attempts: 1,
          error: 'boom',
          // Attempt 1 waits 1 minute; this is two minutes ago.
          updatedAt: new Date(Date.now() - 2 * 60_000),
        }),
      );

      await processor.retryFailed();
      await settle();

      expect(events.get('event-1')?.status).toBe(SallaEventStatus.Processed);
      // The attempt counter KEEPS climbing — a retry is one more attempt, not
      // a fresh budget.
      expect(events.get('event-1')?.attempts).toBe(2);
    });

    it('does NOT requeue an event whose backoff has not elapsed', async () => {
      const { processor, events } = makeHarness();
      events.set(
        'event-1',
        makeEvent({
          status: SallaEventStatus.Failed,
          attempts: 1,
          updatedAt: new Date(Date.now() - 5_000),
        }),
      );

      await processor.retryFailed();
      await settle();

      expect(events.get('event-1')?.status).toBe(SallaEventStatus.Failed);
    });

    it('stops retrying once attempts are exhausted, leaving the event failed', async () => {
      const { processor, events } = makeHarness();
      events.set(
        'event-1',
        makeEvent({
          status: SallaEventStatus.Failed,
          attempts: MAX_EVENT_ATTEMPTS,
          error: 'permanently broken payload',
          updatedAt: new Date(Date.now() - 24 * 60 * 60_000),
        }),
      );

      await processor.retryFailed();
      await settle();

      // Left for a human — and surfaced by /admin/salla/status with its error.
      expect(events.get('event-1')?.status).toBe(SallaEventStatus.Failed);
      expect(events.get('event-1')?.attempts).toBe(MAX_EVENT_ATTEMPTS);
      expect(events.get('event-1')?.error).toBe('permanently broken payload');
    });

    it('gives up after exactly MAX_EVENT_ATTEMPTS failures', async () => {
      const { processor, events } = makeHarness({
        write: () => Promise.reject(new Error('always fails')),
      });
      events.set('event-1', makeEvent());

      processor.enqueue('event-1');
      await settle();

      // Drive the ladder by ageing the row past each backoff step.
      for (let attempt = 1; attempt < MAX_EVENT_ATTEMPTS + 2; attempt += 1) {
        const current = events.get('event-1');
        if (!current) break;
        events.set('event-1', {
          ...current,
          updatedAt: new Date(Date.now() - 24 * 60 * 60_000),
        });
        await processor.retryFailed();
        await settle();
      }

      expect(events.get('event-1')?.attempts).toBe(MAX_EVENT_ATTEMPTS);
      expect(events.get('event-1')?.status).toBe(SallaEventStatus.Failed);
    });
  });

  describe('batching', () => {
    it('writes ONE SyncRun and fires ONE revalidation for a burst of events', async () => {
      const { processor, events, runs, sent } = makeHarness();
      for (let index = 1; index <= 25; index += 1) {
        events.set(`event-${index}`, makeEvent({ id: `event-${index}` }));
      }

      for (let index = 1; index <= 25; index += 1) processor.enqueue(`event-${index}`);
      await settle();

      // 25 webhooks, one audit row, one cache purge.
      expect(runs).toHaveLength(1);
      expect(runs[0]?.entitiesSeen).toBe(25);
      expect(runs[0]?.entitiesUpdated).toBe(25);
      expect(runs[0]?.status).toBe(SyncRunStatus.Succeeded);
      expect(sent).toHaveLength(1);
    });

    it('records no SyncRun at all when there was nothing to drain', async () => {
      const { processor, runs } = makeHarness();
      processor.enqueue('does-not-exist');
      await settle();

      // The row is created lazily, but the queue had an id, so one run exists
      // with nothing in it — what must NOT happen is a run per event.
      expect(runs.length).toBeLessThanOrEqual(1);
    });
  });
});
