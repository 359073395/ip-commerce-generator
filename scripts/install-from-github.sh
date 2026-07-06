#!/usr/bin/env bash
set -Eeuo pipefail

export DEBIAN_FRONTEND="${DEBIAN_FRONTEND:-noninteractive}"
export NEEDRESTART_MODE="${NEEDRESTART_MODE:-a}"
export APT_LISTCHANGES_FRONTEND="${APT_LISTCHANGES_FRONTEND:-none}"

DEFAULT_GITHUB_REPO="359073395/ip-commerce-generator"
GITHUB_REPO="${GITHUB_REPO:-$DEFAULT_GITHUB_REPO}"
GITHUB_REF="${GITHUB_REF:-main}"
APP_DIR="${APP_DIR:-/opt/ip-commerce-generator}"
TMP_DIR="${TMP_DIR:-/tmp/ip-commerce-generator-install}"
SERVICE_NAME="${SERVICE_NAME:-ip-commerce-generator}"

log() {
  printf '\n[github-install] %s\n' "$*"
}

die() {
  echo "ERROR: $*" >&2
  exit 1
}

need_root() {
  if [[ "${EUID}" -ne 0 ]]; then
    die "Please run as root: sudo bash install-from-github.sh"
  fi
}

install_base_packages() {
  if ! command -v apt-get >/dev/null 2>&1; then
    die "Only Debian/Ubuntu apt-get servers are supported by this installer."
  fi

  log "Installing base packages..."
  apt-get update
  apt-get install -y ca-certificates curl tar gzip
}

download_repo() {
  local url="https://api.github.com/repos/${GITHUB_REPO}/tarball/${GITHUB_REF}"
  local tarball="${TMP_DIR}/repo.tar.gz"
  local extract_dir="${TMP_DIR}/extract"

  rm -rf "$TMP_DIR"
  mkdir -p "$extract_dir"

  log "Downloading ${GITHUB_REPO}@${GITHUB_REF}..."
  if [[ -n "${GITHUB_TOKEN:-}" ]]; then
    curl -fsSL \
      -H "Authorization: Bearer ${GITHUB_TOKEN}" \
      -H "Accept: application/vnd.github+json" \
      "$url" \
      -o "$tarball"
  else
    curl -fsSL \
      -H "Accept: application/vnd.github+json" \
      "$url" \
      -o "$tarball"
  fi

  tar -xzf "$tarball" -C "$extract_dir" --strip-components=1
}

install_app_files() {
  local extract_dir="${TMP_DIR}/extract"
  local env_backup=""
  local backup_dir=""

  [[ -f "${extract_dir}/package.json" ]] || die "Downloaded repository does not look like this app."

  if [[ -d "$APP_DIR" ]]; then
    backup_dir="${APP_DIR}.backup.$(date +%Y%m%d%H%M%S)"
    log "Backing up existing app directory to ${backup_dir}..."
    mv "$APP_DIR" "$backup_dir"
    if [[ -f "${backup_dir}/.env" ]]; then
      env_backup="${backup_dir}/.env"
    fi
  fi

  mkdir -p "$(dirname "$APP_DIR")"
  mv "$extract_dir" "$APP_DIR"

  if [[ -n "$env_backup" ]]; then
    log "Restoring existing .env..."
    cp "$env_backup" "${APP_DIR}/.env"
    chmod 600 "${APP_DIR}/.env"
  fi
}

run_deploy() {
  log "Running VPS deploy script..."
  chmod +x "${APP_DIR}/scripts/deploy-vps.sh"
  APP_DIR="$APP_DIR" SERVICE_NAME="$SERVICE_NAME" bash "${APP_DIR}/scripts/deploy-vps.sh"
}

main() {
  need_root
  install_base_packages
  download_repo
  install_app_files
  run_deploy

  log "Done."
}

main "$@"
