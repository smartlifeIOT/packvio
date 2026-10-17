#!/usr/bin/env bash
# A shell on the server, already in the deploy directory:  npm run deploy:ssh
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"
load_config
setup_ssh
exec ssh -t "${SSH_OPTS[@]}" "$SERVER" "cd $(rpath "$DEPLOY_DIR") 2>/dev/null; exec \$SHELL -l"
