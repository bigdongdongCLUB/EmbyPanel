#!/usr/bin/env bash
set -euo pipefail

REPO_URL="${REPO_URL:-https://github.com/bigdongdongCLUB/EmbyPanel.git}"
BRANCH="${BRANCH:-main}"
APP_DIR="${APP_DIR:-/opt/embypanel}"
APP_URL="${APP_URL:-}"

log() { printf "\033[1;34m[EmbyPanel]\033[0m %s\n" "$*"; }
warn() { printf "\033[1;33m[Warn]\033[0m %s\n" "$*"; }

need_cmd() {
  command -v "$1" >/dev/null 2>&1 || {
    echo "Missing required command: $1" >&2
    exit 1
  }
}

run_as_root() {
  if [ "${EUID}" -eq 0 ]; then
    bash -lc "$*"
  else
    sudo bash -lc "$*"
  fi
}

dc() {
  if docker compose version >/dev/null 2>&1; then
    docker compose "$@"
  elif command -v docker-compose >/dev/null 2>&1; then
    docker-compose "$@"
  else
    echo "docker compose is not available" >&2
    return 1
  fi
}

install_docker_if_needed() {
  if command -v docker >/dev/null 2>&1 && (docker compose version >/dev/null 2>&1 || command -v docker-compose >/dev/null 2>&1); then
    log "Docker already installed"
    return
  fi

  log "Installing Docker (official script)..."
  run_as_root "curl -fsSL https://get.docker.com | sh"

  if [ "${EUID}" -ne 0 ]; then
    run_as_root "usermod -aG docker ${USER}" || true
    warn "Current user added to docker group. You may need to re-login later."
  fi
}

prepare_repo() {
  if [ -d "$APP_DIR/.git" ]; then
    log "Repository exists, updating..."
    git -C "$APP_DIR" fetch origin "$BRANCH"
    git -C "$APP_DIR" checkout "$BRANCH"
    git -C "$APP_DIR" pull --ff-only origin "$BRANCH"
  else
    log "Cloning repository into $APP_DIR"
    run_as_root "mkdir -p $(dirname "$APP_DIR")"
    git clone --branch "$BRANCH" "$REPO_URL" "$APP_DIR"
  fi
}

init_env() {
  cd "$APP_DIR"
  if [ ! -f .env ]; then
    cp .env.example .env
    log "Created .env from .env.example"
  fi

  local host_ip
  host_ip="$(hostname -I 2>/dev/null | awk '{print $1}')"
  [ -n "$host_ip" ] || host_ip="127.0.0.1"

  local nextauth_url="${APP_URL:-http://${host_ip}:3000}"
  local nextauth_secret encryption_key jobs_secret pg_pass redis_pass
  nextauth_secret="$(openssl rand -base64 32)"
  encryption_key="$(openssl rand -base64 32)"
  jobs_secret="$(openssl rand -hex 24)"
  pg_pass="$(openssl rand -hex 12)"
  redis_pass="$(openssl rand -hex 12)"

  sed -i.bak \
    -e "s|^NEXTAUTH_URL=.*|NEXTAUTH_URL=${nextauth_url}|" \
    -e "s|^NEXTAUTH_SECRET=.*|NEXTAUTH_SECRET=${nextauth_secret}|" \
    -e "s|^EMBYPANEL_ENCRYPTION_KEY=.*|EMBYPANEL_ENCRYPTION_KEY=${encryption_key}|" \
    -e "s|^INTERNAL_JOBS_SECRET=.*|INTERNAL_JOBS_SECRET=${jobs_secret}|" \
    -e "s|^POSTGRES_PASSWORD=.*|POSTGRES_PASSWORD=${pg_pass}|" \
    -e "s|^REDIS_PASSWORD=.*|REDIS_PASSWORD=${redis_pass}|" \
    .env

  rm -f .env.bak
}

wait_for_postgres() {
  log "Waiting for PostgreSQL..."
  for _ in $(seq 1 40); do
    if dc exec -T db pg_isready -U "$(grep -E '^POSTGRES_USER=' .env | cut -d= -f2)" >/dev/null 2>&1; then
      return 0
    fi
    sleep 2
  done
  echo "PostgreSQL did not become ready in time." >&2
  return 1
}

main() {
  need_cmd curl
  need_cmd git
  need_cmd openssl

  install_docker_if_needed
  prepare_repo
  cd "$APP_DIR"
  init_env

  log "Starting database and redis..."
  dc up -d db redis
  wait_for_postgres

  log "Building and starting web service..."
  dc up -d --build web

  log "Applying database migrations..."
  dc run --rm web npx prisma migrate deploy

  log "Starting worker..."
  dc up -d worker

  log "Deployment complete."
  dc ps
  echo
  log "Open your panel URL from .env NEXTAUTH_URL"
  log "Config file: $APP_DIR/.env"
}

main "$@"
