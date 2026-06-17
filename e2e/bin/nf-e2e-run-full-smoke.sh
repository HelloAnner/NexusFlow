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
RESULTS_NDJSON="$RUN_DIR/results-full-smoke.ndjson"
: > "$RESULTS_NDJSON"

ensure_tunnel() {
  if curl -fsS "$BASE_URL/healthz" >/dev/null 2>&1; then
    return
  fi
  ssh -f -N -L "127.0.0.1:$LOCAL_PORT:127.0.0.1:$REMOTE_PORT" "$SERVER"
  for _ in $(seq 1 30); do
    if curl -fsS "$BASE_URL/healthz" >/dev/null 2>&1; then
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
  local token="${5:-$TOKEN}"
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
  if jq -e . "$out.body" >/dev/null 2>&1; then
    jq -n --arg status "$status" --slurpfile body "$out.body" '{status:($status|tonumber), body:$body[0]}' > "$out"
  else
    jq -n --arg status "$status" --rawfile body "$out.body" '{status:($status|tonumber), body_text:$body}' > "$out"
  fi
  rm -f "$out.raw" "$out.body"
}

assert_file() {
  local case_id="$1"
  local file="$2"
  local filter="$3"
  local notes="$4"
  local case_dir
  case_dir="$(dirname "$file")"
  if jq -e "$filter" "$file" >/dev/null; then
    record_case "$case_id" "PASS" "$case_dir" "$file" "$notes"
  else
    record_case "$case_id" "FAIL_API" "$case_dir" "$file" "$notes"
  fi
}

login_token() {
  local login_name="$1"
  curl -sS "$BASE_URL/api/auth/login" \
    -H 'Content-Type: application/json' \
    -d "{\"login_name\":\"$login_name\",\"password\":\"$PASSWORD\"}" | jq -r '.token // empty'
}

browser_login() {
  if ! command -v agent-browser >/dev/null 2>&1; then
    return 1
  fi
  agent-browser open "$BASE_URL/login" >/dev/null
  agent-browser wait --load networkidle >/dev/null
  agent-browser cookies clear >/dev/null
  agent-browser storage local clear >/dev/null
  agent-browser open "$BASE_URL/login" >/dev/null
  agent-browser wait --load networkidle >/dev/null
  agent-browser snapshot -i > "$RUN_DIR/browser-login-snapshot.txt"
  agent-browser fill @e1 Anner >/dev/null
  agent-browser fill @e2 "$PASSWORD" >/dev/null
  agent-browser click @e3 >/dev/null
  agent-browser wait --load networkidle >/dev/null
}

run_page_case() {
  local case_id="$1"
  local path="$2"
  local api_path="$3"
  local filter="$4"
  local notes="$5"
  local case_dir="$RUN_DIR/$case_id"
  mkdir -p "$case_dir"
  if command -v agent-browser >/dev/null 2>&1; then
    agent-browser open "$BASE_URL$path" >/dev/null
    agent-browser wait --load networkidle >/dev/null
    agent-browser screenshot "$case_dir/01-page.png" >/dev/null
  fi
  request_json GET "$BASE_URL$api_path" "$case_dir/api-after.json"
  assert_file "$case_id" "$case_dir/api-after.json" "$filter" "$notes"
}

run_write_case() {
  local case_id="$1"
  local method="$2"
  local path="$3"
  local body="$4"
  local filter="$5"
  local notes="$6"
  local case_dir="$RUN_DIR/$case_id"
  mkdir -p "$case_dir"
  request_json "$method" "$BASE_URL$path" "$case_dir/api.json" "$body"
  assert_file "$case_id" "$case_dir/api.json" "$filter" "$notes"
}

write_results_md() {
  local md="$RUN_DIR/results-full-smoke.md"
  {
    echo "# NexusFlow Full Smoke E2E"
    echo
    echo "| 用例 ID | 状态 | 截图目录 | API 证据 | 备注 |"
    echo "| --- | --- | --- | --- | --- |"
    jq -r '. | "| \(.case_id) | \(.status) | \(.case_dir) | \(.api_evidence[0]) | \(.notes) |"' "$RESULTS_NDJSON"
    echo
    echo "## 汇总"
    jq -s 'group_by(.status) | map({status:.[0].status,count:length})' "$RESULTS_NDJSON"
  } > "$md"
}

ensure_tunnel
TOKEN="$(login_token Anner)"
if [[ -z "$TOKEN" ]]; then
  echo "SA login failed" >&2
  exit 1
fi
browser_login || true

