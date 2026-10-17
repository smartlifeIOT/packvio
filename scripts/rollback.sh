#!/usr/bin/env bash
# Restore the previous deploy's images:  npm run deploy:rollback
#
# Every deploy retags the running images ':previous' before overwriting
# ':latest', so this swaps them back without rebuilding — seconds, not minutes.
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"
load_config
setup_ssh
trap close_ssh EXIT

step "Checking for a rollback target"
HAVE=$(remote_script "PREFIX='$IMAGE_PREFIX'" <<'ENDSSH'
missing=0
for svc in api web nginx; do
  docker image inspect "$PREFIX-$svc:previous" >/dev/null 2>&1 || missing=1
done
[ "$missing" = "1" ] && { echo NONE; exit 0; }
docker images "$PREFIX*:previous" --format "  {{.Repository}}:{{.Tag}}  {{.CreatedSince}}"
ENDSSH
)
[ "$HAVE" = "NONE" ] || [ -z "$HAVE" ] && die "No ':previous' images on the server — nothing to roll back to."
echo "$HAVE"

warn "Database migrations are NOT reversed. If the release you are rolling back"
warn "from changed the schema, the older code may not match it — roll the code"
warn "back to buy time, then fix forward on the data."
confirm "Roll back to these?" || exit 0

set +e
remote_script "PREFIX='$IMAGE_PREFIX'" "DEPLOY='$(rpath "$DEPLOY_DIR")'" <<'ENDSSH'
set -uo pipefail
G=$'\033[32m'; Y=$'\033[33m'; N=$'\033[0m'
# Same image names the deploy builds — see the note in scripts/deploy.sh.
export API_IMAGE="${PREFIX:-packvio}-api:latest"
export WEB_IMAGE="${PREFIX:-packvio}-web:latest"
export NGINX_IMAGE="${PREFIX:-packvio}-nginx:latest"
C="docker compose -f docker-compose.prod.yml"

for svc in api web nginx; do
  # Keep the bad build reachable as :failed in case it needs inspecting.
  docker image inspect "$PREFIX-$svc:latest" >/dev/null 2>&1 \
    && docker tag "$PREFIX-$svc:latest" "$PREFIX-$svc:failed"
  docker tag "$PREFIX-$svc:previous" "$PREFIX-$svc:latest" || exit 1
done

cd "$DEPLOY" || exit 1
$C up -d --force-recreate api web nginx || exit 1
echo "  ${G}[ok]${N} previous images restored"

for _ in $(seq 1 20); do
  n=$($C exec -T nginx curl -fsS -o /dev/null -w '%{http_code}' http://127.0.0.1/healthz 2>/dev/null || echo 000)
  a=$($C exec -T nginx curl -fsS -o /dev/null -w '%{http_code}' http://api:4000/api/v1/health 2>/dev/null || echo 000)
  w=$($C exec -T nginx curl -fsS -o /dev/null -w '%{http_code}' http://web:3000/ar 2>/dev/null || echo 000)
  [ "$n$a$w" = "200200200" ] && { echo "  ${G}[ok]${N} healthy again"; exit 0; }
  sleep 3
done
echo "  ${Y}[!]${N} still not answering — check 'npm run deploy:logs'"
exit 1
ENDSSH
RC=$?
set -e
echo ""
exit $RC
