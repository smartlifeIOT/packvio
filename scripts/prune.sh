#!/usr/bin/env bash
# Reconcile the catalog table against docs/catalog.json:
#
#   npm run deploy:prune            report only, writes nothing
#   npm run deploy:prune -- --apply soft-delete the orphans, reclaim their slugs
#
# The seed never deletes, by design. That leaves an orphan row behind whenever a
# product's CODE changes between two generations of catalog.json — and the
# orphan goes on holding the clean slug, so the new product lands on
# `carry-bag-19-cm-cb19` while the stale one keeps `carry-bag-19-cm` and sorts
# first. Two of every affected product on the site, with the old one in front.
# This is the tool that clears that up. See apps/api/src/database/seeds/prune.ts
# for exactly which slugs it will and will not touch.
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"
load_config

APPLY=0
while [ $# -gt 0 ]; do
  case "$1" in
    --apply) APPLY=1; shift ;;
    *) die "Unknown option: $1" ;;
  esac
done

setup_ssh
trap close_ssh EXIT

if [ "$APPLY" = "1" ]; then
  step "Pruning the catalog on $SERVER"
  warn "This WRITES. Products missing from catalog.json will be soft-deleted."
  info "Run it without --apply first if you have not seen the plan."
  echo ""
  if [ -t 0 ]; then
    confirm "Go ahead?" || { echo ""; info "Nothing changed."; exit 0; }
  fi
else
  step "Catalog prune — DRY RUN (nothing will be written)"
fi

remote_script \
  "DEPLOY='$(rpath "$DEPLOY_DIR")'" \
  "PREFIX='$IMAGE_PREFIX'" \
  "APPLY='$APPLY'" \
  <<'ENDSSH'
set -euo pipefail
# Same image names the deploy builds — see the note in scripts/deploy.sh.
export API_IMAGE="${PREFIX:-packvio}-api:latest"
export WEB_IMAGE="${PREFIX:-packvio}-web:latest"
export NGINX_IMAGE="${PREFIX:-packvio}-nginx:latest"
cd "$DEPLOY"

ARGS=""
[ "$APPLY" = "1" ] && ARGS="--apply"

# shellcheck disable=SC2086 -- ARGS is one optional flag, not a path
docker compose -f docker-compose.prod.yml --profile tools run --rm prune $ARGS
ENDSSH

echo ""
if [ "$APPLY" = "1" ]; then
  ok "Done. Purge the page cache so the change is visible now:  npm run deploy:purge"
else
  info "To apply it:  npm run deploy:prune -- --apply"
fi
