#!/usr/bin/env bash
set -Eeuo pipefail

APP_DIR="${APP_DIR:-/opt/ip-commerce-generator}"
SERVICE_NAME="${SERVICE_NAME:-ip-commerce-generator}"
PORT="${PORT:-8790}"

section() {
  printf '\n==== %s ====\n' "$*"
}

run() {
  printf '+ %s\n' "$*"
  "$@" || true
}

section "Systemd service"
run systemctl --no-pager --full status "$SERVICE_NAME"

section "Recent app logs"
run journalctl -u "$SERVICE_NAME" -n 80 --no-pager

section "Nginx"
if command -v nginx >/dev/null 2>&1; then
  run nginx -t
  run systemctl --no-pager --full status nginx
else
  echo "nginx not installed. This is normal when using direct port mode."
fi

section "Listening ports"
if command -v ss >/dev/null 2>&1; then
  run ss -ltnp
else
  run netstat -ltnp
fi

section "App .env without secrets"
if [[ -f "${APP_DIR}/.env" ]]; then
  sed -E 's/^(OPENAI_API_KEY=).*/\1***redacted***/; s/^(DEEPSEEK_API_KEY=).*/\1***redacted***/; s/^(APP_AUTH_PASSWORD=).*/\1***redacted***/; s/^(INITIAL_ADMIN_PASSWORD=).*/\1***redacted***/' "${APP_DIR}/.env" || true
else
  echo "${APP_DIR}/.env not found"
fi

section "Private knowledge storage"
if [[ -f "${APP_DIR}/.env" ]]; then
  KNOWLEDGE_DB_PATH="$(grep -E '^KNOWLEDGE_DB_PATH=' "${APP_DIR}/.env" | tail -n 1 | cut -d= -f2- | sed 's/^"//; s/"$//')"
  KNOWLEDGE_BACKUP_DIR="$(grep -E '^KNOWLEDGE_BACKUP_DIR=' "${APP_DIR}/.env" | tail -n 1 | cut -d= -f2- | sed 's/^"//; s/"$//')"
fi
KNOWLEDGE_DB_PATH="${KNOWLEDGE_DB_PATH:-/opt/ip-commerce-private/knowledge.db}"
KNOWLEDGE_BACKUP_DIR="${KNOWLEDGE_BACKUP_DIR:-$(dirname "$KNOWLEDGE_DB_PATH")/backups}"
if [[ -f "$KNOWLEDGE_DB_PATH" ]]; then
  run ls -lh "$KNOWLEDGE_DB_PATH"
else
  echo "private knowledge database not found: ${KNOWLEDGE_DB_PATH}"
fi
if [[ -d "$KNOWLEDGE_BACKUP_DIR" ]]; then
  printf 'backup files: '
  find "$KNOWLEDGE_BACKUP_DIR" -maxdepth 1 -type f -name 'private-knowledge-*.db' | wc -l
  run ls -ld "$KNOWLEDGE_BACKUP_DIR"
else
  echo "private knowledge backup directory not found: ${KNOWLEDGE_BACKUP_DIR}"
fi

section "Local app health"
if [[ -f "${APP_DIR}/.env" ]] && grep -Eq '^APP_AUTH_ENABLED="?true"?' "${APP_DIR}/.env"; then
  APP_AUTH_USER="$(grep -E '^APP_AUTH_USER=' "${APP_DIR}/.env" | tail -n 1 | cut -d= -f2- | sed 's/^"//; s/"$//')"
  APP_AUTH_PASSWORD="$(grep -E '^APP_AUTH_PASSWORD=' "${APP_DIR}/.env" | tail -n 1 | cut -d= -f2- | sed 's/^"//; s/"$//')"
  run curl -i -u "${APP_AUTH_USER}:${APP_AUTH_PASSWORD}" "http://127.0.0.1:${PORT}/api/health"
else
  run curl -i "http://127.0.0.1:${PORT}/api/health"
fi

section "Local Nginx health"
if command -v nginx >/dev/null 2>&1; then
  run curl -I "http://127.0.0.1/"
else
  echo "skipped because nginx is not installed"
fi

section "Firewall"
if command -v ufw >/dev/null 2>&1; then
  run ufw status verbose
else
  echo "ufw not installed"
fi

section "Public IP hint"
run curl -fsS --max-time 4 https://api.ipify.org
printf '\n'
