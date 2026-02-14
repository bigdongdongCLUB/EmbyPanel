#!/bin/zsh
set -euo pipefail

ROOT="/Users/bdd-macmini/Documents/workspeace/EmbyPanel"
LOG="$ROOT/data/logs/worker-keeper.log"

mkdir -p "$ROOT/data/logs"
cd "$ROOT"

echo "[$(date '+%F %T')] worker-keeper started" >> "$LOG"

while true; do
  ./scripts/ensure-worker.sh >> "$LOG" 2>&1 || true
  sleep 60
done