run_page_case "E2E-FULL-00-HEALTH" "/" "/healthz" '.status == 200 and .body.status == "ok"' "server health endpoint is ok"
run_page_case "E2E-FULL-07-DASHBOARD" "/" "/api/dashboard" '.status == 200 and (.body.widgets | type == "object")' "dashboard page and API load"
run_page_case "E2E-FULL-01-ORGS" "/orgs" "/api/orgs/tree" '.status == 200 and (.body.items | length) >= 5' "organization tree loads"
run_page_case "E2E-FULL-01-PEOPLE" "/people" "/api/users?page_size=200" '.status == 200 and (.body.items | length) >= 10' "people list loads"
run_page_case "E2E-FULL-03-TASKS" "/tasks" "/api/tasks?page_size=200" '.status == 200 and (.body.items | length) >= 8' "task list loads"
run_page_case "E2E-FULL-11-PROJECTS" "/projects" "/api/projects?page_size=200" '.status == 200 and (.body.items | length) >= 3' "project list loads"
run_page_case "E2E-FULL-04-APPROVALS" "/approvals" "/api/approvals?page_size=100" '.status == 200 and (.body.items | type == "array")' "approval list loads"
run_page_case "E2E-FULL-05-CONFLICTS" "/conflicts" "/api/conflicts?page_size=100" '.status == 200 and (.body.items | length) >= 1' "conflict center loads"
run_page_case "E2E-FULL-06-RESOURCES" "/resources" "/api/resources?page_size=100" '.status == 200 and (.body.items | length) >= 1' "resource library loads"
run_page_case "E2E-FULL-08-CONFIG" "/config" "/api/config/modules" '.status == 200 and (.body.modules | length) >= 5' "config modules load"
run_page_case "E2E-FULL-09-TODOS" "/todos" "/api/todos?page_size=100" '.status == 200 and (.body.items | type == "array")' "todo center loads"
run_page_case "E2E-FULL-09-NOTIFICATIONS" "/notifications" "/api/notifications?page_size=100" '.status == 200 and (.body.items | type == "array")' "notification center loads"
run_page_case "E2E-FULL-09-REPORTS" "/reports" "/api/reports" '.status == 200 and (.body.items | length) >= 1' "report center loads"
run_page_case "E2E-FULL-10-TOOLS" "/tools" "/api/tools" '.status == 200 and (.body.items | length) >= 1' "tool center loads"
run_page_case "E2E-FULL-12-GANTT" "/gantt" "/api/gantt" '.status == 200 and (.body.items | length) >= 1' "gantt loads"
run_page_case "E2E-FULL-12-SEARCH" "/search?q=任务" "/api/search?q=任务" '.status == 200 and (.body.items | length) >= 1' "global search returns visible task data"
run_page_case "E2E-FULL-13-ADMIN" "/admin" "/api/admin/dashboard" '.status == 200 and (.body | type == "object")' "SA admin dashboard loads"

HIDDEN_TOKEN="$(login_token nf_hidden_denied)"
hidden_dir="$RUN_DIR/E2E-FULL-02-HIDDEN-PERMISSION"
mkdir -p "$hidden_dir"
request_json GET "$BASE_URL/api/search?q=隐藏攻关" "$hidden_dir/api-hidden-search.json" "" "$HIDDEN_TOKEN"
assert_file "E2E-FULL-02-HIDDEN-PERMISSION" "$hidden_dir/api-hidden-search.json" '.status == 200 and ([.body.items[].title | contains("隐藏攻关") or contains("隐藏项目任务")] | any) == false' "hidden-denied user cannot search hidden project content"

suffix="$(date +%s)"
lookup_dir="$RUN_DIR/E2E-FULL-SETUP"
mkdir -p "$lookup_dir"
request_json GET "$BASE_URL/api/orgs?page_size=200" "$lookup_dir/orgs.json"
request_json GET "$BASE_URL/api/roles?page_size=200" "$lookup_dir/roles.json"
ROOT_ORG="$(jq -r '.body.items[] | select(.code == "ROOT") | .id' "$lookup_dir/orgs.json" | head -1)"
EMP_ROLE="$(jq -r '.body.items[] | select(.code == "employee") | .id' "$lookup_dir/roles.json" | head -1)"

org_body="$(jq -n --arg name "自动验收组织 $suffix" --arg code "AUTO_$suffix" --arg parent "$ROOT_ORG" '{name:$name,code:$code,parent_id:$parent,org_type:"department",payload:{full_smoke:true}}')"
run_write_case "E2E-FULL-01-CREATE-ORG" POST "/api/orgs" "$org_body" '.status == 200 and (.body.id | type == "string")' "create organization"
NEW_ORG="$(jq -r '.body.id // empty' "$RUN_DIR/E2E-FULL-01-CREATE-ORG/api.json")"

