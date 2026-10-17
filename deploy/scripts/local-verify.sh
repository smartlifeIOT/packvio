#!/usr/bin/env bash
# Bring the production topology up on a laptop and prove it works.
#
#   ./deploy/scripts/local-verify.sh
#
# Everything this touches is under deploy/nginx/local and a set of Docker
# volumes prefixed `packvio-local`. It does not read or write the real .env, and
# it never talks to Let's Encrypt.
set -euo pipefail

cd "$(dirname "$0")/../.."

LOCAL_DIR=deploy/nginx/local
CERT_DIR="$LOCAL_DIR/letsencrypt/live/localhost"
ENV_FILE="$LOCAL_DIR/env.local"
COMPOSE="docker compose --env-file $ENV_FILE -p packvio-local -f docker-compose.prod.yml -f docker-compose.local.yml"

mkdir -p "$CERT_DIR" "$LOCAL_DIR/certbot-www"

# ---------------------------------------------------------------------------
# A self-signed certificate for localhost, valid for a year.
#
# Placed at the same path Let's Encrypt would use, so the nginx template needs
# no local variant — the config being tested is the config being deployed.
# ---------------------------------------------------------------------------
if [ ! -f "$CERT_DIR/fullchain.pem" ]; then
  echo "==> Generating a self-signed certificate for localhost"
  # MSYS_NO_PATHCONV stops Git Bash on Windows from "helpfully" rewriting the
  # /CN=... subject into a Windows path — openssl then rejects
  # 'C:/Program Files/Git/CN=localhost' as a malformed subject name. Ignored
  # everywhere else, so the script stays the same on the server.
  MSYS_NO_PATHCONV=1 openssl req -x509 -nodes -newkey rsa:2048 -days 365 \
    -keyout "$CERT_DIR/privkey.pem" \
    -out "$CERT_DIR/fullchain.pem" \
    -subj "/CN=localhost/O=Packvio local verification" \
    -addext "subjectAltName=DNS:localhost,IP:127.0.0.1" 2>/dev/null
  cp "$CERT_DIR/fullchain.pem" "$CERT_DIR/chain.pem"
fi

# ---------------------------------------------------------------------------
# Basic Auth file. Same mechanism as staging; the password is not a secret here.
#
# openssl rather than htpasswd: htpasswd ships with Apache and is not installed
# on most machines, while openssl is everywhere. The apr1 format it produces is
# what nginx expects.
# ---------------------------------------------------------------------------
if [ ! -f deploy/nginx/htpasswd ]; then
  echo "==> Generating deploy/nginx/htpasswd (packvio / localdev)"
  printf 'packvio:%s\n' "$(openssl passwd -apr1 localdev)" > deploy/nginx/htpasswd
fi

# ---------------------------------------------------------------------------
# Local environment. Deliberately NOT the repo-root .env — this stack should not
# be able to reach anything real.
# ---------------------------------------------------------------------------
if [ ! -f "$ENV_FILE" ]; then
  echo "==> Writing $ENV_FILE"
  cat > "$ENV_FILE" <<'EOF'
PACKVIO_DOMAIN=localhost
SITE_URL=https://localhost
API_IMAGE=packvio-api:local
WEB_IMAGE=packvio-web:local
NGINX_IMAGE=packvio-nginx:local
POSTGRES_USER=packvio
POSTGRES_PASSWORD=localdev
POSTGRES_DB=packvio
# Throwaway values with the right SHAPE, so the API's Joi validation is
# genuinely exercised: the key must be base64 decoding to 32 bytes, and the salt
# must be 32+ characters. A weaker placeholder would fail at boot, which is the
# validation working.
SALLA_TOKEN_ENC_KEY=bG9jYWx2ZXJpZnlrZXlub3RhcmVhbHNlY3JldDEyMzQ=
QUOTE_IP_HASH_SALT=local-verification-salt-not-a-real-secret-000
SALLA_CLIENT_ID=
SALLA_CLIENT_SECRET=
SALLA_WEBHOOK_SECRET=local-webhook-secret
SALLA_API_BASE=https://api.salla.dev/admin/v2
SALLA_OAUTH_TOKEN_URL=https://accounts.salla.sa/oauth2/token
SALLA_STORE_LOCALE=ar
ADMIN_API_KEY=
REVALIDATE_SECRET=local-revalidate-secret
QUOTE_RATE_LIMIT=5
BACKUP_RETENTION_DAYS=7
BACKUP_HOUR_UTC=3
CERTBOT_EMAIL=nobody@example.com
CERTBOT_STAGING=1
EOF
fi

echo "==> Building and starting"
$COMPOSE up -d --build

echo "==> Waiting for Postgres"
for _ in $(seq 1 60); do
  if $COMPOSE exec -T postgres pg_isready -U packvio -d packvio >/dev/null 2>&1; then break; fi
  sleep 2
done

echo "==> Running migrations (the same one-shot the deploy uses)"
$COMPOSE --profile tools run --rm migrate

echo "==> Seeding the catalog"
$COMPOSE --profile tools run --rm seed

echo "==> Restarting the API so it sees the migrated schema"
$COMPOSE restart api

echo
echo "==> Up. Verify with:"
echo "      ./deploy/scripts/local-checks.sh"
echo "      $COMPOSE ps"
echo "      $COMPOSE logs -f nginx"
echo
echo "    Site:  https://localhost/ar   (self-signed: curl -k, or accept the warning)"
echo "    Login: packvio / localdev"
echo
echo "==> Tear down with:"
echo "      $COMPOSE down -v"
