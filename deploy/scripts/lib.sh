#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# Shared helpers for the deploy scripts. Sourced, never run directly.
# ---------------------------------------------------------------------------

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CONTROL_PATH="/tmp/tawal-docgen-ssh-%r@%h:%p"

# --- pretty output -------------------------------------------------------
if [ -t 1 ]; then
  C_RESET=$'\033[0m'; C_DIM=$'\033[2m'; C_BOLD=$'\033[1m'
  C_BLUE=$'\033[34m'; C_GREEN=$'\033[32m'; C_YELLOW=$'\033[33m'; C_RED=$'\033[31m'
else
  C_RESET=""; C_DIM=""; C_BOLD=""; C_BLUE=""; C_GREEN=""; C_YELLOW=""; C_RED=""
fi

step()  { echo "";  echo "${C_BLUE}${C_BOLD}▸ $*${C_RESET}"; }
info()  { echo "  ${C_DIM}$*${C_RESET}"; }
ok()    { echo "  ${C_GREEN}✓${C_RESET} $*"; }
warn()  { echo "  ${C_YELLOW}!${C_RESET} $*"; }
die()   { echo ""; echo "${C_RED}${C_BOLD}✗ $*${C_RESET}" >&2; exit 1; }

# --- config --------------------------------------------------------------
load_config() {
  local file="$ROOT_DIR/deploy.config"
  [ -f "$file" ] || die "deploy.config not found.
    Run:  cp deploy.config.example deploy.config
    then fill in your server details."

  # shellcheck disable=SC1090
  source "$file"

  : "${SERVER_USER:?SERVER_USER missing from deploy.config}"
  : "${SERVER_HOST:?SERVER_HOST missing from deploy.config}"
  SERVER_PORT="${SERVER_PORT:-22}"
  BRANCH="${BRANCH:-master}"
  SRC_DIR="${SRC_DIR:-/var/www/tawal-docgen/src}"
  DEPLOY_DIR="${DEPLOY_DIR:-/var/www/tawal-docgen}"
  HOST_HTTP_PORT="${HOST_HTTP_PORT:-8090}"
  IMAGE_PREFIX="${IMAGE_PREFIX:-tawal-docgen}"
  SERVER="$SERVER_USER@$SERVER_HOST"
}

# --- ssh -----------------------------------------------------------------
#
# Connection multiplexing lets several commands share one authenticated session,
# so a password is typed once. It relies on unix domain sockets, which the SSH
# shipped with Git for Windows cannot do — you get
#   "mux_client_request_session: read from master failed: Connection reset by peer"
# and then a prompt per command. So multiplexing is only enabled where it works,
# and every script is written to need a single session anyway.
#
SSH_OPTS=()
USE_MUX=1

is_windows_shell() {
  case "$(uname -s 2>/dev/null)" in
    MINGW*|MSYS*|CYGWIN*) return 0 ;;
    *) return 1 ;;
  esac
}

setup_ssh() {
  SSH_OPTS=(
    -p "$SERVER_PORT"
    -o ServerAliveInterval=30
    -o ServerAliveCountMax=6
    -o ConnectTimeout=20
    -o StrictHostKeyChecking=accept-new
  )

  if is_windows_shell; then
    USE_MUX=0
  else
    # Clear a socket left behind by a killed run, or ssh refuses to reuse it.
    local sock="${CONTROL_PATH//\%r/$SERVER_USER}"
    sock="${sock//\%h/$SERVER_HOST}"; sock="${sock//\%p/$SERVER_PORT}"
    [ -S "$sock" ] && { ssh -O exit -o "ControlPath=$sock" "$SERVER" 2>/dev/null || rm -f "$sock"; }

    SSH_OPTS+=(
      -o ControlMaster=auto
      -o "ControlPath=$CONTROL_PATH"
      -o ControlPersist=15m
    )
  fi

  if [ -n "${SSH_KEY:-}" ]; then
    [ -f "${SSH_KEY/#\~/$HOME}" ] || die "SSH key not found: $SSH_KEY"
    SSH_OPTS+=(-i "${SSH_KEY/#\~/$HOME}")
  fi

  step "Connecting to $SERVER"
  if [ -n "${SSH_KEY:-}" ]; then
    info "Key auth"
  elif [ "$USE_MUX" = "0" ]; then
    info "Password auth on Windows — this script uses a single session, so you"
    info "type it once. Set SSH_KEY in deploy.config to stop being asked at all."
  else
    info "Password auth — asked once, then the connection is reused."
  fi

  ssh "${SSH_OPTS[@]}" "$SERVER" "echo connected >/dev/null" \
    || die "Could not reach $SERVER on port $SERVER_PORT."
  ok "Connected"
}

close_ssh() {
  [ "$USE_MUX" = "1" ] || return 0
  ssh "${SSH_OPTS[@]}" -O exit "$SERVER" 2>/dev/null || true
}

# Runs one remote bash script, streaming its output. This is the primitive the
# scripts are built on: one ssh invocation means one password prompt, whether or
# not multiplexing is available.
#
#   remote_script VAR=value VAR2=value <<'EOF'
#   ...remote bash...
#   EOF
remote_script() {
  local env_prefix=""
  while [ $# -gt 0 ]; do
    env_prefix+="$1 "
    shift
  done
  ssh "${SSH_OPTS[@]}" "$SERVER" "${env_prefix}bash -se"
}

# Run a command on the server.
rexec() { ssh "${SSH_OPTS[@]}" "$SERVER" "$@"; }

# Run a heredoc script on the server with the shell's error flags set.
rscript() { ssh "${SSH_OPTS[@]}" "$SERVER" "bash -se" ; }

rcopy() { scp -P "$SERVER_PORT" -o "ControlPath=$CONTROL_PATH" "$@"; }

# Renders a configured path for use inside a remote command. A leading ~ is left
# for the remote shell to expand ($HOME differs per user); absolute paths pass
# through untouched, which is what /var/www needs.
rpath() {
  local p="$1"
  # shellcheck disable=SC2088  # the ~ is a literal pattern, expanded remotely
  case "$p" in
    "~"|"~/"*) echo "\$HOME${p#\~}" ;;
    *)         echo "$p" ;;
  esac
}

# --- misc ----------------------------------------------------------------
require_local() {
  command -v "$1" >/dev/null 2>&1 || die "$1 is required locally but was not found."
}

confirm() {
  local prompt="${1:-Continue?}"
  read -r -p "  $prompt [y/N] " reply
  [[ "$reply" =~ ^[Yy]$ ]]
}

# Authenticated clone URL, without leaking the token into logs or `git remote`.
repo_url_with_token() {
  if [ -n "${GIT_TOKEN:-}" ]; then
    echo "${REPO_URL/https:\/\//https://$GIT_TOKEN@}"
  else
    echo "$REPO_URL"
  fi
}
