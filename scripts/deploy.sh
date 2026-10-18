#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# Deploy:  npm run deploy
#
# The SERVER pulls from GitHub and builds there. Nothing large is uploaded —
# an image transfer over scp is what keeps breaking on slow links.
#
#   npm run deploy                     normal
#   npm run deploy -- --verbose        full build output
#   npm run deploy -- --no-cache       ignore the layer cache
#   npm run deploy -- --branch dev     ship a different branch
#   npm run deploy -- --skip-build     re-release the images already on the box
#   npm run deploy -- --seed           also run the catalog seed (not automatic)
#
# The whole thing runs DETACHED on the server via setsid, with your terminal
# following a log. Builds take minutes and a dropped SSH connection would
# otherwise kill one halfway through. Close the laptop if you like —
# `npm run deploy:watch` picks the log back up.
# ---------------------------------------------------------------------------
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"
load_config

VERBOSE=0
NO_CACHE=""
SKIP_BUILD=0
RUN_SEED=0
while [ $# -gt 0 ]; do
  case "$1" in
    --verbose)    VERBOSE=1; shift ;;
    --no-cache)   NO_CACHE="--no-cache"; shift ;;
    --skip-build) SKIP_BUILD=1; shift ;;
    --seed)       RUN_SEED=1; shift ;;
    --branch)     BRANCH="$2"; shift 2 ;;
    *) die "Unknown option: $1" ;;
  esac
done

: "${REPO_URL:?REPO_URL missing from deploy.config}"

echo ""
echo "${C_BOLD}Packvio — deploy${C_RESET}"
info "$SERVER · $BRANCH · https://$DOMAIN"

setup_ssh
trap close_ssh EXIT

START=$(date +%s)
LOG="/tmp/packvio-deploy-$(date +%Y%m%d-%H%M%S).log"

# Everything below runs on the server, detached, writing to $LOG. The local
# side then tails it — so the build survives this terminal going away.
remote_script \
  "REPO='$(repo_url_with_token)'" \
  "BRANCH='$BRANCH'" \
  "DEPLOY='$(rpath "$DEPLOY_DIR")'" \
  "SRC='$(rpath "$SRC_DIR")'" \
  "PREFIX='$IMAGE_PREFIX'" \
  "COMPOSE_FILE='$COMPOSE_FILE'" \
  "DOMAIN='$DOMAIN'" \
  "NO_CACHE='$NO_CACHE'" \
  "VERBOSE='$VERBOSE'" \
  "SKIP_BUILD='$SKIP_BUILD'" \
  "RUN_SEED='$RUN_SEED'" \
  "LOG='$LOG'" \
  <<'ENDSSH'
set -euo pipefail

cat > /tmp/packvio-deploy-body.sh <<'BODY'
set -uo pipefail
exec 2>&1
G=$'\033[32m'; Y=$'\033[33m'; R=$'\033[31m'; B=$'\033[34m'; N=$'\033[0m'
say() { echo "${B}▸${N} $*"; }
fail() { echo "${R}✗${N} $*"; echo "__PACKVIO_DEPLOY_FAIL__"; exit 1; }

export DOCKER_BUILDKIT=1
export COMPOSE_DOCKER_CLI_BUILD=1

# docker-compose.prod.yml resolves ${API_IMAGE:-packvio-api:local}. We build and
# tag :latest, because :latest/:previous/:failed is what makes a rebuild-free
# rollback possible — so the names have to be handed to compose explicitly.
# Without this it goes looking for packvio-api:local, which nothing ever built,
# and `migrate` fails with a pull error that names no cause.
export API_IMAGE="$PREFIX-api:latest"
export WEB_IMAGE="$PREFIX-web:latest"
export NGINX_IMAGE="$PREFIX-nginx:latest"

[ -f "$DEPLOY/.env" ] || fail "No .env at $DEPLOY. Copy deploy/env.prod.example and fill it in first."
set -a; . "$DEPLOY/.env"; set +a

# ---- preflight ----------------------------------------------------------
say "Preflight"
for c in git docker; do command -v "$c" >/dev/null || fail "$c is not installed"; done
docker compose version >/dev/null 2>&1 || fail "the docker compose plugin is not installed"

