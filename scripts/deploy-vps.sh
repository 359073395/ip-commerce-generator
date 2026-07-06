#!/usr/bin/env bash
set -Eeuo pipefail

APP_NAME="${APP_NAME:-ip-commerce-generator}"
SERVICE_NAME="${SERVICE_NAME:-ip-commerce-generator}"
APP_DIR="${APP_DIR:-$(pwd)}"
APP_GIT_URL="${APP_GIT_URL:-}"
APP_GIT_REF="${APP_GIT_REF:-}"
PORT="${PORT:-8790}"
NODE_MAJOR="${NODE_MAJOR:-20}"

DEFAULT_BASE_URL="${OPENAI_BASE_URL:-https://api.example.com/v1}"
DEFAULT_MODEL="${OPENAI_MODEL:-gpt-5.5}"
DEFAULT_FALLBACK_MODELS="${OPENAI_FALLBACK_MODELS:-gpt-5.4,gemini-3-flash,gpt-5.4-mini}"
DEFAULT_TIMEOUT_MS="${OPENAI_TIMEOUT_MS:-45000}"
DEFAULT_MAX_TOKENS="${OPENAI_MAX_TOKENS:-1200}"
DEFAULT_TEMPERATURE="${OPENAI_TEMPERATURE:-0.4}"
DEFAULT_REASONING_EFFORT="${OPENAI_REASONING_EFFORT:-low}"
DEFAULT_KNOWLEDGE_BUDGET_CHARS="${KNOWLEDGE_BUDGET_CHARS:-1200}"
DEFAULT_ENABLE_NGINX_BASIC_AUTH="${ENABLE_NGINX_BASIC_AUTH:-yes}"
DEFAULT_BASIC_AUTH_USER="${BASIC_AUTH_USER:-admin}"

log() {
  printf '\n[%s] %s\n' "$APP_NAME" "$*"
}

die() {
  echo "ERROR: $*" >&2
  exit 1
}

need_root_for_system() {
  if [[ "${EUID}" -ne 0 ]]; then
    die "This script needs root for Node.js/systemd/Nginx setup. Please run: sudo bash scripts/deploy-vps.sh"
  fi
}

prompt_value() {
  local var_name="$1"
  local label="$2"
  local default_value="$3"
  local value="${!var_name:-}"

  if [[ -n "$value" ]]; then
    printf -v "$var_name" '%s' "$value"
    return
  fi

  read -r -p "${label} [${default_value}]: " value
  printf -v "$var_name" '%s' "${value:-$default_value}"
}

prompt_secret() {
  local var_name="$1"
  local label="$2"
  local value="${!var_name:-}"

  if [[ -z "$value" ]]; then
    read -r -s -p "${label}: " value
    printf '\n'
  fi

  [[ -n "$value" ]] || die "${label} cannot be empty."
  printf -v "$var_name" '%s' "$value"
}

prompt_yes_no() {
  local var_name="$1"
  local label="$2"
  local default_value="$3"
  local value="${!var_name:-}"

  if [[ -z "$value" ]]; then
    read -r -p "${label} [${default_value}]: " value
    value="${value:-$default_value}"
  fi

  case "${value,,}" in
    y|yes|true|1) printf -v "$var_name" '%s' "yes" ;;
    n|no|false|0) printf -v "$var_name" '%s' "no" ;;
    *) die "${label} must be yes or no." ;;
  esac
}

quote_env_value() {
  local value="$1"
  value="${value//\\/\\\\}"
  value="${value//\"/\\\"}"
  printf '"%s"' "$value"
}

install_system_packages() {
  need_root_for_system
  if ! command -v apt-get >/dev/null 2>&1; then
    die "Only Debian/Ubuntu apt-get servers are supported by this one-click script."
  fi

  log "Installing base packages..."
  apt-get update
  apt-get install -y ca-certificates curl gnupg git openssl
}

