#!/bin/sh
# Render ONE template from /etc/nginx/templates into /etc/nginx/http.d/packvio.conf,
# substituting only the variables named in NGINX_ENVSUBST_FILTER.
#
# WHICH TEMPLATE depends on PACKVIO_EDGE_MODE:
#
#   standalone    (default) this nginx owns :80 and :443 and terminates TLS
#   behind-proxy            plain HTTP on one loopback port, TLS owned by an
#                           nginx already running on this host
#
# Selection is by FILENAME rather than by rendering everything in the directory,
# because the two templates both define a server for ${PACKVIO_DOMAIN} and
# rendering both would produce a conflicting-server-name warning and a site that
# answers on whichever block nginx read first.
#
# THE SUBSTITUTION FILTER IS THE WHOLE POINT. A bare `envsubst < in > out`
# replaces every $name it can resolve — and nginx configs are full of $host,
# $remote_addr, $upstream_addr and $request_uri. Those are nginx runtime
# variables, not shell ones; envsubst does not know the difference, and any that
# happen to match an environment variable get flattened into a literal at render
# time. The failure is silent: nginx starts, serves traffic, and logs blank
# fields or proxies with an empty Host header.
#
# Passing an explicit list to envsubst restricts it to exactly those names.
set -eu

TEMPLATE_DIR=/etc/nginx/templates
OUTPUT_DIR=/etc/nginx/http.d
FILTER="${NGINX_ENVSUBST_FILTER:-^PACKVIO_}"
MODE="${PACKVIO_EDGE_MODE:-standalone}"

case "$MODE" in
  standalone|behind-proxy) ;;
  *)
    echo "[entrypoint] PACKVIO_EDGE_MODE='$MODE' is not a mode." >&2
    echo "[entrypoint] Expected 'standalone' or 'behind-proxy'. Set EDGE_MODE in the server's .env." >&2
    exit 1
    ;;
esac

TEMPLATE="$TEMPLATE_DIR/packvio.$MODE.conf.template"
if [ ! -f "$TEMPLATE" ]; then
  echo "[entrypoint] No template for mode '$MODE' at $TEMPLATE." >&2
  echo "[entrypoint] The deploy copies deploy/nginx/templates out of the git checkout;" >&2
  echo "[entrypoint] a server stuck on an older copy will not have this file yet." >&2
  ls -1 "$TEMPLATE_DIR" >&2 || true
  exit 1
fi

# The set of variables envsubst is allowed to touch, in the '$A $B' form it
# expects, built from the current environment and the filter.
VARS=$(env | cut -d= -f1 | grep -E "$FILTER" | sed 's/^/$/' | tr '\n' ' ')

# --- the staging gate ------------------------------------------------------
# snippets/ is a read-only bind mount, so the generated fragment goes in its
# own directory, created in the image.
GATE="${PACKVIO_STAGING_GATE:-on}"
case "$GATE" in
  on)
    # -s, not -f: an EMPTY password file is the subtle failure. nginx starts
    # happily, and then every correct password is rejected, which reads as "I
    # forgot the password" rather than "the file is empty". Docker also
    # silently creates a DIRECTORY at a bind-mount source that does not exist,
    # which fails differently and just as confusingly.
    if [ ! -s /etc/nginx/htpasswd ]; then
      echo "[entrypoint] STAGING_GATE=on but /etc/nginx/htpasswd is missing or empty." >&2
      echo "[entrypoint] Create it on the server:" >&2
      echo "[entrypoint]     htpasswd -Bc <deploy dir>/deploy/nginx/htpasswd packvio" >&2
      echo "[entrypoint] Or set STAGING_GATE=off in .env to serve the site publicly." >&2
      exit 1
    fi
    printf 'auth_basic "Packvio staging";\nauth_basic_user_file /etc/nginx/htpasswd;\n' \
      > /etc/nginx/gate/gate.conf
    echo "[entrypoint] staging gate: ON (Basic Auth over the whole site)"
    ;;
  off)
    # An empty file, not a missing one — site.conf includes it unconditionally.
    printf '# STAGING_GATE=off - no Basic Auth. The site is publicly reachable.\n' \
      > /etc/nginx/gate/gate.conf
    echo "[entrypoint] staging gate: OFF - this site is PUBLIC to anyone with the URL"
    echo "[entrypoint]   (X-Robots-Tag noindex and robots.txt Disallow are still set,"
    echo "[entrypoint]    so it stays out of search engines - those are separate.)"
    ;;
  *)
    echo "[entrypoint] PACKVIO_STAGING_GATE='$GATE' is not valid. Use 'on' or 'off'." >&2
    exit 1
    ;;
esac

echo "[entrypoint] edge mode: $MODE"
echo "[entrypoint] rendering $(basename "$TEMPLATE") -> $OUTPUT_DIR/packvio.conf (substituting: ${VARS:-none})"
envsubst "$VARS" < "$TEMPLATE" > "$OUTPUT_DIR/packvio.conf"

# Fail here, with nginx's own error message, rather than after the container has
# been declared up and requests are already arriving.
nginx -t

exec "$@"
