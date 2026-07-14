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
NODE_MAJOR="${NODE_MAJOR:-20}"
APP_RUN_USER="${APP_RUN_USER:-${SUDO_USER:-root}}"
APP_RUN_GROUP="${APP_RUN_GROUP:-}"
PRIVATE_KNOWLEDGE_DIR="${PRIVATE_KNOWLEDGE_DIR:-/opt/ip-commerce-private}"

DEFAULT_FALLBACK_MODELS="gpt-5.4,gemini-3-flash,gpt-5.4-mini"
DEFAULT_TIMEOUT_MS="45000"
DEFAULT_FALLBACK_TIMEOUT_MS="30000"
DEFAULT_MAX_TOKENS="1200"
DEFAULT_TEMPERATURE="0.4"
DEFAULT_REASONING_EFFORT="low"
DEFAULT_KNOWLEDGE_BUDGET_CHARS="1200"
DEFAULT_AGENT_REVIEW_ENABLED="true"
DEFAULT_AGENT_REVIEW_MAX_TOKENS="1200"
DEFAULT_AGENT_REVIEW_TIMEOUT_MS="20000"
DEFAULT_ENABLE_NGINX_BASIC_AUTH="${ENABLE_NGINX_BASIC_AUTH:-no}"
DEFAULT_BASIC_AUTH_USER="${BASIC_AUTH_USER:-admin}"
GENERATED_BASIC_AUTH_PASSWORD="${GENERATED_BASIC_AUTH_PASSWORD:-no}"
DEFAULT_APP_AUTH_ENABLED="${APP_AUTH_ENABLED:-false}"
DEFAULT_APP_AUTH_USER="${APP_AUTH_USER:-admin}"
GENERATED_APP_AUTH_PASSWORD="${GENERATED_APP_AUTH_PASSWORD:-no}"
DEFAULT_ADMIN_USERNAME="${ADMIN_USERNAME:-admin}"
GENERATED_INITIAL_ADMIN_PASSWORD="${GENERATED_INITIAL_ADMIN_PASSWORD:-no}"

DEPLOY_ENV_KEYS=(
  OPENAI_BASE_URL OPENAI_API_KEY OPENAI_MODEL OPENAI_FALLBACK_MODELS
  OPENAI_TIMEOUT_MS OPENAI_FALLBACK_TIMEOUT_MS OPENAI_MAX_TOKENS
  OPENAI_TEMPERATURE OPENAI_REASONING_EFFORT
  DEEPSEEK_ENABLED DEEPSEEK_BASE_URL DEEPSEEK_API_KEY DEEPSEEK_MODEL
  DEEPSEEK_MODE DEEPSEEK_TIMEOUT_MS
  APP_AUTH_ENABLED APP_AUTH_USER APP_AUTH_PASSWORD ADMIN_USERNAME
  INITIAL_ADMIN_PASSWORD PORT HOST APP_DATA_DIR SESSION_DAYS
  KNOWLEDGE_DB_PATH KNOWLEDGE_BACKUP_DIR KNOWLEDGE_BACKUP_ENABLED
  PRIVATE_KNOWLEDGE_REQUIRED PRIVATE_KNOWLEDGE_MIN_CARDS
  KNOWLEDGE_UPLOAD_MAX_BYTES KNOWLEDGE_INGEST_MAX_CHUNKS
  KNOWLEDGE_INGEST_CHUNK_CHARS KNOWLEDGE_INGEST_MAX_INPUT_CHARS
  KNOWLEDGE_INGEST_MAX_TOKENS KNOWLEDGE_BUDGET_CHARS
  AGENT_REVIEW_ENABLED AGENT_REVIEW_MAX_TOKENS AGENT_REVIEW_TIMEOUT_MS
  QUALITY_REPAIR_ENABLED QUALITY_REPAIR_THRESHOLD AGENT_QUALITY_GATE_THRESHOLD
  JOB_GLOBAL_CONCURRENCY JOB_MAX_QUEUED_PER_USER
)
declare -A DEPLOY_ENV_WAS_SET=()

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
  local env_file="${APP_DIR}/.env"
  if [[ ! -f "$env_file" ]]; then
    return
  fi
  value="$(grep -E "^${key}=" "$env_file" 2>/dev/null | tail -n 1 | cut -d= -f2- || true)"
  value="${value%\"}"
  value="${value#\"}"
  printf '%s' "$value"
}

