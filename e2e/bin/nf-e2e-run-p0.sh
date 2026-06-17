#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SERVER="${SERVER:-nexusflow}"
REMOTE_PORT="${REMOTE_PORT:-8089}"
LOCAL_PORT="${LOCAL_PORT:-18089}"
BASE_URL="${BASE_URL:-http://127.0.0.1:$LOCAL_PORT}"
PASSWORD="${PASSWORD:-1}"

RUN_DIR="${1:-}"
if [[ -z "$RUN_DIR" ]]; then
  RUN_DIR="$(BASE_URL="$BASE_URL" "$ROOT_DIR/e2e/bin/nf-e2e-new-run.sh")"
fi
mkdir -p "$RUN_DIR"
RESULTS_NDJSON="$RUN_DIR/results.ndjson"
: > "$RESULTS_NDJSON"

roles=(
  "E2E-00-002:Anner:sa"
  "E2E-00-010:nf_sysadmin:admin"
  "E2E-00-011:nf_center_lead:center_lead"
  "E2E-00-012:nf_center_deputy:center_deputy"
  "E2E-00-013:nf_dept_lead:dept_lead"
  "E2E-00-014:nf_dept_deputy:dept_deputy"
  "E2E-00-015:nf_project_owner:project_owner"
  "E2E-00-016:nf_task_owner:task_owner"
  "E2E-00-017:nf_employee:employee"
  "E2E-00-018:nf_pending:pending"
  "E2E-00-019:nf_hidden_denied:employee"
  "E2E-00-020:nf_hidden_allowed:employee"
)

ensure_tunnel() {
  if curl -fsS "$BASE_URL/healthz" >/dev/null 2>&1; then
    return
  fi
  ssh -f -N -L "127.0.0.1:$LOCAL_PORT:127.0.0.1:$REMOTE_PORT" "$SERVER"
  for _ in $(seq 1 20); do
    if curl -fsS "$BASE_URL/healthz" >/dev/null 2>&1; then
      return
    fi
    sleep 0.5
  done
  echo "failed to open SSH tunnel to $SERVER:$REMOTE_PORT" >&2
  exit 1
}

json_escape() {
  jq -Rn --arg v "$1" '$v'
}

record_case() {
  local case_id="$1"
  local status="$2"
  local case_dir="$3"
  local api_file="$4"
  local notes="$5"
  local screenshots_json
  screenshots_json="$(find "$case_dir" -maxdepth 1 -type f -name '*.png' -print | sort | jq -R -s -c 'split("\n")[:-1]')"
  jq -cn \
    --arg case_id "$case_id" \
    --arg status "$status" \
    --arg case_dir "$case_dir" \
    --arg api_file "$api_file" \
    --arg notes "$notes" \
    --argjson screenshots "$screenshots_json" \
    '{case_id:$case_id,status:$status,case_dir:$case_dir,screenshots:$screenshots,api_evidence:[$api_file],notes:$notes}' >> "$RESULTS_NDJSON"
}

request_json() {
  local method="$1"
  local url="$2"
  local out="$3"
  local body="${4:-}"
  local token="${5:-}"
  local headers=(-H "Content-Type: application/json")
  if [[ -n "$token" ]]; then
    headers+=(-H "Authorization: Bearer $token")
  fi
  if [[ -n "$body" ]]; then
    curl -sS -w '\n%{http_code}' -X "$method" "$url" "${headers[@]}" -d "$body" > "$out.raw"
  else
    curl -sS -w '\n%{http_code}' -X "$method" "$url" "${headers[@]}" > "$out.raw"
  fi
  local status
  status="$(tail -n 1 "$out.raw")"
  sed '$d' "$out.raw" > "$out.body"
  jq -n \
    --argjson body "$(cat "$out.body")" \
    --arg status "$status" \
    '{status:($status|tonumber), body:$body}' > "$out"
  rm -f "$out.raw" "$out.body"
}

write_results_md() {
  local md="$RUN_DIR/results.md"
  {
    sed -n '1,/| E2E-00-001 |/p' "$ROOT_DIR/e2e/result-template.md" | sed '$d'
    jq -r '. | "| \(.case_id) | \(.status) | \(.case_dir) | \(.api_evidence[0]) | \(.notes) |"' "$RESULTS_NDJSON"
  } > "$md"
}

