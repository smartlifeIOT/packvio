#!/usr/bin/env bash
# Follow container logs:  npm run deploy:logs [-- api|web|nginx|postgres] [-- -n 200]
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"
load_config

SERVICE=""; LINES="100"
while [ $# -gt 0 ]; do
  case "$1" in
    api|web|nginx|postgres|certbot|backup) SERVICE="$1"; shift ;;
    -n) LINES="$2"; shift 2 ;;
    *) shift ;;
  esac
done

setup_ssh
trap close_ssh EXIT
info "Ctrl-C to stop following"
echo ""
# -t allocates a tty so Ctrl-C reaches docker compose rather than just ssh.
ssh -t "${SSH_OPTS[@]}" "$SERVER" \
  "cd $(rpath "$DEPLOY_DIR") && docker compose -f docker-compose.prod.yml logs -f --tail=$LINES $SERVICE"
