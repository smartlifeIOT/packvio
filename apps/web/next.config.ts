import { loadEnvConfig } from '@next/env';
import createNextIntlPlugin from 'next-intl/plugin';
import { join } from 'node:path';
import type { NextConfig } from 'next';

/**
 * Load the MONOREPO ROOT .env before anything else reads process.env.
 *
 * Next only looks for .env files in the app directory (apps/web), but this
 * repo keeps one .env at the root — it is shared with docker-compose and
 * apps/api, and .env.example documents it as the single place to configure the
 * stack. Without this, NEXT_PUBLIC_API_URL is simply undefined here and every
 * page fails at its first catalog fetch.
 *
 * This runs at config-evaluation time, which is before the build inlines
 * NEXT_PUBLIC_* values, so the variables are available for both dev and build.
 *
 * `forceReload: true` is load-bearing, not defensive. Next has ALREADY called
 * loadEnvConfig for apps/web by the time this config is evaluated, and the
 * helper memoises its result — so without the flag this call is a silent no-op
 * and NEXT_PUBLIC_API_URL stays undefined.
 */
loadEnvConfig(join(process.cwd(), '..', '..'), process.env.NODE_ENV !== 'production', undefined, true);

// Points next-intl at our request config; messages/ar.json + messages/en.json
// are resolved from there.
const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  /**
   * Standalone output — a self-contained server bundle for the Docker image.
   *
   * Without it the runtime image needs the whole `node_modules` tree; with it
   * Next traces the modules actually reached and emits `.next/standalone` with
   * only those, which is the difference between a ~1GB image and a ~250MB one.
   */
  output: 'standalone',
  /**
   * REQUIRED IN THIS MONOREPO, and silently damaging to omit.
   *
   * File tracing walks up from the app directory to find the dependency root.
   * Left to itself it stops at `apps/web`, misses every package npm hoisted to
   * the workspace root, and produces a standalone bundle that builds cleanly and
   * then throws MODULE_NOT_FOUND on first request inside the container. Pointing
   * it at the repo root makes the trace cover the hoisted tree and
   * `packages/shared` along with it.
   */
  outputFileTracingRoot: join(process.cwd(), '..', '..'),
  /**
   * Lets a build run without evicting a dev server that already owns `.next`.
   * On Windows the two collide hard — the dev server keeps `.next/trace` open,
   * and `next build` dies with EPERM or hangs. Set NEXT_DIST_DIR=.next-build to
   * verify a production build while `npm run dev:web` keeps running.
   */
  distDir: process.env.NEXT_DIST_DIR ?? '.next',
  // packages/shared ships TS sources in dev; transpile it rather than requiring a build first.
  transpilePackages: ['@packvio/shared'],
  typescript: {
    ignoreBuildErrors: false,
  },
  images: {
    /**
     * Product photography will come from Salla's CDN once the sync runs. Declared
     * now so the first synced image renders instead of throwing an "un-configured
     * host" error on a page nobody was expecting to change.
     */
    remotePatterns: [
      { protocol: 'https', hostname: 'cdn.salla.sa' },
      { protocol: 'https', hostname: 'cdn.assets.salla.network' },
      { protocol: 'https', hostname: 'i.salla.sa' },
    ],
  },
};

export default withNextIntl(nextConfig);
