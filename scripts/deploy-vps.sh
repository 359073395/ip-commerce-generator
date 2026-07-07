#!/usr/bin/env bash
set -Eeuo pipefail

export DEBIAN_FRONTEND="${DEBIAN_FRONTEND:-noninteractive}"
export NEEDRESTART_MODE="${NEEDRESTART_MODE:-a}"
export APT_LISTCHANGES_FRONTEND="${APT_LISTCHANGES_FRONTEND:-none}"

APP_NAME="${APP_NAME:-ip-commerce-generator}"
SERVICE_NAME="${SERVICE_NAME:-ip-commerce-generator}"
APP_DIR="${APP_DIR:-$(pwd)}"
APP_GIT_URL="${APP_GIT_URL:-}"
APP_GIT_REF="${APP_GIT_REF:-}"
PORT="${PORT:-8790}"
NODE_MAJOR="${NODE_MAJOR:-20}"

DEFAULT_FALLBACK_MODELS="${OPENAI_FALLBACK_MODELS:-gpt-5.4,gemini-3-flash,gpt-5.4-mini}"
DEFAULT_TIMEOUT_MS="${OPENAI_TIMEOUT_MS:-45000}"
DEFAULT_FALLBACK_TIMEOUT_MS="${OPENAI_FALLBACK_TIMEOUT_MS:-30000}"
DEFAULT_MAX_TOKENS="${OPENAI_MAX_TOKENS:-1200}"
DEFAULT_TEMPERATURE="${OPENAI_TEMPERATURE:-0.4}"
DEFAULT_REASONING_EFFORT="${OPENAI_REASONING_EFFORT:-low}"
DEFAULT_KNOWLEDGE_BUDGET_CHARS="${KNOWLEDGE_BUDGET_CHARS:-1200}"
DEFAULT_AGENT_REVIEW_ENABLED="${AGENT_REVIEW_ENABLED:-true}"
DEFAULT_AGENT_REVIEW_MAX_TOKENS="${AGENT_REVIEW_MAX_TOKENS:-1200}"
DEFAULT_AGENT_REVIEW_TIMEOUT_MS="${AGENT_REVIEW_TIMEOUT_MS:-20000}"
DEFAULT_ENABLE_NGINX_BASIC_AUTH="${ENABLE_NGINX_BASIC_AUTH:-no}"
DEFAULT_BASIC_AUTH_USER="${BASIC_AUTH_USER:-admin}"
GENERATED_BASIC_AUTH_PASSWORD="${GENERATED_BASIC_AUTH_PASSWORD:-no}"
DEFAULT_APP_AUTH_ENABLED="${APP_AUTH_ENABLED:-false}"
DEFAULT_APP_AUTH_USER="${APP_AUTH_USER:-admin}"
GENERATED_APP_AUTH_PASSWORD="${GENERATED_APP_AUTH_PASSWORD:-no}"
DEFAULT_ADMIN_USERNAME="${ADMIN_USERNAME:-admin}"
GENERATED_INITIAL_ADMIN_PASSWORD="${GENERATED_INITIAL_ADMIN_PASSWORD:-no}"

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

