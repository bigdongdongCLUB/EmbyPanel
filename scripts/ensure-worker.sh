#!/bin/zsh
set -euo pipefail

ROOT="/Users/bdd-macmini/Documents/workspeace/EmbyPanel"
LOG="$ROOT/data/logs/worker-anomaly-scan.log"
LOCKDIR="$ROOT/data/logs/worker-anomaly-scan.lockdir"

mkdir -p "$ROOT/data/logs"

# 单实例锁（macOS 无 flock，使用 mkdir 原子锁）
if ! mkdir "$LOCKDIR" 2>/dev/null; then
  exit 0
fi
trap 'rmdir "$LOCKDIR" >/dev/null 2>&1 || true' EXIT

cd "$ROOT"

# 进程存活就退出
if pgrep -f "node scripts/worker-anomaly-scan.js" >/dev/null; then
  exit 0
fi

# 拉起 worker（run-worker.sh 会加载 .env）
nohup ./scripts/run-worker.sh >> "$LOG" 2>&1 &
