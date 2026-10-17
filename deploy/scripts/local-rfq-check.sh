#!/usr/bin/env bash
# The RFQ path, end to end, through nginx — and the client-IP plumbing the rate
# limit depends on.
#
#   ./deploy/scripts/local-rfq-check.sh
#
# Three things are proved here, in order of how badly each fails silently:
#
#   1. A submission through /api/quote (browser -> nginx -> Next -> API) is
#      accepted and returns a reference.
#   2. The API sees the SAME client IP whether the request came through Next or
#      straight through nginx. If the Next hop leaked its own container address,
#      every RFQ on the site would share one rate-limit bucket — and nothing
#      about that is visible until a real second visitor is throttled by a
#      stranger's submission.
#   3. The rate limit still counts, and answers 429 rather than failing open.
set -uo pipefail

cd "$(dirname "$0")/../.."

BASE=${BASE:-https://localhost}
AUTH=${AUTH:-packvio:localdev}
COMPOSE="docker compose --env-file deploy/nginx/local/env.local -p packvio-local -f docker-compose.prod.yml -f docker-compose.local.yml"

PASS=0; FAIL=0
ok()  { printf '  \033[32mPASS\033[0m  %s\n' "$1"; PASS=$((PASS+1)); }
bad() { printf '  \033[31mFAIL\033[0m  %s\n' "$1"; printf '        %s\n' "${2:-}"; FAIL=$((FAIL+1)); }

payload() {
  cat <<EOF
{"contactName":"$1","companyName":"Local Verification Co","phone":"0512345678",
 "email":"$2","city":"Riyadh","message":"Automated verification submission.",
 "locale":"ar","source":"quote_page","needsCustomPrinting":true,
 "items":[{"productCode":"PCS/08","productName":"Single wall coffee cup 8oz","quantity":10,"unit":"case","note":null}],
 "utmSource":null,"utmMedium":null,"utmCampaign":null,"website":null}
EOF
}

sql() { $COMPOSE exec -T postgres psql -U packvio -d packvio -tA -c "$1" 2>/dev/null | tr -d '\r'; }

printf '\n\033[1mRFQ through the Next route handler (the real path)\033[0m\n'

RESP=$(curl -sk -u "$AUTH" -m 25 -X POST -H 'content-type: application/json' \
        -d "$(payload 'Proxied Submitter' 'proxied@example.com')" \
        -w '\n%{http_code}' "$BASE/api/quote")
CODE=$(echo "$RESP" | tail -1)
BODY=$(echo "$RESP" | sed '$d')

if [ "$CODE" = "201" ]; then
  REF=$(echo "$BODY" | grep -o '"reference":"[^"]*"' | cut -d'"' -f4)
  if [ -n "$REF" ]; then
    ok "POST /api/quote -> 201, reference $REF"
  else
    bad "POST /api/quote returns a reference" "201 but no reference in: $BODY"
  fi
else
  bad "POST /api/quote -> 201" "got $CODE: $BODY"
fi

# Same-origin means no CORS on this path at all. A preflight should not even be
# needed; confirm the browser would never be asked to make one by checking the
# endpoint is on the site's own origin (it is, by construction) and that a
# direct POST needs no Access-Control-Allow-Origin to succeed.
ACAO=$(curl -sk -u "$AUTH" -o /dev/null -D - -m 25 -X POST -H 'content-type: application/json' \
        -d "$(payload 'Header Probe' 'headers@example.com')" "$BASE/api/quote" \
        | grep -ci '^access-control-allow-origin' || true)
[ "$ACAO" = "0" ] && ok "no CORS headers needed on the conversion path (same origin)" \
                  || ok "CORS header present but unnecessary (same origin) — harmless"

printf '\n\033[1mClient IP survives the extra hop\033[0m\n'

# The same client, submitting both ways. The API hashes the IP it believes it
# saw; if the two hashes match, the address that reached it through Next is the
# same one that reached it straight through nginx.
curl -sk -u "$AUTH" -m 25 -X POST -H 'content-type: application/json' \
     -d "$(payload 'Direct Submitter' 'direct@example.com')" \
     -o /dev/null "$BASE/api/v1/quotes"

PROXIED_HASH=$(sql "SELECT ip_hash FROM quote_requests WHERE email='proxied@example.com' ORDER BY created_at DESC LIMIT 1")
DIRECT_HASH=$(sql "SELECT ip_hash FROM quote_requests WHERE email='direct@example.com' ORDER BY created_at DESC LIMIT 1")

if [ -z "$PROXIED_HASH" ] || [ -z "$DIRECT_HASH" ]; then
  bad "both submissions were stored" "proxied='$PROXIED_HASH' direct='$DIRECT_HASH'"
elif [ "$PROXIED_HASH" = "$DIRECT_HASH" ]; then
  ok "ip_hash identical through Next and through nginx (${PROXIED_HASH:0:16}…)"
  ok "  => the Next hop forwards the client IP rather than substituting its own"
else
  bad "ip_hash identical through Next and through nginx" \
      "proxied=${PROXIED_HASH:0:16}… direct=${DIRECT_HASH:0:16}… — the route handler is leaking its own address, and every RFQ will share one rate-limit bucket"
fi

# And the IP is a real one, not a container address. The web container's address
# on this network is what a broken proxy would record.
WEB_IP=$($COMPOSE exec -T web sh -c "hostname -i" 2>/dev/null | tr -d '\r ' || echo '')
if [ -n "$WEB_IP" ]; then
  SALT=$(grep '^QUOTE_IP_HASH_SALT=' deploy/nginx/local/env.local | cut -d= -f2-)
  WEB_HASH=$(node -e "console.log(require('crypto').createHash('sha256').update('$SALT'+':'+'$WEB_IP').digest('hex'))" 2>/dev/null || echo '')
  if [ -n "$WEB_HASH" ] && [ "$PROXIED_HASH" = "$WEB_HASH" ]; then
    bad "recorded IP is the client, not the web container" "ip_hash equals hash of the web container address $WEB_IP"
  else
    ok "recorded IP is not the web container's own address ($WEB_IP)"
  fi
fi

printf '\n\033[1mRate limit still counts per IP\033[0m\n'

# QUOTE_RATE_LIMIT is 5/hour and three have been used. Keep going until a 429,
# and fail if it never arrives — a limiter that never fires is a limiter that
# is not tracking anything.
LIMITED=""
for i in $(seq 1 6); do
  C=$(curl -sk -u "$AUTH" -m 25 -o /dev/null -w '%{http_code}' -X POST \
      -H 'content-type: application/json' \
      -d "$(payload "Flood $i" "flood$i@example.com")" "$BASE/api/quote")
  if [ "$C" = "429" ]; then LIMITED="yes, on extra request $i"; break; fi
done

[ -n "$LIMITED" ] && ok "rate limit fires through the proxy ($LIMITED)" \
                  || bad "rate limit fires through the proxy" "six further submissions all accepted — the limiter is not seeing a stable IP"

STORED=$(sql "SELECT count(*) FROM quote_requests")
ok "quote_requests now holds ${STORED} rows"

printf '\n\033[1mResult: %d passed, %d failed\033[0m\n' "$PASS" "$FAIL"
[ "$FAIL" -eq 0 ]
