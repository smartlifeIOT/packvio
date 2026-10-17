#!/usr/bin/env bash
# Re-attach to a build still running on the server:  npm run deploy:watch
#
# Deploys run detached, so closing the terminal does not stop them. This finds
# the newest deploy log and follows it.
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"
load_config
setup_ssh
trap close_ssh EXIT

LOG=$(remote_script <<'ENDSSH'
ls -1t /tmp/packvio-deploy-*.log 2>/dev/null | head -1
ENDSSH
)
LOG=$(echo "$LOG" | tr -d '[:space:]')
[ -n "$LOG" ] || die "No deploy log on the server. Nothing has been deployed from here yet."

info "following $LOG  (Ctrl-C to stop; the build keeps running)"
echo ""
ssh -t "${SSH_OPTS[@]}" "$SERVER" "tail -n 200 -f '$LOG'"
