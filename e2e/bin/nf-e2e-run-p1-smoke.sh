#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SERVER="${SERVER:-nexusflow}"
REMOTE_PORT="${REMOTE_PORT:-8089}"
LOCAL_PORT="${LOCAL_PORT:-18089}"
BASE_URL="${BASE_URL:-http://127.0.0.1:$LOCAL_PORT}"
RUN_DIR="${1:-}"

if [[ -z "$RUN_DIR" ]]; then
  RUN_DIR="$(BASE_URL="$BASE_URL" "$ROOT_DIR/e2e/bin/nf-e2e-new-run.sh")"
fi
mkdir -p "$RUN_DIR"
RESULTS_NDJSON="$RUN_DIR/results-p1-smoke.ndjson"
: > "$RESULTS_NDJSON"

ensure_tunnel() {
  if /usr/bin/curl -fsS "$BASE_URL/healthz" >/dev/null 2>&1; then
    return
  fi
  ssh -f -N -L "127.0.0.1:$LOCAL_PORT:127.0.0.1:$REMOTE_PORT" "$SERVER"
  for _ in $(seq 1 20); do
    if /usr/bin/curl -fsS "$BASE_URL/healthz" >/dev/null 2>&1; then
      return
    fi
    sleep 0.5
  done
  echo "failed to open SSH tunnel to $SERVER:$REMOTE_PORT" >&2
  exit 1
}

record_case() {
  local case_id="$1"
  local status="$2"
  local case_dir="$3"
  local api_file="$4"
  local notes="$5"
  local screenshots_json
  screenshots_json="$(find "$case_dir" -maxdepth 1 -type f -name '*.png' -print | sort | /usr/bin/jq -R -s -c 'split("\n")[:-1]')"
  /usr/bin/jq -cn \
    --arg case_id "$case_id" \
    --arg status "$status" \
    --arg case_dir "$case_dir" \
    --arg api_file "$api_file" \
    --arg notes "$notes" \
    --argjson screenshots "$screenshots_json" \
    '{case_id:$case_id,status:$status,case_dir:$case_dir,screenshots:$screenshots,api_evidence:[$api_file],notes:$notes}' >> "$RESULTS_NDJSON"
}

login_api() {
  /usr/bin/curl -sS "$BASE_URL/api/auth/login" \
    -H 'Content-Type: application/json' \
    -d '{"login_name":"Anner","password":"1"}' | /usr/bin/jq -r '.token'
}

browser_login() {
  if ! command -v agent-browser >/dev/null 2>&1; then
    echo "agent-browser command not found" >&2
    exit 1
  fi
  agent-browser open "$BASE_URL/login" >/dev/null
  agent-browser wait --load networkidle >/dev/null
  agent-browser cookies clear >/dev/null
  agent-browser storage local clear >/dev/null
  agent-browser open "$BASE_URL/login" >/dev/null
  agent-browser wait --load networkidle >/dev/null
  agent-browser snapshot -i >/tmp/nexusflow-p1-login-snapshot.txt
  agent-browser fill @e1 Anner >/dev/null
  agent-browser fill @e2 1 >/dev/null
  agent-browser click @e3 >/dev/null
  agent-browser wait --url '**/' >/dev/null
}

run_page_case() {
  local case_id="$1"
  local path="$2"
  local api_path="$3"
  local min_items="$4"
  local notes="$5"
  local token="$6"
  local case_dir="$RUN_DIR/$case_id"
  mkdir -p "$case_dir"

  agent-browser open "$BASE_URL$path" >/dev/null
  agent-browser wait --load networkidle >/dev/null
  agent-browser screenshot "$case_dir/01-page.png" >/dev/null

  local api_file="$case_dir/api-after.json"
  /usr/bin/curl -sS "$BASE_URL$api_path" -H "Authorization: Bearer $token" > "$api_file"
  local count
  count="$(/usr/bin/jq -r '.items | length' "$api_file")"
  local total
  total="$(/usr/bin/jq -r '.total // (.items | length)' "$api_file")"
  if [[ "$count" -ge "$min_items" && "$total" -ge "$min_items" ]]; then
    record_case "$case_id" "PASS" "$case_dir" "$api_file" "$notes"
  else
    record_case "$case_id" "FAIL_API" "$case_dir" "$api_file" "expected at least $min_items items, got count=$count total=$total"
  fi
}

ensure_tunnel
TOKEN="$(login_api)"
browser_login
run_page_case "E2E-01-001" "/orgs" "/api/orgs/tree" 5 "organization tree page and API loaded" "$TOKEN"
run_page_case "E2E-01-009" "/people" "/api/users?page_size=200" 10 "people list page and API loaded" "$TOKEN"
run_page_case "E2E-03-002" "/tasks" "/api/tasks?status=in_progress&page_size=20" 1 "task list status filter API loaded" "$TOKEN"
run_page_case "E2E-06-001" "/resources" "/api/resources?page_size=20" 1 "resource library page and API loaded" "$TOKEN"
run_page_case "E2E-11-001" "/projects" "/api/projects?page_size=20" 1 "project list page and API loaded" "$TOKEN"

echo "$RUN_DIR"
echo "P1 smoke results: $RESULTS_NDJSON"
/usr/bin/jq -s 'group_by(.status) | map({status:.[0].status,count:length})' "$RESULTS_NDJSON"
