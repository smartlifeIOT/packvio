import 'reflect-metadata';

import { INestApplication, Logger, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { AppModule } from './app.module';

/**
 * OpenAPI docs at /api/v1/docs.
 *
 * This is the contract the frontend work is written against, so it lives with
 * the code that implements it rather than in a document that drifts. Disabled in
 * production: publishing a live schema of every endpoint and every field is free
 * reconnaissance, and nobody browses Swagger against production anyway.
 */
function setupSwagger(app: INestApplication, config: ConfigService): void {
  if (config.get<string>('nodeEnv') === 'production') {
    new Logger('Swagger').log('Skipping /api/v1/docs — disabled in production.');
    return;
  }

  const document = SwaggerModule.createDocument(
    app,
    new DocumentBuilder()
      .setTitle('Packvio API')
      .setDescription(
        'Public read API for the Packvio catalog.\n\n' +
          '**Locale contract:** every endpoint takes `?locale=ar|en` (default `ar`) and returns ' +
          'FLATTENED localized fields — `name`, `slug`, `description` — already resolved. The ' +
          'web app never picks a language field. Every localized entity also carries ' +
          '`alternateSlug`, the same row addressed in the other locale, which is what the ' +
          'language switcher needs to stay on the same page instead of falling back to the home page.\n\n' +
          '**Caching:** all GETs return `Cache-Control: public, max-age=60, ' +
          'stale-while-revalidate=300` and a strong ETag; send `If-None-Match` to get a 304.',
      )
      .setVersion('1.0')
      .addTag('catalog', 'Public catalog reads — categories, products, search, home page')
      .addTag('quotes', "RFQ capture — the site's primary conversion")
      .addTag('health', 'Liveness and dependency status')
      .build(),
  );

  SwaggerModule.setup('api/v1/docs', app, document, {
    swaggerOptions: { persistAuthorization: true, tagsSorter: 'alpha', operationsSorter: 'alpha' },
  });
}

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bufferLogs: false,
    /**
     * Keeps the untouched request bytes on `req.rawBody` alongside the parsed
     * `req.body`. Salla signs the exact bytes it sent, so the webhook HMAC must
     * be computed over those bytes — re-serialising the parsed JSON produces a
     * different byte string (key order, whitespace, unicode escaping) and the
     * signature will never match.
     */
    rawBody: true,
  });
  const config = app.get(ConfigService);

  const port = config.get<number>('port') ?? 4000;
  const webOrigin = config.get<string>('webOrigin') ?? 'http://localhost:3000';

  app.use(helmet());

  /**
   * Trust the reverse proxy for the client IP.
   *
   * Without this, `request.ip` is the proxy's address, so every RFQ would hash
   * to the SAME `ip_hash` and the per-IP rate limit would throttle the entire
   * internet as one caller after five submissions. `1` — trust exactly one hop
   * — rather than `true`: trusting the whole chain lets a caller prepend a
   * forged X-Forwarded-For and mint a fresh identity per request, which is the
   * rate limit turned off.
   */
  app.set('trust proxy', 1);

  // Every route lives under /api/v1 — the web app's NEXT_PUBLIC_API_URL points here.
  app.setGlobalPrefix('api/v1');

  app.enableCors({
    origin: [webOrigin],
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    // The catalog read API is cached at the edge, so callers need to see the
    // validator we issue in order to send it back on the next request.
    exposedHeaders: ['ETag', 'Cache-Control'],
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  setupSwagger(app, config);

  app.enableShutdownHooks();

  await app.listen(port, '0.0.0.0');
  new Logger('Bootstrap').log(`Packvio API listening on http://localhost:${port}/api/v1`);
}

void bootstrap();
