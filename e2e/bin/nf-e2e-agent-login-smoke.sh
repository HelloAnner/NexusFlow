#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${BASE_URL:-http://127.0.0.1:8089}"
RUN_DIR="${1:?usage: nf-e2e-agent-login-smoke.sh e2e/artifacts/<run-id>}"
CASE_ID="E2E-00-002"
CASE_DIR="$RUN_DIR/$CASE_ID"

mkdir -p "$CASE_DIR"

agent-browser open "$BASE_URL/login"
agent-browser wait --load networkidle
agent-browser screenshot "$CASE_DIR/01-login-page.png"
agent-browser snapshot -i > "$CASE_DIR/02-login-snapshot.txt"

cat > "$CASE_DIR/MANUAL_NEXT_STEPS.md" <<'EOF'
# Manual next steps

Use the refs from `02-login-snapshot.txt`:

1. Fill login account with `Anner`.
2. Fill password with `1`.
3. Click login.
4. Wait for URL `**/`.
5. Save `03-after-login.png`.
6. Run API login and `auth/me` verification into `api-login.json` and `api-me.json`.

This smoke script intentionally stops after collecting stable refs because `agent-browser` refs are page-runtime specific.
EOF