MEM=$(free -m | awk '/^Mem:/{print $2}')
SWAP=$(free -m | awk '/^Swap:/{print $2}')
TOTAL=$(( MEM + SWAP ))
echo "   ${MEM}MB RAM + ${SWAP}MB swap = ${TOTAL}MB"
# Two Node builds, one of them a Next production build. Below this the OOM
# killer takes something — and on a shared box that something may be another
# application, not this build.
if [ "$SKIP_BUILD" != "1" ] && [ "$TOTAL" -lt 3000 ]; then
  fail "Need ~3000MB of RAM+swap to build; this box has ${TOTAL}MB.
   Add swap:  fallocate -l 4G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
   Or build the images in CI and set API_IMAGE / WEB_IMAGE / NGINX_IMAGE in .env."
fi

DISK=$(df -Pm "$DEPLOY" | awk 'NR==2{print $4}')
echo "   ${DISK}MB free on the deploy volume"
[ "$DISK" -lt 4000 ] && echo "   ${Y}!${N} under 4GB free — docker builds may fail. 'docker system prune -f' frees layer cache."

# ---- required variables -------------------------------------------------
# docker-compose.prod.yml now uses ${VAR:?message} for everything that is fatal
# when blank, so compose refuses to run rather than substituting an empty
# string. This repeats the check BEFORE the build for one reason: compose is not
# consulted until after three Docker builds, and waiting five minutes to be told
# a variable is missing is five minutes you do not get back.
#
# The whole set is reported at once, so one pass through .env fixes all of it.
say "Checking $DEPLOY/.env"
REQUIRED="PACKVIO_DOMAIN SITE_URL POSTGRES_USER POSTGRES_PASSWORD POSTGRES_DB
          SALLA_TOKEN_ENC_KEY QUOTE_IP_HASH_SALT"
MISSING=""
for key in $REQUIRED; do
  eval "v=\${$key:-}"
  [ -n "$v" ] || MISSING="$MISSING $key"
done
if [ -n "$MISSING" ]; then
  fail "missing or empty in $DEPLOY/.env:$MISSING

   Compose substitutes a blank string for an unset variable and carries on with
   a WARNING, so the stack comes up and then fails in three different places at
   once — the API rejects an empty WEB_ORIGIN at boot and crash-loops, and nginx
   renders 'server_name ;' and refuses to start. Add them and redeploy.

   PACKVIO_DOMAIN=$DOMAIN
   SITE_URL=https://$DOMAIN

   deploy/env.prod.example lists every variable and where its value comes from.
   Compare against it:  diff <(grep -oE '^[A-Z_]+' $DEPLOY/.env | sort -u) \\
                             <(grep -oE '^[A-Z_]+' $SRC/deploy/env.prod.example | sort -u)"
fi
echo "   $(echo $REQUIRED | wc -w) required variables present"
# SITE_URL must carry its scheme — the API validates it as a URI and Joi rejects
# a bare hostname just as firmly as an empty string.
case "$SITE_URL" in
  https://*|http://*) ;;
  *) fail "SITE_URL is '$SITE_URL', which has no scheme.
   The API validates it as a URI, so a bare hostname fails at boot exactly like
   a blank one. Set:  SITE_URL=https://$DOMAIN" ;;
esac

