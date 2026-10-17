# syntax=docker/dockerfile:1.7
#
# Packvio web — Next.js 15 App Router, standalone output.
#
# BUILD CONTEXT IS THE REPO ROOT:
#     docker build -f apps/web/Dockerfile -t packvio-web .
# Same reason as the API: workspaces, the shared package, and the lockfile all
# live above apps/web.

# ---------------------------------------------------------------------------
# deps
# ---------------------------------------------------------------------------
FROM node:20-alpine AS deps
WORKDIR /app

COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/

RUN --mount=type=cache,target=/root/.npm \
    npm ci --workspaces --include-workspace-root

# ---------------------------------------------------------------------------
# builder
# ---------------------------------------------------------------------------
FROM node:20-alpine AS builder
WORKDIR /app

# ===========================================================================
# NEXT_PUBLIC_* ARE BUILD ARGUMENTS, NOT RUNTIME ENVIRONMENT.
#
# This is the single most common way a Next Docker image goes wrong, and it
# fails quietly. `next build` INLINES every NEXT_PUBLIC_ value into the client
# bundles as a string literal; nothing reads process.env in the browser at
# runtime, because there is no process there. Set these only in compose's
# `environment:` and they are undefined at build time, so the literal baked into
# the JavaScript is `undefined` — and the site renders, and every URL built from
# one is broken, and no log anywhere says why.
#
# The consequence to keep in mind: an image is PINNED to the values it was built
# with. Staging and production need separate builds, and changing a domain means
# rebuilding, not restarting. That is the trade Next's design makes for you.
#
# The API's address is deliberately NOT among them. Server-side code reads
# API_INTERNAL_URL at RUNTIME (see lib/api/client.ts) so the container-network
# address is never frozen into an image or shipped to a browser.
# ===========================================================================
ARG NEXT_PUBLIC_SITE_URL
ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_MAP_LAT
ARG NEXT_PUBLIC_MAP_LNG
ARG NEXT_PUBLIC_MAP_ZOOM

ENV NEXT_PUBLIC_SITE_URL=$NEXT_PUBLIC_SITE_URL \
    NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL \
    NEXT_PUBLIC_MAP_LAT=$NEXT_PUBLIC_MAP_LAT \
    NEXT_PUBLIC_MAP_LNG=$NEXT_PUBLIC_MAP_LNG \
    NEXT_PUBLIC_MAP_ZOOM=$NEXT_PUBLIC_MAP_ZOOM \
    NEXT_TELEMETRY_DISABLED=1 \
    NODE_ENV=production

COPY --from=deps /app/node_modules ./node_modules
COPY package.json package-lock.json ./
COPY packages/shared/ ./packages/shared/
COPY apps/web/ ./apps/web/

# shared first — apps/web imports @packvio/shared and `transpilePackages` points
# at the package, which has to exist as a resolvable workspace before the build.
RUN npm -w packages/shared run build \
 && npm -w apps/web run build

# ---------------------------------------------------------------------------
# runtime
# ---------------------------------------------------------------------------
FROM node:20-alpine AS runtime

RUN apk add --no-cache dumb-init

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000

# Without HOSTNAME the standalone server binds 127.0.0.1 inside the container,
# which is unreachable from nginx on the container network — it presents as a
# 502 from a container whose own logs say it started fine.
ENV HOSTNAME=0.0.0.0

WORKDIR /app

# The standalone bundle is three pieces and all three are needed. `standalone`
# holds the server and its traced node_modules; `static` and `public` are NOT
# included in it, because Next assumes a CDN serves them — with no CDN in front,
# the server serves them itself and they have to be on disk in the exact
# positions below or every asset 404s while the HTML renders fine.
#
# `outputFileTracingRoot` is set to the repo root in next.config.ts, so the
# bundle mirrors the workspace: the entrypoint is apps/web/server.js, not
# server.js at the root.
COPY --from=builder --chown=node:node /app/apps/web/.next/standalone ./
COPY --from=builder --chown=node:node /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=builder --chown=node:node /app/apps/web/public ./apps/web/public

USER node

EXPOSE 3000

# /ar rather than / — `/` is a redirect to the default locale, and a healthcheck
# that passes on a 307 proves only that the middleware is running. /ar renders
# the home page, which exercises the locale tree and a real catalog fetch.
#
# 60s start period: the first request compiles nothing (this is a production
# build) but does have to reach the API, which may still be starting.
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
  CMD node -e "require('node:http').get('http://127.0.0.1:'+(process.env.PORT||3000)+'/ar',r=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))"

ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "apps/web/server.js"]
