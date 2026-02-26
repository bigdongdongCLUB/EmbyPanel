#!/usr/bin/env bash
set -euo pipefail

INSTALL_CACHE_FILE="${INSTALL_CACHE_FILE:-/var/lib/embypanel-installer/install.env}"
APP_DIR=""

log() { printf "\033[1;34m[EmbyPanel]\033[0m %s\n" "$*"; }
warn() { printf "\033[1;33m[警告]\033[0m %s\n" "$*"; }
ok() { printf "\033[1;32m[成功]\033[0m %s\n" "$*"; }

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
  [ -n "$ans" ] || ans="$def"
  printf "%s" "$ans"
}

load_app_dir_from_cache() {
  if [ -f "$INSTALL_CACHE_FILE" ]; then
    APP_DIR="$(grep -E '^APP_DIR=' "$INSTALL_CACHE_FILE" | tail -n1 | cut -d= -f2-)"
  fi

  if [ -z "$APP_DIR" ]; then
    for d in /opt/embypanel /home/docker/embypanel; do
      if [ -f "$d/docker-compose.yml" ]; then
        APP_DIR="$d"
        break
      fi
    done
  fi

  if [ -z "$APP_DIR" ]; then
    echo "未找到安装缓存：$INSTALL_CACHE_FILE，且未识别常见安装目录。" >&2
    echo "请先运行安装脚本一次以写入缓存。" >&2
    exit 1
  fi
}

confirm_phrase() {
  local phrase="$1"
  local got=""
  if has_tty; then
    printf "请输入确认词【%s】继续：" "$phrase" > /dev/tty
    IFS= read -r got < /dev/tty || true
  fi
  [ "$got" = "$phrase" ] || {
    echo "确认词不匹配，已取消。"
    exit 1
  }
}

print_banner() {
  cat <<'EOF'
====================================================
          EmbyPanel 卸载脚本（中文询问向导）
====================================================
EOF
}

main() {
  print_banner
  load_app_dir_from_cache

  log "检测到安装目录：$APP_DIR"
  if [ ! -d "$APP_DIR" ]; then
    warn "安装目录不存在，可能已被删除。"
    exit 1
  fi

  cd "$APP_DIR"
  if [ ! -f docker-compose.yml ]; then
    warn "目录中未找到 docker-compose.yml，无法执行卸载。"
    exit 1
  fi

  cat > /dev/tty <<'EOF'

请选择卸载模式：
1) 仅停止服务（保留所有数据和配置文件）
2) 停止服务并删除数据（删除数据库、Redis 等数据；保留配置文件）
3) 完全卸载（删除所有文件、数据和缓存）
EOF

  local choice
  choice="$(prompt_with_default '请输入选项' '1')"

  case "$choice" in
    1)
      log "执行：仅停止服务"
      dc stop
      ok "服务已停止，数据与配置均保留。"
      ;;
    2)
      log "执行：停止服务并删除数据"
      confirm_phrase "DELETE_DATA"
      dc down --remove-orphans
      run_as_root "rm -rf '$APP_DIR/data/postgres' '$APP_DIR/data/redis'"
      ok "服务已停止，数据库/Redis 数据已删除，配置文件保留。"
      ;;
    3)
      log "执行：完全卸载"
      confirm_phrase "UNINSTALL_ALL"
      dc down --remove-orphans --rmi local || true
      run_as_root "rm -rf '$APP_DIR'"
      run_as_root "rm -f '$INSTALL_CACHE_FILE'"
      ok "已完全卸载：文件、数据、缓存均已删除。"
      ;;
    *)
      echo "无效选项：$choice" >&2
      exit 1
      ;;
  esac
}

main "$@"