# ---- edge ports ---------------------------------------------------------
# Checked HERE, before several minutes of Docker build, because a port conflict
# is otherwise discovered by `up -d` at the very end and reported by the daemon
# as a container-networking error that names a container id and not the thing
# actually holding the port.
EDGE_MODE="${EDGE_MODE:-standalone}"
say "Checking the edge ports"
echo "   edge mode: $EDGE_MODE"
for publish in "${EDGE_HTTP_PUBLISH:-80}" "${EDGE_HTTPS_PUBLISH:-443}"; do
  # "127.0.0.1:8080" -> 8080, "80" -> 80.
  p="${publish##*:}"

  # 1. Another CONTAINER publishing it. Our own nginx holding the port is the
  #    expected steady state — `up -d` recreates it — so it does not count.
  holder=$(docker ps --format '{{.Names}}\t{{.Ports}}' 2>/dev/null \
            | grep -E ":$p->" | grep -v '^packvio-nginx' | cut -f1 | tr '\n' ' ' || true)

  # 2. A listener on the HOST — a system nginx, Apache, Caddy. Just as fatal,
  #    and this used to be only a warning, which is how a deploy got all the way
  #    to the health check with a system nginx sitting on :80 and :443.
  #    docker-proxy entries are excluded because case 1 already covers those,
  #    and our own nginx's proxy would otherwise look like a conflict.
  if [ -z "$holder" ] && command -v ss >/dev/null 2>&1; then
    holder=$(ss -tlnpH "( sport = :$p )" 2>/dev/null \
               | grep -v 'docker-proxy' \
               | sed -E 's/.*users:\(\("([^"]+)".*/\1 (on the host, not in Docker)/' \
               | sort -u | tr '\n' ' ' || true)
  fi

  if [ -n "$holder" ]; then
    # In behind-proxy mode the front proxy is SUPPOSED to hold 80/443 — the
    # conflict only matters for the ports this stack is about to publish, which
    # by then are the loopback ones.
    fail "host port $p is already held by: $holder

   A host port can be bound once, so this deploy fails at the last step with
   'address already in use' — or, worse, nginx crash-loops and the site is
   simply down. Put Packvio behind whatever already owns the port.

   In $DEPLOY/.env:

       EDGE_MODE=behind-proxy
       EDGE_HTTP_PUBLISH=127.0.0.1:8080
       EDGE_HTTPS_PUBLISH=127.0.0.1:8443

   Then give that proxy a vhost for $DOMAIN pointing at 127.0.0.1:8080 —
   deploy/nginx/front-proxy/packvio.conf.example is the server block, and goes
   in /etc/nginx/conf.d/ for a host nginx. Reload it, then redeploy."
  fi
  echo "   port $p free"
done

# ---- fetch --------------------------------------------------------------
if [ "$SKIP_BUILD" != "1" ]; then
  say "Fetching $BRANCH"
  if [ -d "$SRC/.git" ]; then
    git -C "$SRC" remote set-url origin "$REPO"
    git -C "$SRC" fetch --depth=1 origin "$BRANCH" --quiet
    git -C "$SRC" reset --hard "origin/$BRANCH" --quiet
    git -C "$SRC" clean -fd --quiet
  else
    rm -rf "$SRC"; mkdir -p "$SRC"
    git clone --depth=1 --branch "$BRANCH" "$REPO" "$SRC" --quiet
  fi
  # Strip the token so it is not left sitting in .git/config on the server.
  git -C "$SRC" remote set-url origin "$(echo "$REPO" | sed -E 's#https://[^@]*@#https://#')"
  echo "   $(git -C "$SRC" log --oneline -1)"
fi

cd "$SRC"

# ---- build --------------------------------------------------------------
Q="--quiet"; [ "$VERBOSE" = "1" ] && Q=""

if [ "$SKIP_BUILD" != "1" ]; then
  # Tag what is running as :previous BEFORE overwriting :latest, so a bad build
  # is one `npm run deploy:rollback` away instead of a rebuild.
  for svc in api web nginx; do
    docker image inspect "$PREFIX-$svc:latest" >/dev/null 2>&1 \
      && docker tag "$PREFIX-$svc:latest" "$PREFIX-$svc:previous" || true
  done

  say "Building api"
  # Context is the REPO ROOT, not apps/api: both workspaces depend on
  # packages/shared and the root lockfile, and a context of apps/api cannot see
  # either. Hence -f.
  docker build $Q $NO_CACHE -f apps/api/Dockerfile -t "$PREFIX-api:latest" . \
    || fail "api build failed"

  say "Building web"
  # NEXT_PUBLIC_* are BUILD ARGS, not runtime environment. Next inlines them
  # into the browser bundle at build time; putting them in .env alone produces a
  # site that renders perfectly with `undefined` in every URL it prints.
  docker build $Q $NO_CACHE -f apps/web/Dockerfile -t "$PREFIX-web:latest" . \
    --build-arg "NEXT_PUBLIC_SITE_URL=https://$DOMAIN" \
    --build-arg "NEXT_PUBLIC_API_URL=https://$DOMAIN/api/v1" \
    --build-arg "NEXT_PUBLIC_MAP_LAT=${NEXT_PUBLIC_MAP_LAT:-24.7136}" \
    --build-arg "NEXT_PUBLIC_MAP_LNG=${NEXT_PUBLIC_MAP_LNG:-46.6753}" \
    --build-arg "NEXT_PUBLIC_MAP_ZOOM=${NEXT_PUBLIC_MAP_ZOOM:-13}" \
    || fail "web build failed"

  say "Building nginx"
  docker build $Q $NO_CACHE -f deploy/nginx/Dockerfile -t "$PREFIX-nginx:latest" deploy/nginx \
    || fail "nginx build failed"
