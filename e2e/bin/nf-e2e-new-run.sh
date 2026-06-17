#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
RUN_ID="${1:-$(date +%Y%m%d-%H%M%S)}"
RUN_DIR="$ROOT_DIR/e2e/artifacts/$RUN_ID"

mkdir -p "$RUN_DIR"
cp "$ROOT_DIR/e2e/result-template.md" "$RUN_DIR/results.md"

cat > "$RUN_DIR/run.env" <<EOF
RUN_ID=$RUN_ID
BASE_URL=${BASE_URL:-http://127.0.0.1:8089}
SERVER_ALIAS=${SERVER_ALIAS:-nexusflow}
CREATED_AT=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
EOF

printf '%s\n' "$RUN_DIR"
