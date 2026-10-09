#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
HOST="${DEPLOY_HOST:-nexusflow}"; REMOTE="${REMOTE_ROOT:-/opt/nexusflow}"
PORT="${DEPLOY_PORT:-8089}"; BIN="${DEPLOY_BINARY:-$ROOT/dist/linux-x86_64/nexusflow}"
[[ -x "$BIN" ]] || { echo 'Missing binary; run make deploy-build'; exit 1; }
ssh "$HOST" "mkdir -p '$REMOTE'"
scp "$BIN" "$HOST:$REMOTE/nexusflow.new"
ssh "$HOST" "chmod +x '$REMOTE/nexusflow.new' && mv '$REMOTE/nexusflow.new' '$REMOTE/nexusflow' && sudo systemctl restart nexusflow && sudo systemctl is-active --quiet nexusflow"
for path in healthz readyz; do
  for attempt in $(seq 1 45); do
    if curl -fsS "http://101.200.138.250:$PORT/nexusflow/$path"; then break; fi
    if [[ "$attempt" == 45 ]]; then echo "${path} readiness check timed out" >&2; exit 1; fi
    sleep 1
  done
  echo
done
echo "Deployed http://101.200.138.250:$PORT/nexusflow/"
