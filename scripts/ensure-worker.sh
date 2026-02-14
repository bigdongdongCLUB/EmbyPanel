#!/bin/zsh
set -euo pipefail

ROOT="/Users/bdd-macmini/Documents/workspeace/EmbyPanel"
LOG="$ROOT/data/logs/worker-anomaly-scan.log"
LOCK="$ROOT/data/logs/worker-anomaly-scan.lock"

mkdir -p "$ROOT/data/logs"

# 单实例锁，避免并发拉起
exec 9>"$LOCK"
if ! /usr/bin/flock -n 9; then
  exit 0
fi

cd "$ROOT"

# 进程存活就退出
if pgrep -f "node scripts/worker-anomaly-scan.js" >/dev/null; then
  exit 0
fi

# 拉起 worker（run-worker.sh 会加载 .env）
nohup ./scripts/run-worker.sh >> "$LOG" 2>&1 &