capture_browser_smoke() {
  local case_id="E2E-00-002"
  local case_dir="$RUN_DIR/$case_id"
  mkdir -p "$case_dir"
  if ! command -v agent-browser >/dev/null 2>&1; then
    record_case "$case_id-browser" "BLOCKED_BY_DATA" "$case_dir" "$case_dir/browser.json" "agent-browser command not found"
    jq -n '{status:"missing agent-browser"}' > "$case_dir/browser.json"
    return
  fi
  set +e
  agent-browser open "$BASE_URL/login" >/dev/null 2>&1
  agent-browser wait --load networkidle >/dev/null 2>&1
  agent-browser cookies clear >/dev/null 2>&1
  agent-browser storage local clear >/dev/null 2>&1
  agent-browser open "$BASE_URL/login" >/dev/null 2>&1
  agent-browser wait --load networkidle >/dev/null 2>&1
  agent-browser screenshot "$case_dir/01-login.png" >/dev/null 2>&1
  agent-browser snapshot -i > "$case_dir/02-login-snapshot.txt" 2>&1
  agent-browser fill @e1 Anner >/dev/null 2>&1
  agent-browser fill @e2 "$PASSWORD" >/dev/null 2>&1
  agent-browser click @e3 >/dev/null 2>&1
  agent-browser wait --url '**/' >/dev/null 2>&1
  agent-browser screenshot "$case_dir/03-after-login.png" >/dev/null 2>&1
  local browser_status=$?
  set -e
  if [[ "$browser_status" -eq 0 ]]; then
    jq -n '{status:"PASS", screenshots:["01-login.png","03-after-login.png"], snapshot:"02-login-snapshot.txt"}' > "$case_dir/browser.json"
  else
    jq -n '{status:"FAIL_UI", notes:"agent-browser login page smoke failed"}' > "$case_dir/browser.json"
  fi
}

run_health() {
  local case_dir="$RUN_DIR/E2E-00-001"
  mkdir -p "$case_dir"
  curl -sS "$BASE_URL/healthz" > "$case_dir/healthz.json"
  curl -sS "$BASE_URL/readyz" > "$case_dir/readyz.json"
  local health ready
  health="$(jq -r '.status // empty' "$case_dir/healthz.json")"
  ready="$(jq -r '.status // empty' "$case_dir/readyz.json")"
  if [[ "$health" == "ok" && "$ready" == "ready" ]]; then
    record_case "E2E-00-001" "PASS" "$case_dir" "$case_dir/readyz.json" "healthz and readyz are healthy"
  else
    record_case "E2E-00-001" "FAIL_API" "$case_dir" "$case_dir/readyz.json" "health=$health ready=$ready"
  fi
}

run_role_login() {
  local item="$1"
  local case_id="${item%%:*}"
  local rest="${item#*:}"
  local login_name="${rest%%:*}"
  local expected_role="${rest##*:}"
  local case_dir="$RUN_DIR/$case_id"
  mkdir -p "$case_dir"

  request_json POST "$BASE_URL/api/auth/login" "$case_dir/api-login.json" "{\"login_name\":\"$login_name\",\"password\":\"$PASSWORD\"}"
  local status token
  status="$(jq -r '.status' "$case_dir/api-login.json")"
  token="$(jq -r '.body.token // empty' "$case_dir/api-login.json")"
  if [[ "$status" != "200" || -z "$token" ]]; then
    record_case "$case_id" "BLOCKED_BY_DATA" "$case_dir" "$case_dir/api-login.json" "$login_name login failed with HTTP $status"
    return
  fi

  request_json GET "$BASE_URL/api/auth/me" "$case_dir/api-me.json" "" "$token"
  request_json GET "$BASE_URL/api/permissions/me" "$case_dir/api-permissions.json" "" "$token"
  local has_role
  has_role="$(jq -r --arg role "$expected_role" '.body.user.role_codes // [] | index($role) != null' "$case_dir/api-me.json")"
  if [[ "$has_role" == "true" ]]; then
    record_case "$case_id" "PASS" "$case_dir" "$case_dir/api-permissions.json" "$login_name has expected role $expected_role"
  else
    record_case "$case_id" "FAIL_API" "$case_dir" "$case_dir/api-me.json" "$login_name missing expected role $expected_role"
  fi
}

run_disabled_login() {
  local case_id="E2E-13-004"
  local case_dir="$RUN_DIR/$case_id"
  mkdir -p "$case_dir"
  request_json POST "$BASE_URL/api/auth/login" "$case_dir/api-login-disabled.json" '{"login_name":"nf_disabled","password":"1"}'
  local status
  status="$(jq -r '.status' "$case_dir/api-login-disabled.json")"
  if [[ "$status" == "403" ]]; then
    record_case "$case_id" "PASS" "$case_dir" "$case_dir/api-login-disabled.json" "disabled account is rejected with 403"
  else
    record_case "$case_id" "FAIL_API" "$case_dir" "$case_dir/api-login-disabled.json" "expected 403 for disabled account, got HTTP $status"
  fi
}

ensure_tunnel
run_health
capture_browser_smoke
for role in "${roles[@]}"; do
  run_role_login "$role"
done
run_disabled_login
write_results_md

echo "$RUN_DIR"
echo "P0 results: $RESULTS_NDJSON"
jq -s 'group_by(.status) | map({status:.[0].status,count:length})' "$RESULTS_NDJSON"
