#!/bin/zsh
set -euo pipefail

cd /Users/bdd-macmini/Documents/workspeace/EmbyPanel

if [ -f .env ]; then
  set -a
  source .env
  set +a
fi

if command -v node >/dev/null 2>&1; then
  NODE_BIN="$(command -v node)"
elif [ -x /opt/homebrew/bin/node ]; then
  NODE_BIN="/opt/homebrew/bin/node"
else
  echo "node binary not found" >&2
  exit 78
fi

exec "$NODE_BIN" scripts/worker-anomaly-scan.js
