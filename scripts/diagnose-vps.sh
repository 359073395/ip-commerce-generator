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
  sed -E 's/^(OPENAI_API_KEY=).*/\1***redacted***/' "${APP_DIR}/.env" || true
else
  echo "${APP_DIR}/.env not found"
fi

section "Local app health"
run curl -i "http://127.0.0.1:${PORT}/api/health"

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
