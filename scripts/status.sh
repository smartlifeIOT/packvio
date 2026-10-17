#!/usr/bin/env bash
# Containers, health, deployed commit, disk:  npm run deploy:status
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"
load_config
setup_ssh
trap close_ssh EXIT

remote_script \
  "DEPLOY='$(rpath "$DEPLOY_DIR")'" \
  "SRC='$(rpath "$SRC_DIR")'" \
  "PREFIX='$IMAGE_PREFIX'" \
  "DOMAIN='$DOMAIN'" \
  <<'ENDSSH'
B=$'\033[34m\033[1m'; G=$'\033[32m'; Y=$'\033[33m'; D=$'\033[2m'; N=$'\033[0m'
step() { echo ""; echo "${B}> $*${N}"; }
C="docker compose -f docker-compose.prod.yml"

step "Containers"
cd "$DEPLOY" 2>/dev/null && $C ps || { echo "  no deployment at $DEPLOY"; exit 0; }

step "Health (from inside the network)"
for probe in "nginx|http://127.0.0.1/healthz" "api|http://api:4000/api/v1/health" "web|http://web:3000/ar"; do
  name="${probe%%|*}"; url="${probe#*|}"
  code=$($C exec -T nginx curl -fsS -o /dev/null -w '%{http_code}' "$url" 2>/dev/null || echo 000)
  if [ "$code" = "200" ]; then echo "  ${G}[ok]${N} ${name} ${code}"
  else echo "  ${Y}[!]${N} ${name} returned ${code:-no response}"; fi
done

step "Public"
code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 "https://$DOMAIN/healthz" 2>/dev/null || echo 000)
echo "  https://$DOMAIN/healthz -> ${code}"
exp=$(echo | openssl s_client -servername "$DOMAIN" -connect "$DOMAIN":443 2>/dev/null | openssl x509 -noout -enddate 2>/dev/null | cut -d= -f2)
[ -n "$exp" ] && echo "  certificate expires ${exp}" || echo "  ${Y}[!]${N} could not read the certificate"

step "Catalog"
$C exec -T postgres psql -U "${POSTGRES_USER:-packvio}" -d "${POSTGRES_DB:-packvio}" -tAc \
  "select 'products ' || count(*) filter (where deleted_at is null) ||
          ' · with salla_id ' || count(*) filter (where salla_id is not null) ||
          ' · images ' || (select count(*) from product_images) from products" 2>/dev/null \
  | sed 's/^/  /' || echo "  ${Y}[!]${N} could not query postgres"

step "Deployed commit"
if [ -d "$SRC/.git" ]; then git -C "$SRC" --no-pager log -1 --format="  %h - %s (%an, %ar)"
else echo "  no source checkout yet"; fi

step "Disk and memory"
df -h / | tail -1 | awk '{print "  disk  "$3" used of "$2" ("$5")"}'
free -m | awk '/^Mem:/{print "  mem   "$3"MB used of "$2"MB"}'
free -m | awk '/^Swap:/{print "  swap  "$3"MB used of "$2"MB"}'

step "Images"
docker images "$PREFIX*" --format "  {{.Repository}}:{{.Tag}}  {{.Size}}  {{.CreatedSince}}"
echo ""
ENDSSH
