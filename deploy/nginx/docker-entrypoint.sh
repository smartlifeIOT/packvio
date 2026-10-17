#!/bin/sh
# Render /etc/nginx/templates/*.template into /etc/nginx/http.d, substituting
# ONLY the variables named in NGINX_ENVSUBST_FILTER.
#
# The filter is the whole point. A bare `envsubst < in > out` replaces every
# $name it can resolve — and nginx configs are full of $host, $remote_addr,
# $upstream_addr and $request_uri. Those are nginx runtime variables, not shell
# ones; envsubst does not know the difference, and any that happen to match an
# environment variable get flattened into a literal at render time. The failure
# is silent: nginx starts, serves traffic, and logs blank fields or proxies with
# an empty Host header.
#
# Passing an explicit list to envsubst restricts it to exactly those names.
set -eu

TEMPLATE_DIR=/etc/nginx/templates
OUTPUT_DIR=/etc/nginx/http.d
FILTER="${NGINX_ENVSUBST_FILTER:-^PACKVIO_}"

# The set of variables envsubst is allowed to touch, in the '$A $B' form it
# expects, built from the current environment and the filter.
VARS=$(env | cut -d= -f1 | grep -E "$FILTER" | sed 's/^/$/' | tr '\n' ' ')

for template in "$TEMPLATE_DIR"/*.template; do
  [ -e "$template" ] || continue
  output="$OUTPUT_DIR/$(basename "$template" .template)"
  echo "[entrypoint] rendering $(basename "$template") -> $output (substituting: ${VARS:-none})"
  envsubst "$VARS" < "$template" > "$output"
done

# Fail here, with nginx's own error message, rather than after the container has
# been declared up and requests are already arriving.
nginx -t

exec "$@"
