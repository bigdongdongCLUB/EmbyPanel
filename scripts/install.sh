#!/usr/bin/env bash
set -euo pipefail

REPO_URL="${REPO_URL:-https://github.com/bigdongdongCLUB/EmbyPanel.git}"
BRANCH="${BRANCH:-main}"
APP_DIR="${APP_DIR:-/opt/embypanel}"
APP_URL="${APP_URL:-}"
WEB_PORT="${WEB_PORT:-3000}"
POSTGRES_PORT="${POSTGRES_PORT:-5432}"
REDIS_PORT="${REDIS_PORT:-6379}"
INSTALL_CACHE_FILE="${INSTALL_CACHE_FILE:-/var/lib/embypanel-installer/install.env}"

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

save_install_cache() {
  local cache_dir
  cache_dir="$(dirname "$INSTALL_CACHE_FILE")"
  run_as_root "mkdir -p '$cache_dir'"
  run_as_root "cat > '$INSTALL_CACHE_FILE' <<'EOF'
APP_DIR=$APP_DIR
UPDATED_AT=$(date +%s)
EOF"
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

read_env_value() {
  local file="$1"
  local key="$2"
  [ -f "$file" ] || return 0
  grep -E "^${key}=" "$file" | tail -n1 | cut -d= -f2-
}

preload_app_dir_from_cache() {
  if [ -f "$INSTALL_CACHE_FILE" ]; then
    local cached
    cached="$(read_env_value "$INSTALL_CACHE_FILE" "APP_DIR")"
    if [ -n "$cached" ]; then
      APP_DIR="$cached"
      return 0
    fi
  fi

  # 兜底：自动探测常见目录
  for d in /home/docker/embypanel /opt/embypanel; do
    if [ -f "$d/docker-compose.yml" ] && [ -f "$d/.env" ]; then
      APP_DIR="$d"
      return 0
    fi
  done
}

load_defaults_from_existing_env() {
  local env_file="$APP_DIR/.env"
  [ -f "$env_file" ] || return 0

  WEB_PORT="$(read_env_value "$env_file" "WEB_PORT")"
  POSTGRES_PORT="$(read_env_value "$env_file" "POSTGRES_PORT")"
  REDIS_PORT="$(read_env_value "$env_file" "REDIS_PORT")"
  APP_URL="$(read_env_value "$env_file" "NEXTAUTH_URL")"

  [ -n "$WEB_PORT" ] || WEB_PORT="3000"
  [ -n "$POSTGRES_PORT" ] || POSTGRES_PORT="5432"
  [ -n "$REDIS_PORT" ] || REDIS_PORT="6379"
}

interactive_config() {
  if ! has_tty; then
    log "未检测到交互终端，使用默认参数。"
    return
  fi

  printf "\n==== 安装参数配置 ====\n" > /dev/tty
  APP_DIR="$(prompt_with_default '请输入安装目录' "$APP_DIR")"

  # 如果该目录已安装过，端口/NEXTAUTH_URL 默认值采用已有配置
  load_defaults_from_existing_env

  WEB_PORT="$(prompt_with_default '请输入 Web 端口' "$WEB_PORT")"
  POSTGRES_PORT="$(prompt_with_default '请输入 PostgreSQL 端口' "$POSTGRES_PORT")"
  REDIS_PORT="$(prompt_with_default '请输入 Redis 端口' "$REDIS_PORT")"

  local default_url=""
  local host_ip
  host_ip="$(detect_default_host_ip)"
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

version_to_int() {
  local v="$1"
  v="${v#v}"
  IFS='.' read -r a b c <<< "$v"
  a="${a:-0}"; b="${b:-0}"; c="${c:-0}"
  printf "%d" $((10#$a * 10000 + 10#$b * 100 + 10#$c))
}

compare_versions() {
  local va="${1:-v00.00.00}"
  local vb="${2:-v00.00.00}"
  local ia ib
  ia="$(version_to_int "$va")"
  ib="$(version_to_int "$vb")"
  if [ "$ia" -lt "$ib" ]; then
    printf -- "-1"
  elif [ "$ia" -gt "$ib" ]; then
    printf -- "1"
  else
    printf -- "0"
  fi
}

detect_public_ip() {
  local ip=""
  ip="$(curl -fsSL --max-time 3 https://api.ipify.org 2>/dev/null || true)"
  if [ -z "$ip" ]; then ip="$(curl -fsSL --max-time 3 https://ifconfig.me/ip 2>/dev/null || true)"; fi
  if [ -z "$ip" ]; then ip="$(curl -fsSL --max-time 3 https://ipinfo.io/ip 2>/dev/null || true)"; fi
  printf "%s" "$ip"
}

detect_default_host_ip() {
  local ip=""
  ip="$(detect_public_ip)"
  if [ -n "$ip" ]; then
    printf "%s" "$ip"
    return 0
  fi
  ip="$(hostname -I 2>/dev/null | awk '{print $1}')"
  [ -n "$ip" ] || ip="127.0.0.1"
  printf "%s" "$ip"
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

ensure_env_key() {
  local key="$1"
  local value="$2"
  if grep -q "^${key}=" .env; then
    sed -i.bak "s|^${key}=.*|${key}=${value}|" .env
  else
    echo "${key}=${value}" >> .env
  fi
}

init_env() {
  cd "$APP_DIR"
  local fresh_install=0
  if [ ! -f .env ]; then
    fresh_install=1
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
  host_ip="$(detect_default_host_ip)"

  local nextauth_url="${APP_URL:-http://${host_ip}:${WEB_PORT}}"
  local app_version commit_count
  commit_count="$(git rev-list --count HEAD 2>/dev/null || echo 0)"
  app_version="$(format_version_from_count "${commit_count:-0}")"

  # 基础可配置项：安装/升级都允许更新
  ensure_env_key "WEB_PORT" "$WEB_PORT"
  ensure_env_key "POSTGRES_PORT" "$POSTGRES_PORT"
  ensure_env_key "REDIS_PORT" "$REDIS_PORT"
  ensure_env_key "NEXTAUTH_URL" "$nextauth_url"
  ensure_env_key "NEXT_PUBLIC_APP_VERSION" "$app_version"

  # 首装才随机生成敏感信息；升级不覆盖已有密钥
  if [ "$fresh_install" -eq 1 ]; then
    ensure_env_key "NEXTAUTH_SECRET" "$(openssl rand -base64 32)"
    ensure_env_key "EMBYPANEL_ENCRYPTION_KEY" "$(openssl rand -base64 32)"
    ensure_env_key "INTERNAL_JOBS_SECRET" "$(openssl rand -hex 24)"
    ensure_env_key "POSTGRES_PASSWORD" "$(openssl rand -hex 12)"
    ensure_env_key "REDIS_PASSWORD" "$(openssl rand -hex 12)"
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

ensure_uploads_dir_permissions() {
  # 文档图片上传目录（与 docker-compose 挂载一致）
  run_as_root "mkdir -p '$APP_DIR/data/uploads'"
  # 容器内 web 进程 uid=1001（nextjs）
  run_as_root "chown -R 1001:1001 '$APP_DIR/data/uploads'"
  run_as_root "chmod -R 775 '$APP_DIR/data/uploads'"
  ok "已确保上传目录权限：$APP_DIR/data/uploads"
}

check_nginx_uploads_mapping() {
  # 仅提示，不强改用户 nginx
  local conf=""
  if [ -f /etc/nginx/sites-enabled/panel.bestemby.com.conf ]; then
    conf="/etc/nginx/sites-enabled/panel.bestemby.com.conf"
  elif [ -f /etc/nginx/sites-available/panel.bestemby.com.conf ]; then
    conf="/etc/nginx/sites-available/panel.bestemby.com.conf"
  fi

  if [ -n "$conf" ]; then
    if grep -q "location /uploads/" "$conf" && grep -q "alias /opt/embypanel/data/uploads/;" "$conf"; then
      ok "Nginx 已检测到 /uploads 静态映射"
    else
      warn "检测到 Nginx，但未发现 /uploads 静态映射，文档图片可能 404。"
      warn "请在 Nginx 对应 server 块加入："
      echo "location /uploads/ {"
      echo "    alias /opt/embypanel/data/uploads/;"
      echo "    access_log off;"
      echo "    expires 30d;"
      echo "    add_header Cache-Control \"public, max-age=2592000\";"
      echo "    try_files \$uri =404;"
      echo "}"
    fi
  fi
}

run_integrity_checks() {
  log "执行完整性/功能性（健康）检查..."

  if ! dc ps >/dev/null 2>&1; then
    warn "docker compose 状态读取失败（将继续）"
  else
    ok "docker compose 状态读取正常"
  fi

  if [ -f "$APP_DIR/.env" ]; then
    for k in NEXTAUTH_URL NEXTAUTH_SECRET EMBYPANEL_ENCRYPTION_KEY POSTGRES_PASSWORD REDIS_PASSWORD; do
      if ! grep -q "^${k}=" "$APP_DIR/.env"; then
        warn "缺少关键配置：${k}"
      fi
    done

    local check_url
    check_url="$(read_env_value "$APP_DIR/.env" "NEXTAUTH_URL")"
    if [ -n "$check_url" ]; then
      if curl -fsSL --max-time 8 "${check_url%/}/api/public/security-settings" >/dev/null 2>&1; then
        ok "Web 健康检查通过：${check_url%/}/api/public/security-settings"
      else
        warn "Web 健康检查失败：${check_url%/}/api/public/security-settings"
      fi
    fi
  fi
}

main() {
  print_banner

  need_cmd curl
  need_cmd git
  need_cmd openssl

  preload_app_dir_from_cache
  interactive_config
  install_docker_if_needed

  local installed_before=0 current_version="v00.00.00"
  if [ -d "$APP_DIR/.git" ] || [ -f "$APP_DIR/.env" ]; then
    installed_before=1
    current_version="$(read_env_value "$APP_DIR/.env" "NEXT_PUBLIC_APP_VERSION")"
    [ -n "$current_version" ] || current_version="v00.00.00"
    log "检测到已安装 EmbyPanel，当前版本：${current_version}"
  else
    log "未检测到历史安装，将执行首次安装流程。"
  fi

  prepare_repo
  cd "$APP_DIR"

  local commit_count target_version
  commit_count="$(git rev-list --count HEAD 2>/dev/null || echo 0)"
  target_version="$(format_version_from_count "${commit_count:-0}")"

  if [ "$installed_before" -eq 1 ]; then
    local cmp
    cmp="$(compare_versions "$current_version" "$target_version")"

    if [ "$cmp" = "0" ]; then
      log "版本校对：${current_version} → ${target_version}（版本一致）"
      run_integrity_checks
      save_install_cache
      ok "当前已是最新版本，仅完成健康检查。"
      exit 0
    elif [ "$cmp" = "-1" ]; then
      log "版本校对：${current_version} → ${target_version}（检测到新版本，执行升级）"
    else
      warn "版本校对：${current_version} → ${target_version}（当前版本高于仓库版本，跳过升级）"
      run_integrity_checks
      save_install_cache
      ok "已完成健康检查。"
      exit 0
    fi
  fi

  init_env
  ensure_uploads_dir_permissions

  log "启动数据库与 Redis..."
  dc up -d db redis
  wait_for_postgres

  log "构建并启动 Web（Worker 复用同一镜像）..."
  dc build web
  dc up -d web worker

  log "执行数据库迁移..."
  dc run --rm web npx prisma migrate deploy

  run_integrity_checks
  check_nginx_uploads_mapping
  save_install_cache

  ok "部署/升级完成"
  dc ps
  echo
  log "访问地址：$(grep -E '^NEXTAUTH_URL=' .env | cut -d= -f2-)"
  log "配置文件：$APP_DIR/.env"
  log "安装缓存：$INSTALL_CACHE_FILE"
}

main "$@"
