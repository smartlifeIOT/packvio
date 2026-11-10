#!/usr/bin/env bash
# Verification battery for the local stack. Every check here is a property the
# staging deploy has to have, phrased so a failure names what broke.
#
#   ./deploy/scripts/local-checks.sh
#
# `curl -k` throughout: the local certificate is self-signed by design. That is
# the ONE thing about this run that is not what staging does.
set -uo pipefail

cd "$(dirname "$0")/../.."

BASE=${BASE:-https://localhost}
AUTH=${AUTH:-packvio:localdev}
COMPOSE="docker compose --env-file deploy/nginx/local/env.local -p packvio-local -f docker-compose.prod.yml -f docker-compose.local.yml"

PASS=0
FAIL=0

ok()   { printf '  \033[32mPASS\033[0m  %s\n' "$1"; PASS=$((PASS+1)); }
bad()  { printf '  \033[31mFAIL\033[0m  %s\n' "$1"; printf '        %s\n' "${2:-}"; FAIL=$((FAIL+1)); }
head_() { printf '\n\033[1m%s\033[0m\n' "$1"; }

# --------------------------------------------------------------------------
head_ "Public surface"

PORTS=$($COMPOSE ps --format '{{.Service}} {{.Ports}}' 2>/dev/null)
if echo "$PORTS" | grep -qE '^(api|web|postgres) .*0\.0\.0\.0'; then
  bad "only nginx publishes ports" "$(echo "$PORTS" | grep -E '^(api|web|postgres)')"
else
  ok "only nginx publishes ports to the host"
fi

if curl -s -m 3 http://127.0.0.1:4000/api/v1/health >/dev/null 2>&1; then
  bad "API is not reachable from the host" "http://127.0.0.1:4000 answered"
else
  ok "API is not reachable from the host"
fi

if curl -s -m 3 http://127.0.0.1:5432 >/dev/null 2>&1; then
  bad "Postgres is not reachable from the host" "port 5432 answered"
else
  ok "Postgres is not reachable from the host"
fi

# --------------------------------------------------------------------------
head_ "TLS and redirects"

REDIR=$(curl -s -o /dev/null -w '%{http_code} %{redirect_url}' -m 10 http://localhost/ar)
case "$REDIR" in
  301*https://localhost/ar) ok "HTTP redirects to HTTPS (301)" ;;
  *) bad "HTTP redirects to HTTPS" "got: $REDIR" ;;
esac

HSTS=$(curl -sk -o /dev/null -D - -u "$AUTH" "$BASE/ar" | grep -i '^strict-transport-security' | tr -d '\r')
[ -n "$HSTS" ] && ok "HSTS present: ${HSTS#*: }" || bad "HSTS header present" "no Strict-Transport-Security"

ACME=$(curl -s -o /dev/null -w '%{http_code}' -m 10 http://localhost/.well-known/acme-challenge/probe)
[ "$ACME" = "404" ] && ok "ACME challenge path is served on :80 without auth (404 for a missing token, not 401)" \
                    || bad "ACME challenge path open on :80" "expected 404, got $ACME"

# --------------------------------------------------------------------------
head_ "HTTP Basic Auth"

for path in /ar /en /api/v1/health /api/v1/catalog/home; do
  CODE=$(curl -sk -o /dev/null -w '%{http_code}' -m 10 "$BASE$path")
  [ "$CODE" = "401" ] && ok "$path requires auth (401)" || bad "$path requires auth" "got $CODE"
done

CODE=$(curl -sk -o /dev/null -w '%{http_code}' -m 15 -u "$AUTH" "$BASE/ar")
[ "$CODE" = "200" ] && ok "/ar serves 200 with credentials" || bad "/ar with credentials" "got $CODE"

# ---------------------------------------------------------------------------
# The former Salla webhook path is no longer an exception: with the integration
# removed, it must sit behind the gate like everything else.
# ---------------------------------------------------------------------------
challenged() {
  curl -sk -o /dev/null -D - -m 10 "$@" | grep -qi '^www-authenticate:'
}

for probe in /api/v1/webhooks/salla /api/v1/quotes; do
  if challenged "$BASE$probe"; then
    ok "$probe is behind auth"
  else
    bad "$probe should require auth" "no WWW-Authenticate — it is open"
  fi
done

# --------------------------------------------------------------------------
head_ "Staging is not indexable"

ROBOTS=$(curl -sk -m 10 "$BASE/robots.txt")
echo "$ROBOTS" | grep -q 'Disallow: /' && ok "robots.txt disallows everything, unauthenticated" \
                                       || bad "robots.txt disallows everything" "got: $ROBOTS"

XR=$(curl -sk -o /dev/null -D - -u "$AUTH" -m 10 "$BASE/ar" | grep -i '^x-robots-tag' | tr -d '\r')
echo "$XR" | grep -qi noindex && ok "X-Robots-Tag: noindex on HTML" || bad "X-Robots-Tag on HTML" "got: $XR"

# --------------------------------------------------------------------------
head_ "Security headers"

check_headers() {
  local label=$1 url=$2 hdrs
  hdrs=$(curl -sk -o /dev/null -D - -u "$AUTH" -m 15 "$url" | tr -d '\r')
  local missing=""
  for h in x-content-type-options x-frame-options referrer-policy content-security-policy-report-only; do
    echo "$hdrs" | grep -qi "^$h:" || missing="$missing $h"
  done
  [ -z "$missing" ] && ok "$label carries the full header set" || bad "$label header set" "missing:$missing"
}

check_headers "HTML" "$BASE/ar"
# The add_header inheritance trap: this location sets Cache-Control of its own,
# so it must re-include the snippets or it silently loses every security header.
STATIC=$(curl -sk -u "$AUTH" -m 15 "$BASE/ar" | grep -o '/_next/static/[^"]*\.js' | head -1)
[ -n "$STATIC" ] && check_headers "/_next/static asset" "$BASE$STATIC" \
                 || bad "found a static asset to test" "no /_next/static URL in the HTML"

# --------------------------------------------------------------------------
head_ "Caching"

if [ -n "$STATIC" ]; then
  CC=$(curl -sk -o /dev/null -D - -u "$AUTH" -m 15 "$BASE$STATIC" | grep -i '^cache-control' | tr -d '\r')
  echo "$CC" | grep -q 'immutable' && echo "$CC" | grep -q '31536000' \
    && ok "static assets: ${CC#*: }" || bad "static assets immutable, 1 year" "got: $CC"
fi

HCC=$(curl -sk -o /dev/null -D - -u "$AUTH" -m 15 "$BASE/ar" | grep -i '^cache-control' | tr -d '\r')
echo "$HCC" | grep -q 'must-revalidate' && ok "HTML: ${HCC#*: }" || bad "HTML short cache" "got: $HCC"

# --------------------------------------------------------------------------
head_ "Compression"

GZ=$(curl -sk -o /dev/null -D - -u "$AUTH" -H 'Accept-Encoding: gzip' -m 15 "$BASE/ar" | grep -i '^content-encoding' | tr -d '\r')
echo "$GZ" | grep -qi gzip && ok "gzip negotiated" || bad "gzip negotiated" "got: ${GZ:-none}"

BR=$(curl -sk -o /dev/null -D - -u "$AUTH" -H 'Accept-Encoding: br' -m 15 "$BASE/ar" | grep -i '^content-encoding' | tr -d '\r')
echo "$BR" | grep -qi br && ok "brotli negotiated" || bad "brotli negotiated" "got: ${BR:-none}"

# --------------------------------------------------------------------------
head_ "Application"

HEALTH=$(curl -sk -u "$AUTH" -m 15 "$BASE/api/v1/health")
echo "$HEALTH" | grep -q '"status"' && ok "API health through nginx: $(echo "$HEALTH" | head -c 120)" \
                                    || bad "API health through nginx" "got: $HEALTH"

for loc in ar en; do
  # `grep -c`, not `grep -q`, and the reason is this script's `set -o pipefail`.
  # `grep -q` exits the moment it matches, curl's write then fails with SIGPIPE
  # (141), and pipefail reports the pipeline as that — so a SUCCESSFUL match was
  # being read as a failure. `-c` consumes the whole stream, so curl finishes
  # cleanly and only the count comes back.
  SIZE=$(curl -sk -u "$AUTH" -m 25 -o /dev/null -w '%{size_download}' "$BASE/$loc")
  H1=$(curl -sk -u "$AUTH" -m 25 "$BASE/$loc" | grep -c '<h1')
  if [ "$H1" -gt 0 ]; then
    ok "/$loc renders (h1 present, ${SIZE} bytes)"
  else
    bad "/$loc renders" "no <h1> in the response"
  fi
done

# Live catalog data, not a placeholder — proves the web container reached the
# API over the internal network using API_INTERNAL_URL.
COUNT=$(curl -sk -u "$AUTH" -m 20 "$BASE/en" | grep -o '213' | head -1)
[ "$COUNT" = "213" ] && ok "home page shows live catalog data (213 products)" \
                     || bad "home page shows live catalog data" "product count not found in the HTML"

printf '\n\033[1mResult: %d passed, %d failed\033[0m\n' "$PASS" "$FAIL"
[ "$FAIL" -eq 0 ]
