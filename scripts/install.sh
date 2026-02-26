#!/usr/bin/env bash
set -euo pipefail

REPO_URL="${REPO_URL:-https://github.com/bigdongdongCLUB/EmbyPanel.git}"
BRANCH="${BRANCH:-main}"
APP_DIR="${APP_DIR:-/opt/embypanel}"
APP_URL="${APP_URL:-}"
WEB_PORT="${WEB_PORT:-3000}"
POSTGRES_PORT="${POSTGRES_PORT:-5432}"
REDIS_PORT="${REDIS_PORT:-6379}"

log() { printf "\033[1;34m[EmbyPanel]\033[0m %s\n" "$*"; }
warn() { printf "\033[1;33m[警告]\033[0m %s\n" "$*"; }
ok() { printf "\033[1;32m[成功]\033[0m %s\n" "$*"; }

print_banner() {
  cat <<'EOF'
====================================================
           EmbyPanel 一键安装脚本（中文向导）
====================================================
EOF
}

need_cmd() {
  command -v "$1" >/dev/null 2>&1 || {
    echo "缺少必要命令: $1" >&2
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
    echo "docker compose 不可用" >&2
    return 1
  fi
}

has_tty() {
  [ -e /dev/tty ] && [ -r /dev/tty ] && [ -w /dev/tty ]
}

prompt_with_default() {
  local prompt="$1"
  local def="$2"
  local ans=""

  if has_tty; then
    printf "%s（回车默认：%s）：" "$prompt" "$def" > /dev/tty
    IFS= read -r ans < /dev/tty || true
  fi

  if [ -z "${ans}" ]; then
    ans="$def"
  fi
  printf "%s" "$ans"
}

interactive_config() {
  if ! has_tty; then
    log "未检测到交互终端，使用默认参数。"
    return
  fi

  printf "\n==== 安装参数配置 ====\n" > /dev/tty
  APP_DIR="$(prompt_with_default '请输入安装目录' "$APP_DIR")"
  WEB_PORT="$(prompt_with_default '请输入 Web 端口' "$WEB_PORT")"
  POSTGRES_PORT="$(prompt_with_default '请输入 PostgreSQL 端口' "$POSTGRES_PORT")"
  REDIS_PORT="$(prompt_with_default '请输入 Redis 端口' "$REDIS_PORT")"

  local default_url=""
  local host_ip
  host_ip="$(hostname -I 2>/dev/null | awk '{print $1}')"
  [ -n "$host_ip" ] || host_ip="127.0.0.1"
  default_url="http://${host_ip}:${WEB_PORT}"
  APP_URL="$(prompt_with_default '请输入对外访问地址 NEXTAUTH_URL（可用域名）' "${APP_URL:-$default_url}")"

  printf "\n已确认参数：\n" > /dev/tty
  printf "%s\n" "- 安装目录: $APP_DIR" > /dev/tty
  printf "%s\n" "- Web端口: $WEB_PORT" > /dev/tty
  printf "%s\n" "- PostgreSQL端口: $POSTGRES_PORT" > /dev/tty
  printf "%s\n" "- Redis端口: $REDIS_PORT" > /dev/tty
  printf "%s\n\n" "- NEXTAUTH_URL: $APP_URL" > /dev/tty
}

format_version_from_count() {
  local count="$1"
  local major=$((count / 10000))
  local minor=$(((count % 10000) / 100))
  local patch=$((count % 100))
  printf 'v%02d.%02d.%02d' "$major" "$minor" "$patch"
}

install_docker_if_needed() {
  if command -v docker >/dev/null 2>&1 && (docker compose version >/dev/null 2>&1 || command -v docker-compose >/dev/null 2>&1); then
    ok "Docker / Compose 已安装"
    return
  fi

  log "正在安装 Docker（官方脚本）..."
  run_as_root "curl -fsSL https://get.docker.com | sh"

  if [ "${EUID}" -ne 0 ]; then
    run_as_root "usermod -aG docker ${USER}" || true
    warn "已将当前用户加入 docker 组，可能需要重新登录后生效。"
  fi
}

prepare_repo() {
  if [ -d "$APP_DIR/.git" ]; then
    log "检测到已有仓库，正在更新..."
    git -C "$APP_DIR" fetch origin "$BRANCH"
    git -C "$APP_DIR" checkout "$BRANCH"
    git -C "$APP_DIR" pull --ff-only origin "$BRANCH"
  else
    log "正在克隆仓库到 $APP_DIR"
    run_as_root "mkdir -p $(dirname "$APP_DIR")"
    git clone --branch "$BRANCH" "$REPO_URL" "$APP_DIR"
  fi
}

init_env() {
  cd "$APP_DIR"
  if [ ! -f .env ]; then
    if [ -f .env.example ]; then
      cp .env.example .env
      ok "已基于 .env.example 生成 .env"
    else
      cat > .env <<'EOF'
WEB_PORT=3000
POSTGRES_USER=embypanel
POSTGRES_PASSWORD=change_me
POSTGRES_DB=embypanel
POSTGRES_PORT=5432
REDIS_PASSWORD=change_me
REDIS_PORT=6379
DATABASE_URL=postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@db:5432/${POSTGRES_DB}
REDIS_URL=redis://:${REDIS_PASSWORD}@redis:6379
NEXTAUTH_URL=http://localhost:${WEB_PORT}
NEXTAUTH_SECRET=change_me_base64_32bytes
EMBYPANEL_ENCRYPTION_KEY=change_me_base64_32bytes
INTERNAL_JOBS_SECRET=change_me
NEXT_PUBLIC_APP_VERSION=v00.00.00
EOF
      ok "未找到 .env.example，已使用内置模板生成 .env"
    fi
  fi

  local host_ip
  host_ip="$(hostname -I 2>/dev/null | awk '{print $1}')"
  [ -n "$host_ip" ] || host_ip="127.0.0.1"

  local nextauth_url="${APP_URL:-http://${host_ip}:${WEB_PORT}}"
  local nextauth_secret encryption_key jobs_secret pg_pass redis_pass app_version commit_count
  nextauth_secret="$(openssl rand -base64 32)"
  encryption_key="$(openssl rand -base64 32)"
  jobs_secret="$(openssl rand -hex 24)"
  pg_pass="$(openssl rand -hex 12)"
  redis_pass="$(openssl rand -hex 12)"
  commit_count="$(git rev-list --count HEAD 2>/dev/null || echo 0)"
  app_version="$(format_version_from_count "${commit_count:-0}")"

  sed -i.bak \
    -e "s|^WEB_PORT=.*|WEB_PORT=${WEB_PORT}|" \
    -e "s|^POSTGRES_PORT=.*|POSTGRES_PORT=${POSTGRES_PORT}|" \
    -e "s|^REDIS_PORT=.*|REDIS_PORT=${REDIS_PORT}|" \
    -e "s|^NEXTAUTH_URL=.*|NEXTAUTH_URL=${nextauth_url}|" \
    -e "s|^NEXTAUTH_SECRET=.*|NEXTAUTH_SECRET=${nextauth_secret}|" \
    -e "s|^EMBYPANEL_ENCRYPTION_KEY=.*|EMBYPANEL_ENCRYPTION_KEY=${encryption_key}|" \
    -e "s|^INTERNAL_JOBS_SECRET=.*|INTERNAL_JOBS_SECRET=${jobs_secret}|" \
    -e "s|^POSTGRES_PASSWORD=.*|POSTGRES_PASSWORD=${pg_pass}|" \
    -e "s|^REDIS_PASSWORD=.*|REDIS_PASSWORD=${redis_pass}|" \
    -e "s|^NEXT_PUBLIC_APP_VERSION=.*|NEXT_PUBLIC_APP_VERSION=${app_version}|" \
    .env

  if ! grep -q '^NEXT_PUBLIC_APP_VERSION=' .env; then
    echo "NEXT_PUBLIC_APP_VERSION=${app_version}" >> .env
  fi

  rm -f .env.bak
  ok "环境变量已初始化"
}

wait_for_postgres() {
  log "等待 PostgreSQL 就绪..."
  for _ in $(seq 1 50); do
    if dc exec -T db pg_isready -U "$(grep -E '^POSTGRES_USER=' .env | cut -d= -f2)" >/dev/null 2>&1; then
      ok "PostgreSQL 已就绪"
      return 0
    fi
    sleep 2
  done
  echo "PostgreSQL 等待超时。" >&2
  return 1
}

main() {
  print_banner

  need_cmd curl
  need_cmd git
  need_cmd openssl

  interactive_config
  install_docker_if_needed
  prepare_repo
  cd "$APP_DIR"
  init_env

  log "启动数据库与 Redis..."
  dc up -d db redis
  wait_for_postgres

  log "构建并启动 Web 服务..."
  dc up -d --build web

  log "执行数据库迁移..."
  dc run --rm web npx prisma migrate deploy

  log "启动 Worker..."
  dc up -d worker

  ok "部署完成"
  dc ps
  echo
  log "访问地址：$(grep -E '^NEXTAUTH_URL=' .env | cut -d= -f2-)"
  log "配置文件：$APP_DIR/.env"
}

main "$@"
