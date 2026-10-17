import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { createHmac, randomUUID } from 'node:crypto';
import request from 'supertest';
import { QueryFailedError } from 'typeorm';
import { SallaEvent } from '../src/modules/sync/entities/salla-event.entity';
import { SallaEventProcessor } from '../src/modules/sync/events/salla-event-processor.service';
import { SALLA_SIGNATURE_HEADER } from '../src/modules/sync/webhooks/salla-signature';
import { SallaWebhookController } from '../src/modules/sync/webhooks/salla-webhook.controller';
import { SallaWebhookSignatureGuard } from '../src/modules/sync/webhooks/salla-webhook-signature.guard';
import { SallaWebhookService } from '../src/modules/sync/webhooks/salla-webhook.service';
import { APP_STORE_AUTHORIZE, PRODUCT_UPDATED } from './fixtures/salla-webhooks';

const SECRET = 'whsec_TESTONLY_5f4e3d2c1b0a9988776655443322110';

/**
 * Stand-in for the salla_events table that enforces the one thing this test
 * cares about: the unique index on event_id. A collision raises the same
 * QueryFailedError shape pg does, SQLSTATE 23505 and all.
 */
class FakeEventRepository {
  readonly rows: Array<Record<string, unknown>> = [];
  readonly insertCalls: Array<Record<string, unknown>> = [];

  save(entity: Record<string, unknown>): Promise<Record<string, unknown>> {
    this.insertCalls.push(entity);

    if (this.rows.some((row) => row.eventId === entity.eventId)) {
      const driverError = Object.assign(
        new Error('duplicate key value violates unique constraint "uq_salla_events_event_id"'),
        { code: '23505' },
      );
      return Promise.reject(new QueryFailedError('INSERT INTO salla_events', [], driverError));
    }

    const stored = { ...entity, id: randomUUID() };
    this.rows.push(stored);
    return Promise.resolve(stored);
  }
}