person_body="$(jq -n --arg org "$NEW_ORG" --arg role "$EMP_ROLE" --arg suffix "$suffix" '{name:("自动验收人员 " + $suffix), employee_no:("AUTO-PERSON-" + $suffix), primary_org_id:$org, system_role_ids:[$role], daily_standard_hours:8, work_status:"active", account_status:"enabled", payload:{full_smoke:true}}')"
run_write_case "E2E-FULL-01-CREATE-PERSON" POST "/api/users" "$person_body" '.status == 200 and (.body.id | type == "string")' "create person"
NEW_PERSON="$(jq -r '.body.id // empty' "$RUN_DIR/E2E-FULL-01-CREATE-PERSON/api.json")"

project_body="$(jq -n --arg org "$NEW_ORG" --arg leader "$NEW_PERSON" --arg suffix "$suffix" '{project_no:("AUTO-PRJ-" + $suffix), name:("自动验收项目 " + $suffix), project_type:"research", level:"department", owner_org_id:$org, leader_id:$leader, status:"active", visibility:"public", start_date:"2026-09-01", end_date:"2026-10-31", summary:"全功能自动验收项目", payload:{full_smoke:true}}')"
run_write_case "E2E-FULL-11-CREATE-PROJECT" POST "/api/projects" "$project_body" '.status == 200 and (.body.id | type == "string")' "create project"
NEW_PROJECT="$(jq -r '.body.id // empty' "$RUN_DIR/E2E-FULL-11-CREATE-PROJECT/api.json")"

task_body="$(jq -n --arg org "$NEW_ORG" --arg person "$NEW_PERSON" --arg project "$NEW_PROJECT" --arg suffix "$suffix" '{name:("自动验收任务 " + $suffix), sub_type:"research", level:"normal", priority:"normal", owner_org_id:$org, project_id:$project, visibility:"normal", owner_id:$person, acceptor_id:$person, start_at:"2026-09-02T01:00:00Z", due_at:"2026-09-20T10:00:00Z", estimated_total_hours:16, summary:"全局搜索与任务流自动验收", deliverable_requirement:"验收记录", status:"draft", members:[{person_id:$person, member_role:"owner", work_content:"自动验收", estimated_total_hours:16, daily_commitment_type:"hours", daily_commitment_hours:2, start_date:"2026-09-02", due_date:"2026-09-20", approval_status:"approved"}], payload:{full_smoke:true}}')"
run_write_case "E2E-FULL-03-CREATE-TASK" POST "/api/tasks" "$task_body" '.status == 200 and (.body.id | type == "string")' "create task with member"
NEW_TASK="$(jq -r '.body.id // empty' "$RUN_DIR/E2E-FULL-03-CREATE-TASK/api.json")"

run_write_case "E2E-FULL-04-DISPATCH-PREVIEW" POST "/api/dispatch/preview" "{\"task_id\":\"$NEW_TASK\"}" '.status == 200 and .body.requires_approval == false' "dispatch preview for same-org task"
run_write_case "E2E-FULL-04-DISPATCH-SUBMIT" POST "/api/dispatch/submit" "{\"task_id\":\"$NEW_TASK\",\"reason\":\"full smoke\"}" '.status == 200 and .body.dispatch_type == "direct"' "dispatch submit"
run_write_case "E2E-FULL-03-CONFIRM-TASK" POST "/api/tasks/$NEW_TASK/confirm" '{"reason":"full smoke confirm"}' '.status == 200 and .body.status == "in_progress"' "confirm task into progress"
run_write_case "E2E-FULL-05-WORKLOAD-PREVIEW" POST "/api/workload/preview" "{\"person_id\":\"$NEW_PERSON\",\"start_date\":\"2026-09-02\",\"due_date\":\"2026-09-05\",\"daily_commitment_hours\":2,\"daily_commitment_type\":\"hours\"}" '.status == 200 and (.body.days | length) >= 1' "workload preview"