read_env_value() {
  local key="$1"
  local value
  if [[ ! -f ".env" ]]; then
    return
  fi
  value="$(grep -E "^${key}=" .env 2>/dev/null | tail -n 1 | cut -d= -f2- || true)"
  value="${value%\"}"
  value="${value#\"}"
  printf '%s' "$value"
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
  APP_AUTH_ENABLED_WAS_SET="${APP_AUTH_ENABLED+x}"
  APP_AUTH_USER_WAS_SET="${APP_AUTH_USER+x}"
  APP_AUTH_PASSWORD_WAS_SET="${APP_AUTH_PASSWORD+x}"
  ADMIN_USERNAME_WAS_SET="${ADMIN_USERNAME+x}"
  INITIAL_ADMIN_PASSWORD_WAS_SET="${INITIAL_ADMIN_PASSWORD+x}"
  AGENT_REVIEW_ENABLED_WAS_SET="${AGENT_REVIEW_ENABLED+x}"
  AGENT_REVIEW_MAX_TOKENS_WAS_SET="${AGENT_REVIEW_MAX_TOKENS+x}"
  AGENT_REVIEW_TIMEOUT_MS_WAS_SET="${AGENT_REVIEW_TIMEOUT_MS+x}"
  OPENAI_BASE_URL="${OPENAI_BASE_URL:-}"
  OPENAI_API_KEY="${OPENAI_API_KEY:-}"
  OPENAI_MODEL="${OPENAI_MODEL:-}"
  OPENAI_FALLBACK_MODELS="${OPENAI_FALLBACK_MODELS:-$DEFAULT_FALLBACK_MODELS}"
  OPENAI_TIMEOUT_MS="${OPENAI_TIMEOUT_MS:-$DEFAULT_TIMEOUT_MS}"
  OPENAI_FALLBACK_TIMEOUT_MS="${OPENAI_FALLBACK_TIMEOUT_MS:-$DEFAULT_FALLBACK_TIMEOUT_MS}"
  OPENAI_MAX_TOKENS="${OPENAI_MAX_TOKENS:-$DEFAULT_MAX_TOKENS}"
  OPENAI_TEMPERATURE="${OPENAI_TEMPERATURE:-$DEFAULT_TEMPERATURE}"
  OPENAI_REASONING_EFFORT="${OPENAI_REASONING_EFFORT:-$DEFAULT_REASONING_EFFORT}"
  KNOWLEDGE_BUDGET_CHARS="${KNOWLEDGE_BUDGET_CHARS:-$DEFAULT_KNOWLEDGE_BUDGET_CHARS}"
  AGENT_REVIEW_ENABLED="${AGENT_REVIEW_ENABLED:-$DEFAULT_AGENT_REVIEW_ENABLED}"
  AGENT_REVIEW_MAX_TOKENS="${AGENT_REVIEW_MAX_TOKENS:-$DEFAULT_AGENT_REVIEW_MAX_TOKENS}"
  AGENT_REVIEW_TIMEOUT_MS="${AGENT_REVIEW_TIMEOUT_MS:-$DEFAULT_AGENT_REVIEW_TIMEOUT_MS}"
  APP_AUTH_ENABLED="${APP_AUTH_ENABLED:-$DEFAULT_APP_AUTH_ENABLED}"
  APP_AUTH_USER="${APP_AUTH_USER:-$DEFAULT_APP_AUTH_USER}"
  APP_AUTH_PASSWORD="${APP_AUTH_PASSWORD:-}"
  ADMIN_USERNAME="${ADMIN_USERNAME:-$DEFAULT_ADMIN_USERNAME}"
  INITIAL_ADMIN_PASSWORD="${INITIAL_ADMIN_PASSWORD:-}"
  PORT="${PORT:-8790}"
  ENABLE_NGINX_BASIC_AUTH="${ENABLE_NGINX_BASIC_AUTH:-$DEFAULT_ENABLE_NGINX_BASIC_AUTH}"

  case "${APP_AUTH_ENABLED,,}" in
    y|yes|true|1|on) APP_AUTH_ENABLED="true" ;;
    n|no|false|0|off) APP_AUTH_ENABLED="false" ;;
    *) die "APP_AUTH_ENABLED must be true or false." ;;
  esac

  case "${AGENT_REVIEW_ENABLED,,}" in
    y|yes|true|1|on) AGENT_REVIEW_ENABLED="true" ;;
    n|no|false|0|off) AGENT_REVIEW_ENABLED="false" ;;
    *) die "AGENT_REVIEW_ENABLED must be true or false." ;;
  esac

  case "${ENABLE_NGINX_BASIC_AUTH,,}" in
    y|yes|true|1) ENABLE_NGINX_BASIC_AUTH="yes" ;;
    n|no|false|0) ENABLE_NGINX_BASIC_AUTH="no" ;;
    *) die "ENABLE_NGINX_BASIC_AUTH must be yes or no." ;;
  esac

  if [[ -z "$OPENAI_BASE_URL" || -z "$OPENAI_API_KEY" || -z "$OPENAI_MODEL" ]]; then
    log "API settings are empty. Configure Base URL, API Key, and model in the web UI after deployment."
  else
    log "Using API settings from environment variables."
  fi

  if [[ "$ENABLE_NGINX_BASIC_AUTH" == "yes" ]]; then
    BASIC_AUTH_USER="${BASIC_AUTH_USER:-${APP_AUTH_USER:-$DEFAULT_BASIC_AUTH_USER}}"
    SERVER_NAME="${SERVER_NAME:-_}"
    if [[ -z "${BASIC_AUTH_PASSWORD:-}" ]]; then
      if [[ "$APP_AUTH_ENABLED" == "true" && -n "${APP_AUTH_PASSWORD:-}" ]]; then
        BASIC_AUTH_PASSWORD="$APP_AUTH_PASSWORD"
      else
        BASIC_AUTH_PASSWORD="$(openssl rand -base64 18)"
        GENERATED_BASIC_AUTH_PASSWORD="yes"
      fi
    fi
    HOST="127.0.0.1"
  else
    HOST="${HOST:-0.0.0.0}"
  fi
}

