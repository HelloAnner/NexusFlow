#!/usr/bin/env bash
set -euo pipefail

SERVER="${SERVER:-${1:-nexusflow}}"
REMOTE_DIR="${REMOTE_DIR:-/opt/nexusflow/src}"
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SEED_SQL="$ROOT_DIR/e2e/seed/nexusflow_e2e_seed.sql"
REMOTE_SEED="/tmp/nexusflow_e2e_seed.sql"

if [[ ! -f "$SEED_SQL" ]]; then
  echo "missing seed file: $SEED_SQL" >&2
  exit 1
fi

scp "$SEED_SQL" "$SERVER:$REMOTE_SEED" >/dev/null

ssh "$SERVER" "bash -s" <<'REMOTE'
set -euo pipefail
if [[ -f /opt/nexusflow/.env ]]; then
  set -a
  # shellcheck disable=SC1091
  source /opt/nexusflow/.env
  set +a
fi
if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "DATABASE_URL is not set on server" >&2
  exit 1
fi
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f /tmp/nexusflow_e2e_seed.sql
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -At <<'SQL'
SELECT json_build_object(
  'accounts', (SELECT count(*) FROM accounts WHERE payload->>'e2e_seed' = 'true' OR login_name = 'Anner'),
  'organizations', (SELECT count(*) FROM organizations WHERE payload->>'e2e_seed' = 'true'),
  'projects', (SELECT count(*) FROM projects WHERE payload->>'e2e_seed' = 'true'),
  'tasks', (SELECT count(*) FROM tasks WHERE payload->>'e2e_seed' = 'true'),
  'resources', (SELECT count(*) FROM resource_files WHERE payload->>'e2e_seed' = 'true'),
  'conflicts', (SELECT count(*) FROM conflict_records WHERE payload->>'e2e_seed' = 'true')
)::text;
SQL
REMOTE

echo "seed applied on $SERVER from $SEED_SQL"
