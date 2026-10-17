# syntax=docker/dockerfile:1.7
#
# Packvio API — NestJS 11 + TypeORM.
#
# BUILD CONTEXT IS THE REPO ROOT, not apps/api:
#     docker build -f apps/api/Dockerfile -t packvio-api .
# It has to be. This is an npm workspaces monorepo, apps/api depends on
# packages/shared through a workspace symlink, and the lockfile that makes an
# install reproducible lives at the root. A context of apps/api can see none of
# those three.

# ---------------------------------------------------------------------------
# deps — the install layer, cached on the manifests alone
# ---------------------------------------------------------------------------
FROM node:20-alpine AS deps
WORKDIR /app

# Only the files that decide the dependency graph, so editing a .ts file does
# not invalidate a two-minute npm install. Every workspace's package.json must
# be here: npm reads all of them to build the tree, and a missing one fails the
# install with a lockfile-out-of-sync error that names no cause.
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/

# `npm ci` over `npm install`: it installs exactly the lockfile and errors if the
# manifests disagree with it, which is what a build should do rather than
# quietly resolving something new.
RUN --mount=type=cache,target=/root/.npm \
    npm ci --workspaces --include-workspace-root

# ---------------------------------------------------------------------------
# builder — compile packages/shared, then apps/api
# ---------------------------------------------------------------------------
FROM node:20-alpine AS builder
WORKDIR /app

# One node_modules, at the root. npm hoists every workspace's dependencies
# there and leaves no per-workspace directory, so this single COPY is the whole
# installed tree — including the @packvio/shared symlink the API compiles against.
COPY --from=deps /app/node_modules ./node_modules
COPY package.json package-lock.json ./
COPY packages/shared/ ./packages/shared/
COPY apps/api/ ./apps/api/

# Order matters: apps/api resolves @packvio/shared through the BUILT package, not
# a paths mapping (see CLAUDE.md § Deviations), so shared's dist must exist first
# or the API's compile fails on a missing module.
RUN npm -w packages/shared run build \
 && npm -w apps/api run build

# The production tree, resolved here so the final stage is pure COPY and carries
# no npm layer of its own.
#
# `-w apps/api -w packages/shared` is doing real work: without it npm installs
# every workspace's dependencies into the shared root node_modules, and the API
# image ships Next, React and Tailwind for nothing. The API needs its own deps
# and shared's, and neither needs the web app's.
RUN --mount=type=cache,target=/root/.npm \
    rm -rf node_modules \
 && npm ci --omit=dev --include-workspace-root -w packages/shared -w apps/api \
 && npm cache clean --force

# ts-node and the TypeScript compiler, dropped from the production tree — 25MB
# of the image, and a compiler that has no business being on a server.
#
# They arrive uninvited: TypeORM declares ts-node as an OPTIONAL PEER dependency,
# and npm 7+ installs optional peers by default, so `--omit=dev` leaves both in
# place. TypeORM only reaches for ts-node when it is asked to load a `.ts`
# entity or migration; this image contains none — the data source globs
# `*.{ts,js}` but only ever matches compiled `.js`. The migration runner is
# exercised against this exact image before every deploy, which is the check
# that keeps this honest.
RUN rm -rf node_modules/ts-node node_modules/typescript node_modules/.bin/ts-node* node_modules/.bin/tsc node_modules/.bin/tsserver

# ---------------------------------------------------------------------------
# runtime
# ---------------------------------------------------------------------------
FROM node:20-alpine AS runtime

# dumb-init as PID 1. Node run directly as PID 1 inherits the kernel's special
# treatment of that pid: it gets no default signal handlers, so an unhandled
# SIGTERM does NOTHING and `docker stop` waits out the full grace period before
# SIGKILL — which means Nest's shutdown hooks never run, in-flight requests are
# cut mid-response, and the TypeORM pool is never drained. dumb-init takes pid 1,
# forwards signals to the real process, and reaps orphans.
RUN apk add --no-cache dumb-init

ENV NODE_ENV=production \
    API_PORT=4000 \
    NPM_CONFIG_UPDATE_NOTIFIER=false

WORKDIR /app

# THE WORKSPACE LAYOUT IS PRESERVED IN THE IMAGE, deliberately.
# Two things depend on it. `node_modules/@packvio/shared` is a symlink to
# ../../packages/shared and resolves only if that relative path still exists;
# and the seed finds docs/catalog.json five directories up from
# dist/database/seeds, which lands on /app only when the API sits at
# /app/apps/api. Flattening the tree breaks both — the second one silently, at
# seed time, on a server.
#
# node:20-alpine already ships a `node` user (uid 1000); reusing it beats
# creating another, because the uid stays stable across rebuilds and that
# matters the moment anything is bind-mounted.
COPY --from=builder --chown=node:node /app/node_modules ./node_modules
COPY --from=builder --chown=node:node /app/package.json ./package.json
COPY --from=builder --chown=node:node /app/packages/shared/package.json ./packages/shared/package.json
COPY --from=builder --chown=node:node /app/packages/shared/dist ./packages/shared/dist
COPY --from=builder --chown=node:node /app/apps/api/package.json ./apps/api/package.json
COPY --from=builder --chown=node:node /app/apps/api/dist ./apps/api/dist

# The two files in docs/ that are not documentation — the seed reads both at
# RUNTIME, resolving them five directories up from dist/database/seeds.
# .dockerignore keeps the 76MB of PDFs beside them out of the build context.
#
# product-images.json is easy to forget and fails SILENTLY when it is: the
# loader treats a missing manifest as "this checkout has no photography" and
# returns null, so the seed completes, reports success, and leaves every
# product showing a placeholder. Both files are listed as exceptions in
# .dockerignore for the same reason.
COPY --chown=node:node docs/catalog.json ./docs/catalog.json
COPY --chown=node:node docs/product-images.json ./docs/product-images.json

WORKDIR /app/apps/api
USER node

EXPOSE 4000

# Hits the app's own health route, which reports a degraded dependency in the
# BODY and still answers 200 — so this asks "is the process serving HTTP", and
# compose's dependency ordering is not tied to Postgres being reachable from
# inside the API container.
#
# `node -e` rather than curl or wget: neither is in the image, and adding one is
# a package and a CVE feed for a job the runtime already does.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "require('node:http').get('http://127.0.0.1:'+(process.env.API_PORT||4000)+'/api/v1/health',r=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))"

ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "dist/main.js"]
