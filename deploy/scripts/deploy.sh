#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# Deploy:  npm run deploy
#
# One SSH session. The server clones the latest commit, builds both images and
# restarts. Build output is quiet by default — pass --verbose when something
# breaks and you need to see why.
#
#   npm run deploy                 normal
#   npm run deploy -- --verbose    full build output
#   npm run deploy -- --no-cache   ignore the layer cache
#   npm run deploy -- --branch dev another branch
# ---------------------------------------------------------------------------
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
[ -f "$ROOT_DIR/deploy.config" ] || {
  echo "deploy.config not found. Run: cp deploy.config.example deploy.config"
  exit 1
}
# shellcheck disable=SC1091
source "$ROOT_DIR/deploy.config"

BRANCH="${BRANCH:-master}"
DEPLOY_DIR="${DEPLOY_DIR:-/var/www/tawal-docgen}"
SRC_DIR="${SRC_DIR:-/tmp/tawal-docgen-build}"
HOST_HTTP_PORT="${HOST_HTTP_PORT:-8095}"
SERVER="$SERVER_USER@$SERVER_HOST"

QUIET="--quiet"
NO_CACHE=""
while [ $# -gt 0 ]; do
  case "$1" in
    --verbose)   QUIET=""; shift ;;
    --no-cache)  NO_CACHE="--no-cache"; shift ;;
    --branch)    BRANCH="$2"; shift 2 ;;
    *) echo "Unknown option: $1"; exit 1 ;;
  esac
done

SSH_OPTS=(
  -p "${SERVER_PORT:-22}"
  -o ServerAliveInterval=30
  -o ServerAliveCountMax=20
  -o TCPKeepAlive=yes
  -o ConnectTimeout=30
  -o StrictHostKeyChecking=no
)
[ -n "${SSH_KEY:-}" ] && SSH_OPTS+=(-i "${SSH_KEY/#\~/$HOME}")

REPO="$REPO_URL"
[ -n "${GIT_TOKEN:-}" ] && REPO="${REPO_URL/https:\/\//https://$GIT_TOKEN@}"

echo ""
echo "🚀 Deploying Tawal DocGen"
echo "   $SERVER · $BRANCH · port $HOST_HTTP_PORT"
echo ""

START=$(date +%s)

# Unquoted heredoc on purpose: the local config values ($SRC_DIR, $BRANCH, the
# repo URL) are substituted here, while anything the remote shell must evaluate
# is escaped with \$.
# shellcheck disable=SC2087
ssh "${SSH_OPTS[@]}" "$SERVER" bash <<REMOTE
set -e
export DOCKER_BUILDKIT=1
export COMPOSE_DOCKER_CLI_BUILD=1

echo "📥 Fetching latest code..."
rm -rf "$SRC_DIR"
git clone --depth=1 --branch "$BRANCH" "$REPO" "$SRC_DIR" --quiet
cd "$SRC_DIR"
echo "   \$(git log --oneline -1)"

# Tag the running images so a bad build can be rolled back in seconds.
for svc in backend frontend; do
  docker image inspect "tawal-docgen-\$svc:latest" >/dev/null 2>&1 \
    && docker tag "tawal-docgen-\$svc:latest" "tawal-docgen-\$svc:previous" || true
done

echo "🔨 Building backend..."
docker build $QUIET $NO_CACHE -t tawal-docgen-backend:latest ./backend

echo "🔨 Building frontend..."
docker build $QUIET $NO_CACHE -t tawal-docgen-frontend:latest ./frontend

echo "🔄 Restarting..."
cp "$SRC_DIR/docker-compose.prod.yml" "$DEPLOY_DIR/docker-compose.yml"
cd "$DEPLOY_DIR"

# No 'compose down' — up -d recreates only what changed, so the gap is about a
# second instead of the minutes a full stop/start costs.
docker compose up -d --remove-orphans

echo "⏳ Health check..."
for i in \$(seq 1 30); do
  if curl -sf "http://localhost:$HOST_HTTP_PORT/api/health" >/dev/null 2>&1; then
    echo "   ✅ \$(curl -s http://localhost:$HOST_HTTP_PORT/api/health)"
    OK=1; break
  fi
  sleep 3
done

rm -rf "$SRC_DIR"
docker image prune -f >/dev/null 2>&1 || true

if [ -z "\${OK:-}" ]; then
  echo "   ❌ API not responding. Recent logs:"
  docker compose logs --tail=40 backend
  exit 1
fi

docker compose ps --format "   {{.Service}}  {{.Status}}"
REMOTE

echo ""
echo "🎉 Done in $(( $(date +%s) - START ))s"
[ -n "${DOMAIN:-}" ] && echo "   https://$DOMAIN"
echo ""