write_env_file() {
  cd "${APP_DIR}"

  if [[ -f ".env" && "${FORCE_ENV:-0}" != "1" ]]; then
    log ".env already exists; preserving API values and updating deployment defaults."
    [[ -n "$OPENAI_BASE_URL" ]] || OPENAI_BASE_URL="$(read_env_value OPENAI_BASE_URL)"
    [[ -n "$OPENAI_API_KEY" ]] || OPENAI_API_KEY="$(read_env_value OPENAI_API_KEY)"
    [[ -n "$OPENAI_MODEL" ]] || OPENAI_MODEL="$(read_env_value OPENAI_MODEL)"
    if [[ -z "$APP_AUTH_USER_WAS_SET" ]]; then
      APP_AUTH_USER="$(read_env_value APP_AUTH_USER)"
    fi
    if [[ -z "$APP_AUTH_PASSWORD_WAS_SET" ]]; then
      APP_AUTH_PASSWORD="$(read_env_value APP_AUTH_PASSWORD)"
    fi
    # The shared page password is deprecated. Keep it disabled on upgrades
    # unless the operator explicitly passes APP_AUTH_ENABLED=true.
    if [[ -z "$ADMIN_USERNAME_WAS_SET" ]]; then
      local existing_admin_username
      existing_admin_username="$(read_env_value ADMIN_USERNAME)"
      [[ -z "$existing_admin_username" ]] || ADMIN_USERNAME="$existing_admin_username"
    fi
    if [[ -z "$INITIAL_ADMIN_PASSWORD_WAS_SET" ]]; then
      local existing_initial_admin_password
      existing_initial_admin_password="$(read_env_value INITIAL_ADMIN_PASSWORD)"
      [[ -z "$existing_initial_admin_password" ]] || INITIAL_ADMIN_PASSWORD="$existing_initial_admin_password"
    fi
    if [[ -z "$AGENT_REVIEW_ENABLED_WAS_SET" ]]; then
      local existing_agent_review_enabled
      existing_agent_review_enabled="$(read_env_value AGENT_REVIEW_ENABLED)"
      [[ -z "$existing_agent_review_enabled" ]] || AGENT_REVIEW_ENABLED="$existing_agent_review_enabled"
    fi
    if [[ -z "$AGENT_REVIEW_MAX_TOKENS_WAS_SET" ]]; then
      local existing_agent_review_max_tokens
      existing_agent_review_max_tokens="$(read_env_value AGENT_REVIEW_MAX_TOKENS)"
      [[ -z "$existing_agent_review_max_tokens" ]] || AGENT_REVIEW_MAX_TOKENS="$existing_agent_review_max_tokens"
    fi
    if [[ -z "$AGENT_REVIEW_TIMEOUT_MS_WAS_SET" ]]; then
      local existing_agent_review_timeout_ms
      existing_agent_review_timeout_ms="$(read_env_value AGENT_REVIEW_TIMEOUT_MS)"
      [[ -z "$existing_agent_review_timeout_ms" ]] || AGENT_REVIEW_TIMEOUT_MS="$existing_agent_review_timeout_ms"
    fi
  fi

  APP_AUTH_ENABLED="${APP_AUTH_ENABLED:-$DEFAULT_APP_AUTH_ENABLED}"
  APP_AUTH_USER="${APP_AUTH_USER:-$DEFAULT_APP_AUTH_USER}"
  ADMIN_USERNAME="${ADMIN_USERNAME:-$DEFAULT_ADMIN_USERNAME}"
  AGENT_REVIEW_ENABLED="${AGENT_REVIEW_ENABLED:-$DEFAULT_AGENT_REVIEW_ENABLED}"
  AGENT_REVIEW_MAX_TOKENS="${AGENT_REVIEW_MAX_TOKENS:-$DEFAULT_AGENT_REVIEW_MAX_TOKENS}"
  AGENT_REVIEW_TIMEOUT_MS="${AGENT_REVIEW_TIMEOUT_MS:-$DEFAULT_AGENT_REVIEW_TIMEOUT_MS}"
  case "${APP_AUTH_ENABLED,,}" in
    y|yes|true|1|on) APP_AUTH_ENABLED="true" ;;
    n|no|false|0|off) APP_AUTH_ENABLED="false" ;;
    *) die "APP_AUTH_ENABLED must be true or false." ;;
  esac

  case "${AGENT_REVIEW_ENABLED,,}" in
    y|yes|true|1|on) AGENT_REVIEW_ENABLED="true" ;;
    n|no|false|0|off) AGENT_REVIEW_ENABLED="false" ;;
    *) die "AGENT_REVIEW_ENABLED must be true or false." ;;
  esac

  if [[ "$APP_AUTH_ENABLED" == "true" && -z "$APP_AUTH_PASSWORD" ]]; then
    APP_AUTH_PASSWORD="$(openssl rand -base64 18)"
    GENERATED_APP_AUTH_PASSWORD="yes"
  fi

  if [[ "$ENABLE_NGINX_BASIC_AUTH" == "yes" && "$APP_AUTH_ENABLED" == "true" ]]; then
    BASIC_AUTH_USER="$APP_AUTH_USER"
    BASIC_AUTH_PASSWORD="$APP_AUTH_PASSWORD"
    GENERATED_BASIC_AUTH_PASSWORD="no"
  fi

  if [[ -z "$INITIAL_ADMIN_PASSWORD" ]]; then
    INITIAL_ADMIN_PASSWORD="$(openssl rand -base64 18)"
    GENERATED_INITIAL_ADMIN_PASSWORD="yes"
  fi

  log "Writing production .env..."
  {
    printf 'OPENAI_BASE_URL=%s\n' "$(quote_env_value "$OPENAI_BASE_URL")"
    printf 'OPENAI_API_KEY=%s\n' "$(quote_env_value "$OPENAI_API_KEY")"
    printf 'OPENAI_MODEL=%s\n' "$(quote_env_value "$OPENAI_MODEL")"
    printf 'OPENAI_FALLBACK_MODELS=%s\n' "$(quote_env_value "$OPENAI_FALLBACK_MODELS")"
    printf 'APP_AUTH_ENABLED=%s\n' "$(quote_env_value "$APP_AUTH_ENABLED")"
    printf 'APP_AUTH_USER=%s\n' "$(quote_env_value "$APP_AUTH_USER")"
    printf 'APP_AUTH_PASSWORD=%s\n' "$(quote_env_value "$APP_AUTH_PASSWORD")"
    printf 'ADMIN_USERNAME=%s\n' "$(quote_env_value "$ADMIN_USERNAME")"
    printf 'INITIAL_ADMIN_PASSWORD=%s\n' "$(quote_env_value "$INITIAL_ADMIN_PASSWORD")"
    printf 'PORT=%s\n' "$(quote_env_value "$PORT")"
    printf 'HOST=%s\n' "$(quote_env_value "$HOST")"
    printf 'OPENAI_TIMEOUT_MS=%s\n' "$(quote_env_value "$OPENAI_TIMEOUT_MS")"
    printf 'OPENAI_FALLBACK_TIMEOUT_MS=%s\n' "$(quote_env_value "$OPENAI_FALLBACK_TIMEOUT_MS")"
    printf 'OPENAI_MAX_TOKENS=%s\n' "$(quote_env_value "$OPENAI_MAX_TOKENS")"
    printf 'OPENAI_TEMPERATURE=%s\n' "$(quote_env_value "$OPENAI_TEMPERATURE")"
    printf 'OPENAI_REASONING_EFFORT=%s\n' "$(quote_env_value "$OPENAI_REASONING_EFFORT")"
    printf 'KNOWLEDGE_BUDGET_CHARS=%s\n' "$(quote_env_value "$KNOWLEDGE_BUDGET_CHARS")"
    printf 'AGENT_REVIEW_ENABLED=%s\n' "$(quote_env_value "$AGENT_REVIEW_ENABLED")"
    printf 'AGENT_REVIEW_MAX_TOKENS=%s\n' "$(quote_env_value "$AGENT_REVIEW_MAX_TOKENS")"
    printf 'AGENT_REVIEW_TIMEOUT_MS=%s\n' "$(quote_env_value "$AGENT_REVIEW_TIMEOUT_MS")"
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
  if ! npm run verify:knowledge >/tmp/${APP_NAME}-knowledge-verify.log 2>&1; then
    cat /tmp/${APP_NAME}-knowledge-verify.log
    die "Knowledge verification failed."
  fi
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

open_firewall_ports() {
  if ! command -v ufw >/dev/null 2>&1; then
    return
  fi

  local ufw_status
  ufw_status="$(ufw status | head -n 1 || true)"
  if [[ "$ufw_status" == *active* ]]; then
    if [[ "${ENABLE_NGINX_BASIC_AUTH}" == "yes" ]]; then
      ufw allow 80/tcp || true
    else
      ufw allow "${PORT}/tcp" || true
    fi
  fi
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
  systemctl restart nginx
}

run_health_checks() {
  log "Running local health checks..."
  if [[ "${ENABLE_NGINX_BASIC_AUTH}" == "yes" ]]; then
    curl -fsSI "http://127.0.0.1/" >/dev/null
    if [[ "${APP_AUTH_ENABLED}" == "true" ]]; then
      curl -fsS -u "${APP_AUTH_USER}:${APP_AUTH_PASSWORD}" "http://127.0.0.1/api/health" >/dev/null
    else
      curl -fsS -u "${BASIC_AUTH_USER}:${BASIC_AUTH_PASSWORD}" "http://127.0.0.1/api/health" >/dev/null
    fi
  else
    if [[ "${APP_AUTH_ENABLED}" == "true" ]]; then
      curl -fsS -u "${APP_AUTH_USER}:${APP_AUTH_PASSWORD}" "http://127.0.0.1:${PORT}/api/health" >/dev/null
    else
      curl -fsS "http://127.0.0.1:${PORT}/api/health" >/dev/null
    fi
  fi
  log "Local health checks passed."
}

detect_server_ip() {
  local ip
  ip="$(curl -fsS --max-time 4 https://api.ipify.org 2>/dev/null || true)"
  if [[ -n "$ip" ]]; then
    printf '%s' "$ip"
    return
  fi
  hostname -I 2>/dev/null | awk '{print $1}'
}

print_result() {
  local public_url
  local detected_ip
  detected_ip="$(detect_server_ip)"
  if [[ "${ENABLE_NGINX_BASIC_AUTH}" == "yes" ]]; then
    public_url="http://${detected_ip:-YOUR_SERVER_IP}/"
  else
    public_url="http://${detected_ip:-YOUR_SERVER_IP}:${PORT}/"
  fi

  log "Deployment complete."
  log "Open ${public_url}"
  if [[ "${APP_AUTH_ENABLED}" == "true" ]]; then
    log "Web password username: ${APP_AUTH_USER}"
    if [[ "${GENERATED_APP_AUTH_PASSWORD}" == "yes" ]]; then
      log "Generated web password: ${APP_AUTH_PASSWORD}"
    else
      log "Web password: the value saved in ${APP_DIR}/.env"
    fi
  else
    log "Unified web password is disabled. User login is handled by app accounts."
  fi
  log "Admin login username: ${ADMIN_USERNAME}"
  if [[ "${GENERATED_INITIAL_ADMIN_PASSWORD}" == "yes" ]]; then
    log "Generated initial admin password: ${INITIAL_ADMIN_PASSWORD}"
  else
    log "Initial admin password: the value saved in ${APP_DIR}/.env"
  fi
  if [[ "${ENABLE_NGINX_BASIC_AUTH}" == "yes" ]]; then
    log "If the page does not open, check your cloud security group/firewall and allow inbound TCP 80."
  else
    log "If the page does not open, check your cloud security group/firewall and allow inbound TCP ${PORT}."
  fi
  if [[ "${ENABLE_NGINX_BASIC_AUTH}" == "yes" ]]; then
    log "Basic Auth username: ${BASIC_AUTH_USER}"
    if [[ "${GENERATED_BASIC_AUTH_PASSWORD}" == "yes" ]]; then
      log "Generated Basic Auth password: ${BASIC_AUTH_PASSWORD}"
    else
      log "Basic Auth password: the value you provided in BASIC_AUTH_PASSWORD"
    fi
  fi
  if [[ "${APP_AUTH_ENABLED}" == "true" ]]; then
    log "Health check: curl -u '${APP_AUTH_USER}:YOUR_PASSWORD' ${public_url%/}/api/health"
  else
    log "Health check: curl ${public_url%/}/api/health"
  fi
  log "Configure the model API from the web page after login."
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
  open_firewall_ports
  run_health_checks
  print_result
}

main "$@"
