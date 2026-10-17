#!/usr/bin/env bash
# One-time server preparation:  npm run deploy:setup
#
# Installs docker/git if missing, offers swap on a small box, creates the deploy
# directories, writes the Basic Auth file and seeds .env from the template.
# Safe to re-run — every step checks before acting.
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"
load_config

echo ""
echo "${C_BOLD}Packvio — server setup${C_RESET}"
info "$SERVER · $DOMAIN · $DEPLOY_DIR"

setup_ssh
trap close_ssh EXIT

if [ "$USE_MUX" = "0" ] && [ -z "${SSH_KEY:-}" ]; then
  warn "Windows + password auth: this script pauses for answers, so it cannot run"
  warn "as one session — expect a prompt per step. It only runs once."
fi

step "Base packages"
remote_script <<'ENDSSH'
set -euo pipefail
export DEBIAN_FRONTEND=noninteractive
need=()
for c in git curl openssl; do command -v "$c" >/dev/null || need+=("$c"); done
command -v htpasswd >/dev/null || need+=(apache2-utils)
if [ ${#need[@]} -gt 0 ]; then
  echo "  installing: ${need[*]}"
  apt-get update -qq && apt-get install -y -qq "${need[@]}"
else
  echo "  git, curl, openssl, htpasswd already present"
fi
if ! command -v docker >/dev/null; then
  echo "  installing docker"
  curl -fsSL https://get.docker.com | sh
  systemctl enable --now docker
else
  echo "  docker $(docker --version | awk '{print $3}' | tr -d ,)"
fi
docker compose version >/dev/null 2>&1 || apt-get install -y -qq docker-compose-plugin
ENDSSH
ok "Packages ready"

step "Memory"
MEM=$(rexec "free -m | awk '/^Mem:/{print \$2}'")
SWAP=$(rexec "free -m | awk '/^Swap:/{print \$2}'")
info "${MEM}MB RAM, ${SWAP}MB swap"
if [ $(( MEM + SWAP )) -lt 3000 ]; then
  warn "The Next.js production build wants ~3GB of RAM+swap. Below that the OOM"
  warn "killer takes something — and on a shared box that may be another app."
  if confirm "Add a 4GB swapfile?"; then
    remote_script <<'ENDSSH'
set -euo pipefail
if [ ! -f /swapfile ]; then
  fallocate -l 4G /swapfile || dd if=/dev/zero of=/swapfile bs=1M count=4096
  chmod 600 /swapfile && mkswap /swapfile >/dev/null && swapon /swapfile
  grep -q '^/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
  echo "  swapfile created"
else
  swapon /swapfile 2>/dev/null || true; echo "  swapfile already exists"
fi
ENDSSH
    ok "Swap enabled"
  fi
else
  ok "Enough memory to build"
fi

step "Directories"
remote_script "DEPLOY='$(rpath "$DEPLOY_DIR")'" "SRC='$(rpath "$SRC_DIR")'" <<'ENDSSH'
set -euo pipefail
SUDO=""; [ "$(id -u)" -ne 0 ] && SUDO="sudo"
for dir in "$DEPLOY" "$SRC" "$DEPLOY/deploy/nginx" "$DEPLOY/deploy/scripts"; do
  [ -d "$dir" ] || { $SUDO mkdir -p "$dir"; [ -n "$SUDO" ] && $SUDO chown -R "$(id -un):$(id -gn)" "$dir"; echo "  created $dir"; }
done
[ -w "$DEPLOY" ] || { echo "  NOT WRITABLE: $DEPLOY"; exit 1; }
echo "  ok"
ENDSSH
ok "$DEPLOY_DIR ready"

step "Basic Auth"
EXISTS=$(rexec "[ -f $(rpath "$DEPLOY_DIR")/deploy/nginx/htpasswd ] && echo yes || echo no")
if [ "$EXISTS" = "yes" ]; then
  ok "htpasswd already exists"
else
  info "The staging site sits behind Basic Auth. Pick a password for user 'packvio'."
  read -r -s -p "  password: " PW; echo ""
  HASH=$(rexec "openssl passwd -apr1 '$PW'")
  rexec "printf 'packvio:%s\n' '$HASH' > $(rpath "$DEPLOY_DIR")/deploy/nginx/htpasswd"
  ok "Written. Username 'packvio'."
fi

step "Environment file"
EXISTS=$(rexec "[ -f $(rpath "$DEPLOY_DIR")/.env ] && echo yes || echo no")
if [ "$EXISTS" = "yes" ]; then
  ok ".env already exists — left untouched"
else
  warn "No .env on the server yet."
  info "Copy deploy/env.prod.example there and fill it in:"
  info "  npm run deploy:ssh"
  info "  cp src/deploy/env.prod.example .env && chmod 600 .env && nano .env"
  info ""
  info "Generate the secrets ON the server:"
  info "  openssl rand -base64 32   # SALLA_TOKEN_ENC_KEY, QUOTE_IP_HASH_SALT"
  info "  openssl rand -hex 24      # ADMIN_API_KEY, REVALIDATE_SECRET"
fi

echo ""
echo "${C_GREEN}${C_BOLD}Server prepared${C_RESET}"
echo "  Next:  fill in .env, then  ${C_BOLD}npm run deploy${C_RESET}"
echo "  Then, once:  npm run deploy:ssh  &&  ./deploy/scripts/init-letsencrypt.sh"
echo ""
