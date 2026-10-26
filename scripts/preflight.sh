#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
HOST="${DEPLOY_HOST:-nexusflow}"
REMOTE="${REMOTE_ROOT:-/opt/nexusflow}"
[[ $REMOTE =~ ^/[a-zA-Z0-9_/-]+$ && $REMOTE != *'/../'* && $REMOTE != */.. ]] || { echo 'invalid remote root'; exit 1; }
PORT="${DEPLOY_PORT:-8089}"
RECOVERY="${DEPLOY_RECOVERY:-0}"
[[ $RECOVERY =~ ^[01]$ ]] || { echo 'DEPLOY_RECOVERY must be 0 or 1'; exit 1; }
[[ $PORT =~ ^[0-9]+$ ]] && ((PORT>0 && PORT<65536)) || { echo 'invalid port'; exit 1; }
ssh "$HOST" bash -s -- "$REMOTE" "$RECOVERY" <<'SH'
set -euo pipefail
ROOT="$1"; RECOVERY="$2"
[[ $(uname -m) == x86_64 ]] || { echo 'unsupported server architecture'; exit 1; }
if [[ $RECOVERY == 1 ]]; then
 previous="$(cat "$ROOT/DEPLOYED_COMMIT")"
 [[ $previous =~ ^[0-9a-f]{40}$ ]] && cmp -s "$ROOT/nexusflow" "$ROOT/validation/$previous/nexusflow" || { echo 'recovery requires the exact last deployed binary'; exit 1; }
else
 systemctl is-active --quiet nexusflow
fi
[[ $(systemctl show nexusflow -p WorkingDirectory --value) == "$ROOT" ]] || { echo 'service root differs'; exit 1; }
[[ $(systemctl show nexusflow -p ExecStart --value) == *"path=$ROOT/nexusflow ;"* ]] || { echo 'service executable differs'; exit 1; }
[[ $(systemctl show nexusflow -p EnvironmentFiles --value) == "$ROOT/.env (ignore_errors=no)" ]] || { echo 'service environment differs'; exit 1; }
for c in python3 tar sha256sum pg_dump pg_restore psql curl flock git; do command -v "$c" >/dev/null || { echo "missing $c"; exit 1; }; done
[[ -r "$ROOT/.env" && -w "$ROOT" && -x "$ROOT/nexusflow" ]] || { echo 'service environment/binary/directory inaccessible'; exit 1; }
[[ $(df -Pk "$ROOT" | awk 'NR==2 {print $4}') -ge ${DEPLOY_MIN_FREE_KB:-5242880} ]] || { echo 'less than 5GiB free'; exit 1; }
[[ $(stat -c %a "$ROOT/.env") == 600 ]] || { echo 'environment permissions must be 600'; exit 1; }
sudo -n true
printf 'systemd/architecture/tools/disk/permissions: PASS\n'
SH
ssh "$HOST" python3 - preflight "$REMOTE/.env" < "$ROOT/scripts/server-env.py"
if [[ $RECOVERY == 1 ]]; then
 echo 'RECOVERY: existing service health unavailable; identity, backups, tests and post-deploy health remain required'
else
 ssh "$HOST" "curl -fsS --max-time 10 http://127.0.0.1:${DEPLOY_PORT:-8089}/nexusflow/healthz" >/dev/null
 echo 'healthz: PASS; readyz not called; private pinned Bun is attached by build'
fi