capture_env_overrides() {
  local key
  for key in "${DEPLOY_ENV_KEYS[@]}"; do
    if [[ -v "$key" ]]; then
      DEPLOY_ENV_WAS_SET["$key"]="1"
    else
      DEPLOY_ENV_WAS_SET["$key"]="0"
    fi
  done
}

resolve_env_setting() {
  local key="$1"
  local default_value="$2"
  local current_value="${!key-}"
  local existing_value=""

  if [[ "${DEPLOY_ENV_WAS_SET[$key]:-0}" != "1" && "${FORCE_ENV:-0}" != "1" ]]; then
    existing_value="$(read_env_value "$key")"
    if [[ -n "$existing_value" ]]; then
      current_value="$existing_value"
    fi
  fi
  if [[ -z "$current_value" ]]; then
    current_value="$default_value"
  fi
  printf -v "$key" '%s' "$current_value"
}

normalize_boolean_setting() {
  local key="$1"
  local value="${!key:-}"
  case "${value,,}" in
    y|yes|true|1|on) printf -v "$key" '%s' "true" ;;
    n|no|false|0|off) printf -v "$key" '%s' "false" ;;
    *) die "${key} must be true or false." ;;
  esac
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
  capture_env_overrides

  resolve_env_setting OPENAI_BASE_URL ""
  resolve_env_setting OPENAI_API_KEY ""
  resolve_env_setting OPENAI_MODEL ""
  resolve_env_setting OPENAI_FALLBACK_MODELS "$DEFAULT_FALLBACK_MODELS"
  resolve_env_setting OPENAI_TIMEOUT_MS "$DEFAULT_TIMEOUT_MS"
  resolve_env_setting OPENAI_FALLBACK_TIMEOUT_MS "$DEFAULT_FALLBACK_TIMEOUT_MS"
  resolve_env_setting OPENAI_MAX_TOKENS "$DEFAULT_MAX_TOKENS"
  resolve_env_setting OPENAI_TEMPERATURE "$DEFAULT_TEMPERATURE"
  resolve_env_setting OPENAI_REASONING_EFFORT "$DEFAULT_REASONING_EFFORT"
  resolve_env_setting DEEPSEEK_ENABLED "false"
  resolve_env_setting DEEPSEEK_BASE_URL "https://api.deepseek.com/v1"
  resolve_env_setting DEEPSEEK_API_KEY ""
  resolve_env_setting DEEPSEEK_MODEL "deepseek-chat"
  resolve_env_setting DEEPSEEK_MODE "fallback"
  resolve_env_setting DEEPSEEK_TIMEOUT_MS "45000"

  # The legacy shared page password stays disabled unless explicitly requested.
  APP_AUTH_ENABLED="${APP_AUTH_ENABLED:-$DEFAULT_APP_AUTH_ENABLED}"
  resolve_env_setting APP_AUTH_USER "$DEFAULT_APP_AUTH_USER"
  resolve_env_setting APP_AUTH_PASSWORD ""
  resolve_env_setting ADMIN_USERNAME "$DEFAULT_ADMIN_USERNAME"
  resolve_env_setting INITIAL_ADMIN_PASSWORD ""
  resolve_env_setting PORT "8790"
  resolve_env_setting HOST "0.0.0.0"
  resolve_env_setting APP_DATA_DIR "${APP_DIR}/data"
  resolve_env_setting SESSION_DAYS "14"

  resolve_env_setting KNOWLEDGE_DB_PATH "${PRIVATE_KNOWLEDGE_DIR}/knowledge.db"
  PRIVATE_KNOWLEDGE_DIR="$(dirname "$KNOWLEDGE_DB_PATH")"
  resolve_env_setting KNOWLEDGE_BACKUP_DIR "${PRIVATE_KNOWLEDGE_DIR}/backups"
  resolve_env_setting KNOWLEDGE_BACKUP_ENABLED "true"
  resolve_env_setting PRIVATE_KNOWLEDGE_REQUIRED "true"
  resolve_env_setting PRIVATE_KNOWLEDGE_MIN_CARDS "200"
  resolve_env_setting KNOWLEDGE_UPLOAD_MAX_BYTES "10485760"
  resolve_env_setting KNOWLEDGE_INGEST_MAX_CHUNKS "4"
  resolve_env_setting KNOWLEDGE_INGEST_CHUNK_CHARS "12000"
  resolve_env_setting KNOWLEDGE_INGEST_MAX_INPUT_CHARS "100000"
  resolve_env_setting KNOWLEDGE_INGEST_MAX_TOKENS "1800"
  resolve_env_setting KNOWLEDGE_BUDGET_CHARS "$DEFAULT_KNOWLEDGE_BUDGET_CHARS"

  resolve_env_setting AGENT_REVIEW_ENABLED "$DEFAULT_AGENT_REVIEW_ENABLED"
  resolve_env_setting AGENT_REVIEW_MAX_TOKENS "$DEFAULT_AGENT_REVIEW_MAX_TOKENS"
  resolve_env_setting AGENT_REVIEW_TIMEOUT_MS "$DEFAULT_AGENT_REVIEW_TIMEOUT_MS"
  resolve_env_setting QUALITY_REPAIR_ENABLED "true"
  resolve_env_setting QUALITY_REPAIR_THRESHOLD "70"
  resolve_env_setting AGENT_QUALITY_GATE_THRESHOLD "70"
  resolve_env_setting JOB_GLOBAL_CONCURRENCY "2"
  resolve_env_setting JOB_MAX_QUEUED_PER_USER "3"

  LEGACY_KNOWLEDGE_DIR="${LEGACY_KNOWLEDGE_DIR:-${APP_DIR}/knowledge}"
  ENABLE_NGINX_BASIC_AUTH="${ENABLE_NGINX_BASIC_AUTH:-$DEFAULT_ENABLE_NGINX_BASIC_AUTH}"

  normalize_boolean_setting APP_AUTH_ENABLED
  normalize_boolean_setting DEEPSEEK_ENABLED
  normalize_boolean_setting KNOWLEDGE_BACKUP_ENABLED
  normalize_boolean_setting PRIVATE_KNOWLEDGE_REQUIRED
  normalize_boolean_setting AGENT_REVIEW_ENABLED
  normalize_boolean_setting QUALITY_REPAIR_ENABLED

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
    log ".env already exists; preserving model, queue, quality, authentication, and storage settings."
  fi

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
    printf 'DEEPSEEK_ENABLED=%s\n' "$(quote_env_value "$DEEPSEEK_ENABLED")"
    printf 'DEEPSEEK_BASE_URL=%s\n' "$(quote_env_value "$DEEPSEEK_BASE_URL")"
    printf 'DEEPSEEK_API_KEY=%s\n' "$(quote_env_value "$DEEPSEEK_API_KEY")"
    printf 'DEEPSEEK_MODEL=%s\n' "$(quote_env_value "$DEEPSEEK_MODEL")"
    printf 'DEEPSEEK_MODE=%s\n' "$(quote_env_value "$DEEPSEEK_MODE")"
    printf 'DEEPSEEK_TIMEOUT_MS=%s\n' "$(quote_env_value "$DEEPSEEK_TIMEOUT_MS")"
    printf 'APP_DATA_DIR=%s\n' "$(quote_env_value "$APP_DATA_DIR")"
    printf 'SESSION_DAYS=%s\n' "$(quote_env_value "$SESSION_DAYS")"
    printf 'KNOWLEDGE_DB_PATH=%s\n' "$(quote_env_value "$KNOWLEDGE_DB_PATH")"
    printf 'KNOWLEDGE_BACKUP_DIR=%s\n' "$(quote_env_value "$KNOWLEDGE_BACKUP_DIR")"
    printf 'KNOWLEDGE_BACKUP_ENABLED=%s\n' "$(quote_env_value "$KNOWLEDGE_BACKUP_ENABLED")"
    printf 'PRIVATE_KNOWLEDGE_REQUIRED=%s\n' "$(quote_env_value "$PRIVATE_KNOWLEDGE_REQUIRED")"
    printf 'PRIVATE_KNOWLEDGE_MIN_CARDS=%s\n' "$(quote_env_value "$PRIVATE_KNOWLEDGE_MIN_CARDS")"
    printf 'KNOWLEDGE_UPLOAD_MAX_BYTES=%s\n' "$(quote_env_value "$KNOWLEDGE_UPLOAD_MAX_BYTES")"
    printf 'KNOWLEDGE_INGEST_MAX_CHUNKS=%s\n' "$(quote_env_value "$KNOWLEDGE_INGEST_MAX_CHUNKS")"
    printf 'KNOWLEDGE_INGEST_CHUNK_CHARS=%s\n' "$(quote_env_value "$KNOWLEDGE_INGEST_CHUNK_CHARS")"
    printf 'KNOWLEDGE_INGEST_MAX_INPUT_CHARS=%s\n' "$(quote_env_value "$KNOWLEDGE_INGEST_MAX_INPUT_CHARS")"
    printf 'KNOWLEDGE_INGEST_MAX_TOKENS=%s\n' "$(quote_env_value "$KNOWLEDGE_INGEST_MAX_TOKENS")"
    printf 'KNOWLEDGE_BUDGET_CHARS=%s\n' "$(quote_env_value "$KNOWLEDGE_BUDGET_CHARS")"
    printf 'AGENT_REVIEW_ENABLED=%s\n' "$(quote_env_value "$AGENT_REVIEW_ENABLED")"
    printf 'AGENT_REVIEW_MAX_TOKENS=%s\n' "$(quote_env_value "$AGENT_REVIEW_MAX_TOKENS")"
    printf 'AGENT_REVIEW_TIMEOUT_MS=%s\n' "$(quote_env_value "$AGENT_REVIEW_TIMEOUT_MS")"
    printf 'QUALITY_REPAIR_ENABLED=%s\n' "$(quote_env_value "$QUALITY_REPAIR_ENABLED")"
    printf 'QUALITY_REPAIR_THRESHOLD=%s\n' "$(quote_env_value "$QUALITY_REPAIR_THRESHOLD")"
    printf 'AGENT_QUALITY_GATE_THRESHOLD=%s\n' "$(quote_env_value "$AGENT_QUALITY_GATE_THRESHOLD")"
    printf 'JOB_GLOBAL_CONCURRENCY=%s\n' "$(quote_env_value "$JOB_GLOBAL_CONCURRENCY")"
    printf 'JOB_MAX_QUEUED_PER_USER=%s\n' "$(quote_env_value "$JOB_MAX_QUEUED_PER_USER")"
  } > .env
  chmod 600 .env
}