assignment_body="$(jq -n --arg person "$NEW_PERSON" '{title:"自动验收分工", owner_id:$person, collaborator_ids:[], start_date:"2026-09-02", due_date:"2026-09-20", estimated_total_hours:8, daily_commitment_type:"hours", daily_commitment_hours:1, acceptor_id:$person, payload:{full_smoke:true}}')"
run_write_case "E2E-FULL-03-CREATE-ASSIGNMENT" POST "/api/tasks/$NEW_TASK/assignments" "$assignment_body" '.status == 200 and (.body.id | type == "string")' "create assignment"
ASSIGNMENT_ID="$(jq -r '.body.id // empty' "$RUN_DIR/E2E-FULL-03-CREATE-ASSIGNMENT/api.json")"
run_write_case "E2E-FULL-03-REPORT-PROGRESS" POST "/api/assignments/$ASSIGNMENT_ID/progress" '{"spent_hours":2,"progress":50,"content":"full smoke progress"}' '.status == 200 and (.body.id | type == "string")' "report assignment progress"

upload_body='{"filename":"full-smoke.txt","content_type":"text/plain"}'
run_write_case "E2E-FULL-06-UPLOAD-URL" POST "/api/resources/upload-url" "$upload_body" '.status == 200 and (.body.resource_id | type == "string") and (.body.object_key | type == "string")' "create resource upload url"
RESOURCE_ID="$(jq -r '.body.resource_id // empty' "$RUN_DIR/E2E-FULL-06-UPLOAD-URL/api.json")"
VERSION_ID="$(jq -r '.body.version_id // empty' "$RUN_DIR/E2E-FULL-06-UPLOAD-URL/api.json")"
OBJECT_KEY="$(jq -r '.body.object_key // empty' "$RUN_DIR/E2E-FULL-06-UPLOAD-URL/api.json")"
complete_body="$(jq -n --arg rid "$RESOURCE_ID" --arg vid "$VERSION_ID" --arg key "$OBJECT_KEY" --arg task "$NEW_TASK" '{resource_id:$rid, version_id:$vid, object_key:$key, filename:"full-smoke.txt", name:"自动验收资料", file_size:12, content_type:"text/plain", object_type:"task", object_id:$task, resource_type:"stage_report", is_stage_result:true, payload:{full_smoke:true}}')"
run_write_case "E2E-FULL-06-COMPLETE-UPLOAD" POST "/api/resources/complete-upload" "$complete_body" '.status == 200 and .body.status == "submitted"' "complete resource metadata upload and link task"

run_write_case "E2E-FULL-12-SAVE-FILTER" POST "/api/saved-filters" "{\"filter_type\":\"search\",\"name\":\"自动验收筛选 $suffix\",\"query\":\"自动验收任务 $suffix\"}" '.status == 200 and (.body.id | type == "string")' "save search filter"
run_page_case "E2E-FULL-12-SEARCH-CREATED" "/search?q=自动验收任务" "/api/search?q=自动验收任务" '.status == 200 and ([.body.items[].title | contains("自动验收任务")] | any)' "created task is searchable"

tool_dir="$RUN_DIR/E2E-FULL-10-TOOL-USAGE"
mkdir -p "$tool_dir"
request_json GET "$BASE_URL/api/tools" "$tool_dir/tools.json"
TOOL_ID="$(jq -r '.body.items[0].id // empty' "$tool_dir/tools.json")"
run_write_case "E2E-FULL-10-TOOL-USAGE" POST "/api/tools/$TOOL_ID/usage" "{\"source_type\":\"task\",\"source_id\":\"$NEW_TASK\",\"payload\":{\"full_smoke\":true}}" '.status == 200 and (.body.id | type == "string")' "record tool usage with task context"

run_write_case "E2E-FULL-09-REPORT-EXPORT" POST "/api/reports/task_overview/export" '{"scope_type":"user","period_start":"2026-09-01","period_end":"2026-09-30","payload":{"full_smoke":true}}' '.status == 200 and .body.status == "generated"' "export report snapshot"

template_dir="$RUN_DIR/E2E-FULL-13-INVITATION-LINK"
mkdir -p "$template_dir"
request_json GET "$BASE_URL/api/invitations/templates" "$template_dir/templates.json"
TEMPLATE_ID="$(jq -r '.body.items[0].id // empty' "$template_dir/templates.json")"
run_write_case "E2E-FULL-13-INVITATION-LINK" POST "/api/invitations/templates/$TEMPLATE_ID/links" "" '.status == 200 and (.body.token | type == "string") and (.body.url | contains("/register/invitation/"))' "create invitation link exposes token once"

write_results_md
echo "$RUN_DIR"
echo "Full smoke results: $RESULTS_NDJSON"
jq -s 'group_by(.status) | map({status:.[0].status,count:length})' "$RESULTS_NDJSON"
