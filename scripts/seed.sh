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

# The seed writes to the DATABASE. The site renders from the API with
# `revalidate: 300`, so what it just wrote is invisible for up to five minutes
# and the next visitor after that still gets one stale page. A seed that worked
# perfectly therefore looks like a seed that did nothing, which is worth a line
# rather than leaving it to be rediscovered.
info "The site caches catalog pages for 5 minutes. Make this visible now:"
info "    npm run deploy:purge"
echo ""
info "If the summary above reported 'slug already held by another product in the"
info "database', there are stale duplicates left from an older catalog:"
info "    npm run deploy:prune"
echo ""