resolve_run_identity() {
  id "$APP_RUN_USER" >/dev/null 2>&1 || die "APP_RUN_USER does not exist: ${APP_RUN_USER}"
  if [[ -z "$APP_RUN_GROUP" ]]; then
    APP_RUN_GROUP="$(id -gn "$APP_RUN_USER")"
  fi
}

stop_existing_service() {
  if systemctl cat "${SERVICE_NAME}.service" >/dev/null 2>&1; then
    log "Stopping existing ${SERVICE_NAME} service before private knowledge migration..."
    systemctl stop "$SERVICE_NAME"
  fi
}

prepare_runtime_storage() {
  log "Preparing application and private knowledge storage..."
  mkdir -p "$APP_DATA_DIR" "$PRIVATE_KNOWLEDGE_DIR" "$KNOWLEDGE_BACKUP_DIR"
  chown -R "${APP_RUN_USER}:${APP_RUN_GROUP}" "$APP_DATA_DIR" "$KNOWLEDGE_BACKUP_DIR"
  chown "${APP_RUN_USER}:${APP_RUN_GROUP}" "$PRIVATE_KNOWLEDGE_DIR"
  if [[ -f "$KNOWLEDGE_DB_PATH" ]]; then
    chown "${APP_RUN_USER}:${APP_RUN_GROUP}" "$KNOWLEDGE_DB_PATH"
    chmod 600 "$KNOWLEDGE_DB_PATH"
  fi
  chmod 750 "$APP_DATA_DIR" "$PRIVATE_KNOWLEDGE_DIR" "$KNOWLEDGE_BACKUP_DIR"
  chown "${APP_RUN_USER}:${APP_RUN_GROUP}" "${APP_DIR}/.env"
  chmod 600 "${APP_DIR}/.env"
}