install_node_if_needed() {
  if command -v node >/dev/null 2>&1; then
    local major
    major="$(node -p "process.versions.node.split('.')[0]")"
    if [[ "${major}" -ge "${NODE_MAJOR}" ]]; then
      log "Node.js $(node -v) is ready."
      return
    fi
  fi

  need_root_for_system
  log "Installing Node.js ${NODE_MAJOR}..."
  mkdir -p /etc/apt/keyrings
  curl -fsSL "https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key" | gpg --dearmor -o /etc/apt/keyrings/nodesource.gpg
  echo "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_${NODE_MAJOR}.x nodistro main" > /etc/apt/sources.list.d/nodesource.list
  apt-get update
  apt-get install -y nodejs
}

prepare_app_dir() {
  if [[ -f "${APP_DIR}/package.json" ]]; then
    log "Using existing project directory: ${APP_DIR}"
    return
  fi

  [[ -n "$APP_GIT_URL" ]] || die "package.json not found in ${APP_DIR}. Upload the project, run from the project root, or set APP_GIT_URL."

  log "Cloning project from ${APP_GIT_URL}..."
  mkdir -p "$(dirname "$APP_DIR")"
  git clone "$APP_GIT_URL" "$APP_DIR"
  if [[ -n "$APP_GIT_REF" ]]; then
    git -C "$APP_DIR" checkout "$APP_GIT_REF"
  fi
}

collect_env_settings() {
  prompt_value OPENAI_BASE_URL "OpenAI-compatible Base URL" "$DEFAULT_BASE_URL"
  prompt_secret OPENAI_API_KEY "OpenAI-compatible API Key"
  prompt_value OPENAI_MODEL "Primary model" "$DEFAULT_MODEL"
  prompt_value OPENAI_FALLBACK_MODELS "Fallback models, comma separated" "$DEFAULT_FALLBACK_MODELS"
  prompt_value OPENAI_TIMEOUT_MS "Primary model timeout ms" "$DEFAULT_TIMEOUT_MS"
  prompt_value OPENAI_MAX_TOKENS "Max output tokens" "$DEFAULT_MAX_TOKENS"
  prompt_value OPENAI_TEMPERATURE "Temperature" "$DEFAULT_TEMPERATURE"
  prompt_value OPENAI_REASONING_EFFORT "Reasoning effort" "$DEFAULT_REASONING_EFFORT"
  prompt_value KNOWLEDGE_BUDGET_CHARS "Knowledge budget chars" "$DEFAULT_KNOWLEDGE_BUDGET_CHARS"
  prompt_value PORT "App port" "$PORT"
  prompt_yes_no ENABLE_NGINX_BASIC_AUTH "Enable Nginx Basic Auth for no-login first version?" "$DEFAULT_ENABLE_NGINX_BASIC_AUTH"

  if [[ "$ENABLE_NGINX_BASIC_AUTH" == "yes" ]]; then
    prompt_value BASIC_AUTH_USER "Basic Auth username" "$DEFAULT_BASIC_AUTH_USER"
    prompt_secret BASIC_AUTH_PASSWORD "Basic Auth password"
    prompt_value SERVER_NAME "Nginx server_name, use _ for IP access" "${SERVER_NAME:-_}"
    HOST="127.0.0.1"
  else
    HOST="${HOST:-0.0.0.0}"
  fi
}

write_env_file() {
  cd "${APP_DIR}"

  if [[ -f ".env" && "${FORCE_ENV:-0}" != "1" ]]; then
    log ".env already exists; keeping it. Set FORCE_ENV=1 to rewrite."
    return
  fi

  log "Writing production .env..."
  {
    printf 'OPENAI_BASE_URL=%s\n' "$(quote_env_value "$OPENAI_BASE_URL")"
    printf 'OPENAI_API_KEY=%s\n' "$(quote_env_value "$OPENAI_API_KEY")"
    printf 'OPENAI_MODEL=%s\n' "$(quote_env_value "$OPENAI_MODEL")"
    printf 'OPENAI_FALLBACK_MODELS=%s\n' "$(quote_env_value "$OPENAI_FALLBACK_MODELS")"
    printf 'PORT=%s\n' "$(quote_env_value "$PORT")"
    printf 'HOST=%s\n' "$(quote_env_value "$HOST")"
    printf 'OPENAI_TIMEOUT_MS=%s\n' "$(quote_env_value "$OPENAI_TIMEOUT_MS")"
    printf 'OPENAI_MAX_TOKENS=%s\n' "$(quote_env_value "$OPENAI_MAX_TOKENS")"
    printf 'OPENAI_TEMPERATURE=%s\n' "$(quote_env_value "$OPENAI_TEMPERATURE")"
    printf 'OPENAI_REASONING_EFFORT=%s\n' "$(quote_env_value "$OPENAI_REASONING_EFFORT")"
    printf 'KNOWLEDGE_BUDGET_CHARS=%s\n' "$(quote_env_value "$KNOWLEDGE_BUDGET_CHARS")"
  } > .env
  chmod 600 .env
}