fi

# ---- release ------------------------------------------------------------
say "Syncing deploy directory"
# The compose file and everything it bind-mounts have to be at $DEPLOY, which is
# where .env lives. The checkout stays separate so a deploy can never clobber it.
mkdir -p "$DEPLOY"
cp "$SRC/$COMPOSE_FILE" "$DEPLOY/docker-compose.prod.yml"
mkdir -p "$DEPLOY/deploy/nginx" "$DEPLOY/deploy/scripts"
# Everything nginx bind-mounts or might rebuild from. NOT a --delete sync:
# deploy/nginx/htpasswd is generated on the server and is not in the repo, and
# wiping it would stop nginx from starting at all.
# Stale templates are removed first. `cp -r templates` copies INTO an existing
# directory of that name, so a renamed template would otherwise leave the old
# one behind — and two templates both declaring a server for $PACKVIO_DOMAIN is
# a conflicting-server-name warning and a site served by whichever nginx read
# first. Safe to delete because nothing here is generated on the server; that is
# true only of htpasswd, which is why this is not a --delete sync of the folder.
rm -f "$DEPLOY/deploy/nginx/templates"/*.template
for item in templates snippets front-proxy Dockerfile nginx.conf docker-entrypoint.sh; do
  [ -e "$SRC/deploy/nginx/$item" ] && cp -r "$SRC/deploy/nginx/$item" "$DEPLOY/deploy/nginx/"
done
cp "$SRC"/deploy/scripts/*.sh "$DEPLOY/deploy/scripts/"
chmod +x "$DEPLOY/deploy/scripts/"*.sh

[ -f "$DEPLOY/deploy/nginx/htpasswd" ] || fail "No deploy/nginx/htpasswd on the server.
   Create it once:  htpasswd -Bc $DEPLOY/deploy/nginx/htpasswd packvio
   (Docker would otherwise create a DIRECTORY there and nginx would not start.)"

cd "$DEPLOY"
C="docker compose -f docker-compose.prod.yml"

# ---- migrate ------------------------------------------------------------
# Before `up`, and as its own step. An API that migrates on boot and then
# crashes gets restarted by Docker, migrates again, crashes again — a DDL
# statement retried in a loop against a live database is how a deploy becomes an
# outage. Here a failure stops with an exit code and nothing else has moved.
say "Migrations"
$C up -d postgres
$C --profile tools run --rm migrate || fail "migrations failed — nothing else was touched"

if [ "$RUN_SEED" = "1" ]; then
  say "Seeding the catalog"
  $C --profile tools run --rm seed || fail "seed failed"
fi

# ---- restart ------------------------------------------------------------
say "Restarting"
# No `compose down` — `up -d` recreates only what changed, so the gap is about a
# second rather than the minutes a full stop/start costs, and a broken build
# leaves the previous one serving.
$C up -d --remove-orphans

# ---- health -------------------------------------------------------------
# Checked from INSIDE the network. Going via the public URL would mean dealing
# with Basic Auth and TLS, and would report on DNS as much as on the deploy.
say "Health"
OK=0
for i in $(seq 1 40); do
  n=$($C exec -T nginx curl -fsS -o /dev/null -w '%{http_code}' http://127.0.0.1/healthz 2>/dev/null || echo 000)
  a=$($C exec -T nginx curl -fsS -o /dev/null -w '%{http_code}' http://api:4000/api/v1/health 2>/dev/null || echo 000)
  w=$($C exec -T nginx curl -fsS -o /dev/null -w '%{http_code}' http://web:3000/ar 2>/dev/null || echo 000)
  if [ "$n" = "200" ] && [ "$a" = "200" ] && [ "$w" = "200" ]; then
    echo "   ${G}✓${N} nginx $n · api $a · web $w"
    OK=1; break
  fi
  sleep 3
done

docker image prune -f >/dev/null 2>&1 || true

if [ "$OK" != "1" ]; then
  echo "   ${R}✗${N} not healthy — nginx $n · api $a · web $w"
  echo ""
  $C ps
  echo ""
  # Which containers are actually ON the internal network, and under what
  # aliases. Printed because the alternative is guessing: nginx reporting
  # "host not found in upstream web:3000" while `ps` shows web Up, and Next
  # reporting EAI_AGAIN for `api`, are both the same symptom — a container
  # holding a STALE network endpoint, usually left behind by an earlier `up`
  # that failed partway through creating it. A container missing from this list
  # while present in `ps` above is that case, and the cure is a full
  # `down` + `up -d`: it rebuilds the network from scratch, and the named
  # volumes (pgdata included) are untouched unless you pass -v.
  echo "   on the internal network:"
  docker network inspect "$(docker network ls --format '{{.Name}}' | grep -E '^packvio_internal$' | head -1)" \
    --format '{{range .Containers}}     {{.Name}}{{println}}{{end}}' 2>/dev/null \
    || echo "     (could not inspect packvio_internal)"
  echo ""
  $C logs --tail=40 api web nginx
  fail "deploy finished but the stack is not answering. 'npm run deploy:rollback' restores the previous images."
fi

$C ps --format "   {{.Service}}  {{.Status}}"
echo ""
echo "${G}done${N}  https://$DOMAIN"
echo "__PACKVIO_DEPLOY_OK__"
BODY

chmod +x /tmp/packvio-deploy-body.sh
# setsid detaches it from this SSH session, so the build survives the connection
# dropping. The local side just follows the log.
setsid env \
  REPO="$REPO" BRANCH="$BRANCH" DEPLOY="$DEPLOY" SRC="$SRC" PREFIX="$PREFIX" \
  COMPOSE_FILE="$COMPOSE_FILE" DOMAIN="$DOMAIN" NO_CACHE="$NO_CACHE" \
  VERBOSE="$VERBOSE" SKIP_BUILD="$SKIP_BUILD" RUN_SEED="$RUN_SEED" \
  bash /tmp/packvio-deploy-body.sh > "$LOG" 2>&1 < /dev/null &
echo "$!" > /tmp/packvio-deploy.pid
sleep 1
echo "started, logging to $LOG"
ENDSSH

step "Following the build"
info "Ctrl-C stops watching; the build keeps running. Re-attach with: npm run deploy:watch"
echo ""

# The writer is a DIFFERENT session, so `tail -f --pid` cannot watch it. Follow
# until the body prints one of its two sentinels, then stop. Plain ASCII markers
# rather than matching the coloured output: the colours are only emitted when the
# remote side believes it has a tty, so a pattern built on them works
# interactively and hangs forever in CI.
set +e
ssh -t "${SSH_OPTS[@]}" "$SERVER" \
  "tail -n +1 -f '$LOG' | sed -u -e '/__PACKVIO_DEPLOY_OK__/q' -e '/__PACKVIO_DEPLOY_FAIL__/q' | grep -v '__PACKVIO_DEPLOY_'"
RC=$?
set -e

ELAPSED=$(( $(date +%s) - START ))
echo ""
if rexec "grep -q '__PACKVIO_DEPLOY_OK__' '$LOG'"; then
  echo "${C_GREEN}${C_BOLD}Deployed in ${ELAPSED}s${C_RESET}  https://$DOMAIN"
  echo ""
  exit 0
fi
echo "${C_YELLOW}Stopped watching after ${ELAPSED}s${C_RESET} — check 'npm run deploy:watch' or 'npm run deploy:logs'."
exit $RC
