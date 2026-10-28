#!/usr/bin/env bash
# Purge the site's page cache:  npm run deploy:purge
#
# WHY THIS EXISTS
# The site renders from the catalog API with `revalidate: 300`. So a DATA change
# — a seed, a prune, an edit in the admin — is live in the database and still
# invisible on the site for up to five minutes, and the first visitor after that
# window gets the stale page while the fresh one renders behind them. Nothing in
# `deploy:seed` ever said so, which makes a seed that worked perfectly look like
# a seed that did nothing. A rebuild hid it: a new container has an empty cache,
# so the problem only showed up when data changed on its own.
#
# This calls the same /api/revalidate endpoint the Salla sync uses, with the
# `catalog` tag, which every catalog fetch carries — so one call purges the lot.
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"
load_config
setup_ssh
trap close_ssh EXIT

step "Purging the page cache on $SERVER"
remote_script "DEPLOY='$(rpath "$DEPLOY_DIR")'" "PREFIX='$IMAGE_PREFIX'" <<'ENDSSH'
set -euo pipefail
export API_IMAGE="${PREFIX:-packvio}-api:latest"
export WEB_IMAGE="${PREFIX:-packvio}-web:latest"
export NGINX_IMAGE="${PREFIX:-packvio}-nginx:latest"
cd "$DEPLOY"
C="docker compose -f docker-compose.prod.yml"

set -a; . "$DEPLOY/.env"; set +a

# The endpoint DISABLES itself when REVALIDATE_SECRET is unset rather than
# running unauthenticated, so without one there is nothing to call. Restarting
# web is the blunt equivalent: the ISR cache lives in the container.
if [ -z "${REVALIDATE_SECRET:-}" ]; then
  echo "   REVALIDATE_SECRET is not set in .env — the purge endpoint is disabled."
  echo "   Restarting web instead, which empties the cache the hard way."
  $C restart web
  echo "   Set REVALIDATE_SECRET to make this a purge rather than a restart."
  exit 0
fi

# Called from the nginx container: it is on the internal network, and it has
# curl (the deploy's own health check uses it). web:3000 is not published.
code=$($C exec -T nginx curl -s -o /tmp/purge.out -w '%{http_code}' \
  -X POST http://web:3000/api/revalidate \
  -H 'content-type: application/json' \
  -H "x-revalidate-secret: $REVALIDATE_SECRET" \
  -d '{"tags":["catalog"]}' 2>/dev/null || echo 000)

if [ "$code" = "200" ]; then
  echo "   purged: $($C exec -T nginx cat /tmp/purge.out 2>/dev/null)"
else
  echo "   ✗ purge returned HTTP $code"
  $C exec -T nginx cat /tmp/purge.out 2>/dev/null || true
  echo ""
  echo "   401 means REVALIDATE_SECRET in .env does not match the one the web"
  echo "   container was started with — recreate it:  $C up -d web"
  exit 1
fi
ENDSSH
echo ""
