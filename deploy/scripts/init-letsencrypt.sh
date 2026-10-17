#!/bin/bash
# First-time certificate issuance. Run ONCE, on the server, from the directory
# holding docker-compose.prod.yml.
#
#   ./deploy/scripts/init-letsencrypt.sh
#
# THE PROBLEM THIS SOLVES: nginx will not start without a certificate file to
# open, and certbot cannot answer an HTTP-01 challenge without nginx running to
# serve it. Neither can go first. The way out is a throwaway self-signed
# certificate that exists only to let nginx boot, after which the real one is
# requested through it and replaces it.
#
# Renewals need none of this — the certbot service in compose handles them, and
# by then nginx has a real certificate to start with.
set -euo pipefail

cd "$(dirname "$0")/../.."

COMPOSE="docker compose -f docker-compose.prod.yml"

if [ ! -f .env ]; then
  echo "No .env beside docker-compose.prod.yml. Copy deploy/env.prod.example to .env first." >&2
  exit 1
fi

# shellcheck disable=SC1091
set -a; . ./.env; set +a

: "${PACKVIO_DOMAIN:?PACKVIO_DOMAIN must be set in .env}"
: "${CERTBOT_EMAIL:?CERTBOT_EMAIL must be set — Let\'s Encrypt sends expiry warnings there}"

STAGING=${CERTBOT_STAGING:-0}
LIVE_PATH="/etc/letsencrypt/live/${PACKVIO_DOMAIN}"

echo "==> Domain:  ${PACKVIO_DOMAIN}"
echo "==> Contact: ${CERTBOT_EMAIL}"
if [ "$STAGING" != "0" ]; then
  echo "==> Using Let's Encrypt STAGING — the certificate will not be trusted by browsers."
fi

# ---------------------------------------------------------------------------
# 1. A placeholder certificate, so nginx can start at all.
# ---------------------------------------------------------------------------
echo "==> Creating a temporary self-signed certificate at ${LIVE_PATH}"
$COMPOSE run --rm --entrypoint "\
  sh -c 'mkdir -p ${LIVE_PATH} && \
    openssl req -x509 -nodes -newkey rsa:2048 -days 1 \
      -keyout ${LIVE_PATH}/privkey.pem \
      -out ${LIVE_PATH}/fullchain.pem \
      -subj \"/CN=${PACKVIO_DOMAIN}\" && \
    cp ${LIVE_PATH}/fullchain.pem ${LIVE_PATH}/chain.pem'" certbot

# ---------------------------------------------------------------------------
# 2. Start nginx, which can now open those files and serve the challenge path.
# ---------------------------------------------------------------------------
echo "==> Starting nginx"
$COMPOSE up -d nginx
sleep 3

# ---------------------------------------------------------------------------
# 3. Delete the placeholder and request the real certificate.
#
# The delete matters: certbot sees an existing certificate for this name and
# treats the run as a RENEWAL, which with a self-signed file in place fails in a
# way whose error message is about the wrong thing entirely.
# ---------------------------------------------------------------------------
echo "==> Removing the placeholder"
$COMPOSE run --rm --entrypoint "rm -rf /etc/letsencrypt/live/${PACKVIO_DOMAIN} /etc/letsencrypt/archive/${PACKVIO_DOMAIN} /etc/letsencrypt/renewal/${PACKVIO_DOMAIN}.conf" certbot

echo "==> Requesting the certificate from Let's Encrypt"
$COMPOSE run --rm --entrypoint "\
  certbot certonly --webroot -w /var/www/certbot \
    --email ${CERTBOT_EMAIL} \
    -d ${PACKVIO_DOMAIN} \
    --rsa-key-size 2048 \
    --agree-tos \
    --no-eff-email \
    $( [ "$STAGING" != "0" ] && echo '--staging' ) \
    --non-interactive" certbot

# ---------------------------------------------------------------------------
# 4. Reload so nginx picks up the real files. A reload, not a restart: it swaps
#    the config without dropping a connection.
# ---------------------------------------------------------------------------
echo "==> Reloading nginx"
$COMPOSE exec nginx nginx -s reload

echo
echo "==> Done. Verify the certificate is real and trusted:"
echo "      echo | openssl s_client -connect ${PACKVIO_DOMAIN}:443 -servername ${PACKVIO_DOMAIN} 2>/dev/null | openssl x509 -noout -issuer -subject -dates"
echo
echo "==> Then verify RENEWAL works, without waiting 60 days for it to matter:"
echo "      docker compose -f docker-compose.prod.yml run --rm --entrypoint 'certbot renew --webroot -w /var/www/certbot --dry-run' certbot"
echo "    A dry run performs the full challenge against Let's Encrypt's staging"
echo "    endpoint and writes nothing. If it passes, the real renewal in 60 days"
echo "    will pass. If it fails, it fails NOW, while there is time to fix it."
