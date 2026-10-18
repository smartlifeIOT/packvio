# Packvio edge — nginx with Brotli.
#
# Built from Alpine's own nginx packages rather than FROM nginx:alpine, and the
# reason is one package: `nginx-mod-http-brotli`. The official nginx image has no
# Brotli module and no way to add one without compiling it — Brotli has never
# been upstreamed into nginx. Alpine ships it prebuilt and version-matched to the
# nginx in the same repository, which turns a multi-stage source build into one
# apk line that stays correct across upgrades.
#
# What is given up by leaving the official image: its entrypoint scripts. The
# template substitution they provide is reimplemented in docker-entrypoint.sh,
# which is twelve lines and does exactly what this stack needs.
FROM alpine:3.21

RUN apk add --no-cache \
      nginx \
      nginx-mod-http-brotli \
      gettext \
      curl \
 && mkdir -p /etc/nginx/templates /etc/nginx/snippets /etc/nginx/gate /var/www/certbot /var/cache/nginx \
 && rm -f /etc/nginx/http.d/default.conf

COPY nginx.conf /etc/nginx/nginx.conf
COPY docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh

EXPOSE 80 443

STOPSIGNAL SIGQUIT

ENTRYPOINT ["/docker-entrypoint.sh"]
CMD ["nginx", "-g", "daemon off;"]
