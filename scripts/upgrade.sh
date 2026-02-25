#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/embypanel}"
BRANCH="${BRANCH:-main}"

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

log() { printf "\033[1;34m[EmbyPanel]\033[0m %s\n" "$*"; }

format_version_from_count() {
  local count="$1"
  local major=$((count / 10000))
  local minor=$(((count % 10000) / 100))
  local patch=$((count % 100))
  printf 'v%02d.%02d.%02d' "$major" "$minor" "$patch"
}

if [ ! -d "$APP_DIR/.git" ]; then
  echo "Project not found at $APP_DIR" >&2
  exit 1
fi

cd "$APP_DIR"

log "Pulling latest code ($BRANCH)..."
git fetch origin "$BRANCH"
git checkout "$BRANCH"
git pull --ff-only origin "$BRANCH"

commit_count="$(git rev-list --count HEAD 2>/dev/null || echo 0)"
app_version="$(format_version_from_count "${commit_count:-0}")"
if grep -q '^NEXT_PUBLIC_APP_VERSION=' .env; then
  sed -i.bak "s|^NEXT_PUBLIC_APP_VERSION=.*|NEXT_PUBLIC_APP_VERSION=${app_version}|" .env
else
  echo "NEXT_PUBLIC_APP_VERSION=${app_version}" >> .env
fi
rm -f .env.bak
log "App version set to ${app_version}"

log "Refreshing services..."
dc up -d db redis

a=0
while [ $a -lt 30 ]; do
  if dc exec -T db pg_isready -U "$(grep -E '^POSTGRES_USER=' .env | cut -d= -f2)" >/dev/null 2>&1; then
    break
  fi
  a=$((a+1))
  sleep 2
done

log "Rebuilding web and worker..."
dc up -d --build web worker

log "Running migrations..."
dc run --rm web npx prisma migrate deploy

log "Upgrade done."
dc ps