install_and_build() {
  cd "${APP_DIR}"
  log "Installing dependencies..."
  if [[ -f package-lock.json ]]; then
    npm ci
  else
    npm install
  fi

  log "Building frontend..."
  npm run build
}

verify_knowledge() {
  cd "${APP_DIR}"
  log "Verifying knowledge files..."
  npm run verify:knowledge >/tmp/${APP_NAME}-knowledge-verify.log
  tail -n 20 /tmp/${APP_NAME}-knowledge-verify.log
}

install_systemd_service() {
  need_root_for_system
  local node_bin
  local run_user
  node_bin="$(command -v node)"
  run_user="${APP_RUN_USER:-${SUDO_USER:-root}}"

  log "Installing systemd service ${SERVICE_NAME}..."
  cat > "/etc/systemd/system/${SERVICE_NAME}.service" <<EOF
[Unit]
Description=IP Commerce Generator
After=network.target

[Service]
Type=simple
WorkingDirectory=${APP_DIR}
Environment=NODE_ENV=production
EnvironmentFile=${APP_DIR}/.env
ExecStart=${node_bin} ${APP_DIR}/server/index.mjs
Restart=always
RestartSec=5
User=${run_user}

[Install]
WantedBy=multi-user.target
EOF

  systemctl daemon-reload
  systemctl enable "${SERVICE_NAME}"
  systemctl restart "${SERVICE_NAME}"
  systemctl --no-pager --full status "${SERVICE_NAME}" || true
}

install_nginx_basic_auth() {
  [[ "${ENABLE_NGINX_BASIC_AUTH}" == "yes" ]] || return
  need_root_for_system

  log "Installing and configuring Nginx Basic Auth..."
  apt-get install -y nginx

  local auth_file="/etc/nginx/${APP_NAME}.htpasswd"
  local nginx_conf="/etc/nginx/sites-available/${APP_NAME}.conf"
  local password_hash
  password_hash="$(openssl passwd -apr1 "${BASIC_AUTH_PASSWORD}")"
  printf '%s:%s\n' "${BASIC_AUTH_USER}" "${password_hash}" > "${auth_file}"
  chmod 640 "${auth_file}"
  chown root:www-data "${auth_file}" || true

  cat > "${nginx_conf}" <<EOF
server {
    listen 80;
    server_name ${SERVER_NAME};

    auth_basic "IP Commerce Generator";
    auth_basic_user_file ${auth_file};

    client_max_body_size 10m;

    location / {
        proxy_pass http://127.0.0.1:${PORT};
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }
}
EOF

  ln -sf "${nginx_conf}" "/etc/nginx/sites-enabled/${APP_NAME}.conf"
  rm -f /etc/nginx/sites-enabled/default
  nginx -t
  systemctl enable nginx
  systemctl reload nginx
}

print_result() {
  local public_url
  if [[ "${ENABLE_NGINX_BASIC_AUTH}" == "yes" ]]; then
    public_url="http://YOUR_SERVER_IP/"
  else
    public_url="http://YOUR_SERVER_IP:${PORT}/"
  fi

  log "Deployment complete."
  log "Open ${public_url}"
  log "Health check: curl ${public_url%/}/api/health"
  log "API key was written to ${APP_DIR}/.env and is not printed here."
}

main() {
  need_root_for_system
  install_system_packages
  install_node_if_needed
  prepare_app_dir
  collect_env_settings
  write_env_file
  install_and_build
  verify_knowledge
  install_systemd_service
  install_nginx_basic_auth
  print_result
}

main "$@"
