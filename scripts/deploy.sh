#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
HOST="${DEPLOY_HOST:-nexusflow}"; REMOTE="${REMOTE_ROOT:-/opt/nexusflow}"; PORT="${DEPLOY_PORT:-8089}"
COMMIT="$("$ROOT/scripts/require-main.sh")"
"$ROOT/scripts/preflight.sh"
"$ROOT/scripts/build-linux.sh"
[[ $("$ROOT/scripts/require-main.sh") == "$COMMIT" ]] || { echo 'BLOCKED: main changed during build'; exit 1; }
# Upload immutable attachments; the production binary is not touched until checks and backups pass.
DIR="$REMOTE/validation/$COMMIT"
ssh "$HOST" "umask 077; mkdir -p '$DIR/runtime'"
OUT="$ROOT/dist/linux-x86_64"
scp -C "$OUT/"{nexusflow,nexusflow-cli,source.tar.gz,dependencies.tar.gz,COMMIT,BUILD_TIME,SHA256SUMS} "$HOST:$DIR/"
scp -C "$OUT/runtime/bun" "$OUT/runtime/VERSION" "$HOST:$DIR/runtime/"
ssh "$HOST" bash -s -- "$REMOTE" "$DIR" "$COMMIT" "$PORT" <<'SH'
set -euo pipefail
umask 077
ROOT="$1"; DIR="$2"; COMMIT="$3"; PORT="$4"; PHASE=checksum; SWAPPED=0
# Serial release lock is also enforced on the server.
exec 9>"$ROOT/.release.lock"
flock -n 9 || { echo 'BLOCKED: release channel busy'; exit 1; }
failed() {
 rc=$?
 if [[ $rc != 0 ]]; then
  printf 'FAILED phase=%s commit=%s\n' "$PHASE" "$COMMIT" > "$DIR/STATUS"
  if [[ $SWAPPED == 1 ]]; then
   cp "$BACKUP/nexusflow" "$ROOT/nexusflow.rollback"
   chmod +x "$ROOT/nexusflow.rollback"
   mv "$ROOT/nexusflow.rollback" "$ROOT/nexusflow"
   if [[ -f "$BACKUP/DEPLOYED_COMMIT" ]]; then
    cp "$BACKUP/DEPLOYED_COMMIT" "$ROOT/DEPLOYED_COMMIT"
   elif [[ -f "$ROOT/DEPLOYED_COMMIT" ]]; then
    rm "$ROOT/DEPLOYED_COMMIT"
   fi
   if sudo systemctl restart nexusflow && systemctl is-active --quiet nexusflow; then
    printf 'BINARY_RESTORED; database not rolled back\n' >> "$DIR/STATUS"
   else printf 'ROLLBACK_FAILED; manual recovery required\n' >> "$DIR/STATUS"; fi
  fi
  echo "FAILED: $PHASE; status $DIR/STATUS" >&2
 fi
}
trap failed EXIT
trap 'exit 130' INT TERM
cd "$DIR"
sha256sum --check SHA256SUMS >/dev/null
[[ $(cat COMMIT) == "$COMMIT" && $COMMIT =~ ^[0-9a-f]{40}$ ]]
chmod +x nexusflow nexusflow-cli runtime/bun
[[ $(./nexusflow-cli version --local --json | python3 -c 'import json,sys; print(json.load(sys.stdin)["version"])') == "$COMMIT" ]]
PHASE=server-tests
mkdir -p source
tar -xzf source.tar.gz -C source
tar -xzf dependencies.tar.gz -C source
bash source/scripts/server-checks.sh "$DIR"
PHASE=backup
BACKUP="$ROOT/backups/$COMMIT-$(date -u +%Y%m%dT%H%M%SZ)"
python3 source/scripts/server-env.py backup "$ROOT/.env" "$BACKUP"
cp "$ROOT/nexusflow" "$BACKUP/nexusflow"
sha256sum "$BACKUP/nexusflow" > "$BACKUP/old-binary.sha256"
# Legacy versions may lack version; store unknown explicitly, never invent an old commit.
if ! curl -fsS --max-time 10 "http://127.0.0.1:$PORT/nexusflow/api/system/version" | python3 -c 'import json,re,sys; v=json.load(sys.stdin); assert v.get("service")=="nexusflow" and re.fullmatch("[0-9a-f]{40}",v.get("version","")); print(json.dumps(v))' > "$BACKUP/old-version.json" 2>/dev/null; then printf '{"version":null,"legacy":true}\n' > "$BACKUP/old-version.json"; fi
if [[ -f "$ROOT/DEPLOYED_COMMIT" ]]; then
 cp "$ROOT/DEPLOYED_COMMIT" "$BACKUP/DEPLOYED_COMMIT"
 python3 - "$BACKUP" <<'PY'
import json,pathlib,sys
p=pathlib.Path(sys.argv[1]); old=json.loads((p/'old-version.json').read_text()).get('version')
assert old==(p/'DEPLOYED_COMMIT').read_text().strip(), 'old binary/commit mismatch'
PY
fi
PHASE=restart
sha256sum --check SHA256SUMS >/dev/null
cp nexusflow "$ROOT/nexusflow.new"; chmod +x "$ROOT/nexusflow.new"
SWAPPED=1
mv "$ROOT/nexusflow.new" "$ROOT/nexusflow"
sudo systemctl restart nexusflow
systemctl is-active --quiet nexusflow
PHASE=health
for attempt in $(seq 1 45); do
 if curl -fsS --connect-timeout 2 --max-time 5 "http://127.0.0.1:$PORT/nexusflow/healthz" >/dev/null; then break; fi
 [[ $attempt != 45 ]] || exit 1
 sleep 1
done
PHASE=b0-verifier
python3 source/scripts/server-env.py verify "$ROOT/.env" "$DIR" "http://127.0.0.1:$PORT"
printf '%s\n' "$COMMIT" > "$ROOT/DEPLOYED_COMMIT"
printf 'PASS commit=%s\n' "$COMMIT" > "$DIR/STATUS"
SWAPPED=0
printf 'DEPLOY PASS %s; attachment %s\n' "$COMMIT" "$DIR"
SH
