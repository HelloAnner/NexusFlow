#!/usr/bin/env bash
set -euo pipefail

SERVER="${1:-nexusflow}"
REMOTE_DIR="${2:-/opt/nexusflow/src}"
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

cd "$ROOT_DIR"

echo "[deploy] building frontend locally"
if command -v bun >/dev/null 2>&1; then
  (cd "$ROOT_DIR/frontend" && bun install --frozen-lockfile && bun run build)
else
  (cd "$ROOT_DIR/frontend" && npm ci && npm run build)
fi

echo "[deploy] refreshing Rust vendor dependencies for offline server build"
(cd "$ROOT_DIR/backend" && cargo vendor vendor >/dev/null)

echo "[deploy] checking base services on $SERVER"
if ssh "$SERVER" "docker ps --filter name=nexusflow-postgres --filter status=running --format '{{.Names}}' | grep -q nexusflow-postgres && docker ps --filter name=nexusflow-redis --filter status=running --format '{{.Names}}' | grep -q nexusflow-redis && docker ps --filter name=nexusflow-minio --filter status=running --format '{{.Names}}' | grep -q nexusflow-minio"; then
  echo "[deploy] base service containers already running"
else
  echo "[deploy] provisioning base services on $SERVER"
  ./scripts/provision_server.sh "$SERVER"
fi

echo "[deploy] syncing source to $SERVER:$REMOTE_DIR"
ssh "$SERVER" "mkdir -p '$REMOTE_DIR'"
rsync -az --delete \
  --exclude '.git/' \
  --exclude '.playwright-mcp/' \
  --exclude 'backend/target/' \
  --exclude 'frontend/node_modules/' \
  --exclude 'screenshots/' \
  --exclude 'exports/' \
  --exclude 'frontend_preview*.png' \
  --exclude 'frontend_*_check.png' \
  --exclude 'page_summaries.txt' \
  --exclude 'page_summary_*.txt' \
  "$ROOT_DIR"/ "$SERVER":"$REMOTE_DIR"/

echo "[deploy] building single binary on server"
ssh "$SERVER" "cd '$REMOTE_DIR' && chmod +x scripts/*.sh && ./scripts/build_release.sh"

echo "[deploy] restarting nexusflow"
ssh "$SERVER" "systemctl daemon-reload && systemctl enable --now nexusflow && systemctl restart nexusflow && sleep 2 && systemctl status nexusflow --no-pager -l"

echo "[deploy] health check"
ssh "$SERVER" "curl -fsS http://127.0.0.1:8089/healthz && echo && curl -fsS http://127.0.0.1:8089/readyz && echo"