backup_private_knowledge_before_migration() {
  [[ -s "$KNOWLEDGE_DB_PATH" ]] || return
  cd "${APP_DIR}"
  local timestamp
  local raw_backup_path
  timestamp="$(date -u +%Y-%m-%dT%H-%M-%S-000Z)"
  raw_backup_path="${KNOWLEDGE_BACKUP_DIR}/private-knowledge-pre-migration-${timestamp}.db"
  log "Creating a private knowledge backup before migration..."
  cp "$KNOWLEDGE_DB_PATH" "$raw_backup_path"
  chmod 600 "$raw_backup_path"
  if ! npm run backup:private-knowledge >/tmp/${APP_NAME}-private-knowledge-backup.log 2>&1; then
    cat /tmp/${APP_NAME}-private-knowledge-backup.log
    die "Private knowledge backup failed; deployment stopped before migration."
  fi
  tail -n 30 /tmp/${APP_NAME}-private-knowledge-backup.log
}

migrate_private_knowledge() {
  cd "${APP_DIR}"
  local args=("$LEGACY_KNOWLEDGE_DIR")
  if [[ "${FORCE_LEGACY_KNOWLEDGE_IMPORT:-0}" == "1" ]]; then
    args+=("--force")
  fi
  log "Migrating and verifying the private knowledge database..."
  if ! npm run migrate:private-knowledge -- "${args[@]}" >/tmp/${APP_NAME}-private-knowledge-migration.log 2>&1; then
    cat /tmp/${APP_NAME}-private-knowledge-migration.log
    die "Private knowledge migration or minimum-card verification failed."
  fi
  cat /tmp/${APP_NAME}-private-knowledge-migration.log
  chown "${APP_RUN_USER}:${APP_RUN_GROUP}" "$PRIVATE_KNOWLEDGE_DIR" "$KNOWLEDGE_DB_PATH"
  chown -R "${APP_RUN_USER}:${APP_RUN_GROUP}" "$KNOWLEDGE_BACKUP_DIR"
  chmod 750 "$PRIVATE_KNOWLEDGE_DIR" "$KNOWLEDGE_BACKUP_DIR"
  chmod 600 "$KNOWLEDGE_DB_PATH"
  find "$KNOWLEDGE_BACKUP_DIR" -type d -exec chmod 750 {} +
  find "$KNOWLEDGE_BACKUP_DIR" -type f -exec chmod 600 {} +
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
  node_bin="$(command -v node)"

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
User=${APP_RUN_USER}
Group=${APP_RUN_GROUP}
UMask=0077

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
  log "Private knowledge is stored outside the program directory and is preserved during upgrades."
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
  resolve_run_identity
  stop_existing_service
  prepare_runtime_storage
  backup_private_knowledge_before_migration
  migrate_private_knowledge
  prepare_runtime_storage
  install_systemd_service
  install_nginx_basic_auth
  open_firewall_ports
  run_health_checks
  print_result
}

if [[ "${BASH_SOURCE[0]:-$0}" == "$0" ]]; then
  main "$@"
fi