describe('POST /api/v1/webhooks/salla', () => {
  let app: INestApplication;
  let repository: FakeEventRepository;
  let processor: { enqueue: jest.Mock };

  beforeEach(async () => {
    repository = new FakeEventRepository();
    processor = { enqueue: jest.fn() };

    const moduleRef = await Test.createTestingModule({
      controllers: [SallaWebhookController],
      providers: [
        SallaWebhookService,
        SallaWebhookSignatureGuard,
        { provide: SallaEventProcessor, useValue: processor },
        { provide: getRepositoryToken(SallaEvent), useValue: repository },
        {
          provide: ConfigService,
          useValue: {
            get: (key: string) => (key === 'salla' ? { webhookSecret: SECRET } : undefined),
          },
        },
      ],
    }).compile();

    app = moduleRef.createNestApplication({ rawBody: true });
    app.setGlobalPrefix('api/v1');
    // The same strict pipe main.ts installs — proves the webhook route survives
    // forbidNonWhitelisted, which is why its @Body() is typed `unknown`.
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  function post(payload: unknown, signature?: string) {
    const body = JSON.stringify(payload);
    const req = request(app.getHttpServer())
      .post('/api/v1/webhooks/salla')
      .set('content-type', 'application/json');

    if (signature !== undefined) req.set(SALLA_SIGNATURE_HEADER, signature);
    return req.send(body);
  }

  function signatureFor(payload: unknown, secret = SECRET): string {
    return createHmac('sha256', secret).update(JSON.stringify(payload)).digest('hex');
  }

  describe('signature verification', () => {
    it('accepts a correctly signed payload', async () => {
      const response = await post(APP_STORE_AUTHORIZE, signatureFor(APP_STORE_AUTHORIZE));

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({ received: true, duplicate: false });
      expect(repository.rows).toHaveLength(1);
    });

    it('rejects a body altered after signing', async () => {
      const signature = signatureFor(APP_STORE_AUTHORIZE);
      const response = await post({ ...APP_STORE_AUTHORIZE, merchant: 42 }, signature);

      expect(response.status).toBe(401);
      expect(repository.rows).toHaveLength(0);
    });

    it('rejects an altered signature', async () => {
      const signature = signatureFor(APP_STORE_AUTHORIZE);
      const response = await post(APP_STORE_AUTHORIZE, `${signature.slice(0, -2)}00`);

      expect(response.status).toBe(401);
      expect(repository.rows).toHaveLength(0);
    });

    it('rejects a signature made with a different secret', async () => {
      const response = await post(APP_STORE_AUTHORIZE, signatureFor(APP_STORE_AUTHORIZE, 'nope'));

      expect(response.status).toBe(401);
    });

    it('rejects a missing signature header', async () => {
      const response = await post(APP_STORE_AUTHORIZE);

      expect(response.status).toBe(401);
      expect(repository.rows).toHaveLength(0);
    });
  });

  describe('raw body handling', () => {
    it('hashes the received bytes, not a re-serialisation of the parsed object', async () => {
      // Same JSON value, different bytes: keys reordered and whitespace added.
      const reordered = JSON.stringify(
        { data: APP_STORE_AUTHORIZE.data, event: APP_STORE_AUTHORIZE.event, merchant: 1234567890 },
        null,
        2,
      );
      const signature = createHmac('sha256', SECRET).update(reordered).digest('hex');

      const response = await request(app.getHttpServer())
        .post('/api/v1/webhooks/salla')
        .set('content-type', 'application/json')
        .set(SALLA_SIGNATURE_HEADER, signature)
        .send(reordered);

      // Only passes if the guard hashed the exact bytes supertest sent.
      expect(response.status).toBe(200);
    });
  });

  describe('payload tolerance', () => {
    it('accepts an event carrying fields we do not model', async () => {
      const response = await post(PRODUCT_UPDATED, signatureFor(PRODUCT_UPDATED));

      expect(response.status).toBe(200);
      expect(repository.rows).toHaveLength(1);
    });

    it('rejects a payload missing the envelope fields it depends on', async () => {
      const broken = { merchant: 1, data: {} };
      const response = await post(broken, signatureFor(broken));

      expect(response.status).toBe(400);
    });
  });

  describe('idempotency', () => {
    it('stores one row and returns 200 for both deliveries of the same event', async () => {
      const signature = signatureFor(APP_STORE_AUTHORIZE);

      const first = await post(APP_STORE_AUTHORIZE, signature);
      const second = await post(APP_STORE_AUTHORIZE, signature);

      expect(first.status).toBe(200);
      expect(second.status).toBe(200);
      expect(first.body.duplicate).toBe(false);
      expect(second.body.duplicate).toBe(true);
      expect(first.body.eventId).toBe(second.body.eventId);

      // Both deliveries were attempted, exactly one row survived.
      expect(repository.insertCalls).toHaveLength(2);
      expect(repository.rows).toHaveLength(1);

      // And the duplicate was not queued for processing a second time.
      expect(processor.enqueue).toHaveBeenCalledTimes(1);
    });

    it('treats two genuinely different events as different rows', async () => {
      await post(APP_STORE_AUTHORIZE, signatureFor(APP_STORE_AUTHORIZE));
      await post(PRODUCT_UPDATED, signatureFor(PRODUCT_UPDATED));

      expect(repository.rows).toHaveLength(2);
    });
  });

  describe('secret handling', () => {
    it('never stores the authorize tokens in cleartext in the event payload', async () => {
      await post(APP_STORE_AUTHORIZE, signatureFor(APP_STORE_AUTHORIZE));

      const stored = JSON.stringify(repository.rows[0].payload);

      expect(stored).not.toContain(APP_STORE_AUTHORIZE.data.access_token);
      expect(stored).not.toContain(APP_STORE_AUTHORIZE.data.refresh_token);
      expect(stored).toContain('v1:');
    });
  });
});
