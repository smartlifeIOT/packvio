#!/usr/bin/env bash
# Run the catalog seed on the server:  npm run deploy:seed
#
# Deliberately NOT part of a deploy. It is idempotent, but it is a data
# operation and should be a thing someone chose to do.
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"
load_config
setup_ssh
trap close_ssh EXIT

step "Seeding the catalog on $SERVER"
remote_script "DEPLOY='$(rpath "$DEPLOY_DIR")'" "PREFIX='$IMAGE_PREFIX'" <<'ENDSSH'
set -euo pipefail
# Same image names the deploy builds — see the note in scripts/deploy.sh.
export API_IMAGE="${PREFIX:-packvio}-api:latest"
export WEB_IMAGE="${PREFIX:-packvio}-web:latest"
export NGINX_IMAGE="${PREFIX:-packvio}-nginx:latest"
cd "$DEPLOY"
docker compose -f docker-compose.prod.yml --profile tools run --rm seed
ENDSSH
echo ""
