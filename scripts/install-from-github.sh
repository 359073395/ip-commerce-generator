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
PRIVATE_KNOWLEDGE_DIR="${PRIVATE_KNOWLEDGE_DIR:-/opt/ip-commerce-private}"
APP_BACKUP_DIR=""
PRESERVED_LEGACY_KNOWLEDGE_DIR=""
PRE_UPGRADE_KNOWLEDGE_BACKUP=""

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

read_env_value_from() {
  local env_file="$1"
  local key="$2"
  local value=""
  [[ -f "$env_file" ]] || return
  value="$(grep -E "^${key}=" "$env_file" 2>/dev/null | tail -n 1 | cut -d= -f2- || true)"
  value="${value%\"}"
  value="${value#\"}"
  printf '%s' "$value"
}

stop_existing_service() {
  if systemctl cat "${SERVICE_NAME}.service" >/dev/null 2>&1; then
    log "Stopping existing ${SERVICE_NAME} service for a consistent upgrade backup..."
    systemctl stop "$SERVICE_NAME"
  fi
}

backup_external_private_knowledge() {
  local env_file="${APP_DIR}/.env"
  local database_path="${KNOWLEDGE_DB_PATH:-}"
  local backup_dir="${KNOWLEDGE_BACKUP_DIR:-}"
  local timestamp

  if [[ -z "$database_path" ]]; then
    database_path="$(read_env_value_from "$env_file" KNOWLEDGE_DB_PATH)"
  fi
  database_path="${database_path:-${PRIVATE_KNOWLEDGE_DIR}/knowledge.db}"
  [[ -s "$database_path" ]] || return

  if [[ -z "$backup_dir" ]]; then
    backup_dir="$(read_env_value_from "$env_file" KNOWLEDGE_BACKUP_DIR)"
  fi
  backup_dir="${backup_dir:-$(dirname "$database_path")/backups}"
  timestamp="$(date -u +%Y-%m-%dT%H-%M-%S-000Z)"
  PRE_UPGRADE_KNOWLEDGE_BACKUP="${backup_dir}/private-knowledge-pre-migration-${timestamp}.db"

  log "Creating an external private knowledge backup before replacing program files..."
  mkdir -p "$backup_dir"
  cp "$database_path" "$PRE_UPGRADE_KNOWLEDGE_BACKUP"
  chmod 600 "$PRE_UPGRADE_KNOWLEDGE_BACKUP"
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
  local tarball="${TMP_DIR}/repo.tar.gz"
  local extract_dir="${TMP_DIR}/extract"

  rm -rf "$TMP_DIR"
  mkdir -p "$extract_dir"

  log "Downloading ${GITHUB_REPO}@${GITHUB_REF}..."
  if [[ -n "${GITHUB_TOKEN:-}" ]]; then
    local api_url="https://api.github.com/repos/${GITHUB_REPO}/tarball/${GITHUB_REF}"
    curl -fsSL \
      -H "Authorization: Bearer ${GITHUB_TOKEN}" \
      -H "Accept: application/vnd.github+json" \
      "$api_url" \
      -o "$tarball"
  else
    local public_url="https://codeload.github.com/${GITHUB_REPO}/tar.gz/${GITHUB_REF}"
    curl -fsSL \
      -H "User-Agent: ip-commerce-generator-installer" \
      "$public_url" \
      -o "$tarball"
  fi

  tar -xzf "$tarball" -C "$extract_dir" --strip-components=1
}

install_app_files() {
  local extract_dir="${TMP_DIR}/extract"
  local env_backup=""
  local data_backup=""

  [[ -f "${extract_dir}/package.json" ]] || die "Downloaded repository does not look like this app."

  if [[ -d "$APP_DIR" ]]; then
    APP_BACKUP_DIR="${APP_DIR}.backup.$(date +%Y%m%d%H%M%S)"
    log "Backing up existing app directory to ${APP_BACKUP_DIR}..."
    mv "$APP_DIR" "$APP_BACKUP_DIR"
    if [[ -f "${APP_BACKUP_DIR}/.env" ]]; then
      env_backup="${APP_BACKUP_DIR}/.env"
    fi
    if [[ -d "${APP_BACKUP_DIR}/data" ]]; then
      data_backup="${APP_BACKUP_DIR}/data"
    fi
    if [[ -d "${APP_BACKUP_DIR}/knowledge" ]]; then
      PRESERVED_LEGACY_KNOWLEDGE_DIR="${APP_BACKUP_DIR}/knowledge"
    fi
  fi

  mkdir -p "$(dirname "$APP_DIR")"
  mv "$extract_dir" "$APP_DIR"

  if [[ -n "$env_backup" ]]; then
    log "Restoring existing .env..."
    cp "$env_backup" "${APP_DIR}/.env"
    chmod 600 "${APP_DIR}/.env"
  fi

  if [[ -n "$data_backup" ]]; then
    log "Restoring existing data directory..."
    cp -a "$data_backup" "${APP_DIR}/data"
  fi
}

run_deploy() {
  local legacy_knowledge_dir="${LEGACY_KNOWLEDGE_DIR:-${PRESERVED_LEGACY_KNOWLEDGE_DIR:-${APP_DIR}/knowledge}}"
  log "Running VPS deploy script..."
  chmod +x "${APP_DIR}/scripts/deploy-vps.sh"
  APP_DIR="$APP_DIR" \
    SERVICE_NAME="$SERVICE_NAME" \
    PRIVATE_KNOWLEDGE_DIR="$PRIVATE_KNOWLEDGE_DIR" \
    LEGACY_KNOWLEDGE_DIR="$legacy_knowledge_dir" \
    bash "${APP_DIR}/scripts/deploy-vps.sh"
}

report_failed_upgrade() {
  local status="$?"
  printf '\n[github-install] Upgrade failed before completion.\n' >&2
  if [[ -z "$APP_BACKUP_DIR" ]] && systemctl cat "${SERVICE_NAME}.service" >/dev/null 2>&1; then
    systemctl start "$SERVICE_NAME" >/dev/null 2>&1 || true
  fi
  if [[ -n "$APP_BACKUP_DIR" ]]; then
    printf '[github-install] Previous program backup: %s\n' "$APP_BACKUP_DIR" >&2
  fi
  if [[ -n "$PRE_UPGRADE_KNOWLEDGE_BACKUP" ]]; then
    printf '[github-install] Private knowledge backup: %s\n' "$PRE_UPGRADE_KNOWLEDGE_BACKUP" >&2
  fi
  printf '[github-install] Fix the reported error and rerun the same installer. Existing private knowledge was not overwritten.\n' >&2
  exit "$status"
}

main() {
  trap report_failed_upgrade ERR
  need_root
  install_base_packages
  download_repo
  stop_existing_service
  backup_external_private_knowledge
  install_app_files
  run_deploy

  trap - ERR
  log "Done."
}

if [[ "${BASH_SOURCE[0]}" == "$0" ]]; then
  main "$@"
fi
