#!/bin/zsh
set -euo pipefail

cd /Users/bdd-macmini/Documents/workspeace/EmbyPanel

if [ -f .env ]; then
  set -a
  source .env
  set +a
fi

exec node scripts/worker-anomaly-scan.js
