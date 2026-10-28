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
# 这条链路大文件 scp 会被重置；rsync --partial 断点续传，重试三次。
for attempt in 1 2 3; do
  rsync -a --partial --append-verify --timeout=60 \
    "$OUT/nexusflow" "$OUT/nexusflow-cli" "$OUT/source.tar.gz" "$OUT/dependencies.tar.gz" \
    "$OUT/COMMIT" "$OUT/BUILD_TIME" "$OUT/SHA256SUMS" "$HOST:$DIR/" \
  && rsync -a --partial --append-verify --timeout=60 \
    "$OUT/runtime/bun" "$OUT/runtime/VERSION" "$HOST:$DIR/runtime/" \
  && break
  [[ $attempt == 3 ]] && { echo 'upload failed after 3 attempts' >&2; exit 1; }
  echo "upload attempt $attempt failed; retrying"
  sleep 3
done
ssh "$HOST" bash -s -- "$REMOTE" "$DIR" "$COMMIT" "$PORT" "${DEPLOY_RECOVERY:-0}" <<'SH'
set -euo pipefail
umask 077
ROOT="$1"; DIR="$2"; COMMIT="$3"; PORT="$4"; RECOVERY="$5"; PHASE=checksum; SWAPPED=0
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
PHASE=middleware
# 中间件统一由 deploy/compose.yaml 声明；compose.env 由 .env 派生，是凭据的唯一来源。
COMPOSE_FILE="$ROOT/compose.yaml"; COMPOSE_ENV="$ROOT/compose.env"
install -m 644 source/deploy/compose.yaml "$COMPOSE_FILE"
python3 source/scripts/server-env.py compose-env "$ROOT/.env" "$COMPOSE_ENV"
docker compose --env-file "$COMPOSE_ENV" -f "$COMPOSE_FILE" up -d
for attempt in $(seq 1 60); do
 if docker exec nexusflow-postgres pg_isready -q >/dev/null 2>&1 &&
    docker exec nexusflow-redis redis-cli ping >/dev/null 2>&1 &&
    curl -fsS http://127.0.0.1:9000/minio/health/live >/dev/null 2>&1; then break; fi
 [[ $attempt != 60 ]] || exit 1
 sleep 1
done
docker compose --env-file "$COMPOSE_ENV" -f "$COMPOSE_FILE" --profile init up minio-init
PHASE=backup
BACKUP="$ROOT/backups/$COMMIT-$(date -u +%Y%m%dT%H%M%SZ)"
python3 source/scripts/server-env.py backup "$ROOT/.env" "$BACKUP"
cp "$ROOT/nexusflow" "$BACKUP/nexusflow"
sha256sum "$BACKUP/nexusflow" > "$BACKUP/old-binary.sha256"
# Legacy versions may lack version; store unknown explicitly, never invent an old commit.
if ! curl -fsS --max-time 10 "http://127.0.0.1:$PORT/nexusflow/api/system/version" | python3 -c 'import json,re,sys; v=json.load(sys.stdin); assert v.get("service")=="nexusflow" and re.fullmatch("[0-9a-f]{40}",v.get("version","")); print(json.dumps(v))' > "$BACKUP/old-version.json" 2>/dev/null; then printf '{"version":null,"legacy":true}\n' > "$BACKUP/old-version.json"; fi
if [[ -f "$ROOT/DEPLOYED_COMMIT" ]]; then
 cp "$ROOT/DEPLOYED_COMMIT" "$BACKUP/DEPLOYED_COMMIT"
 python3 - "$BACKUP" "$RECOVERY" "$ROOT" <<'PY'
import hashlib,json,pathlib,re,sys
p=pathlib.Path(sys.argv[1]); old=json.loads((p/'old-version.json').read_text()).get('version')
previous=(p/'DEPLOYED_COMMIT').read_text().strip()
if old is None and sys.argv[2]=='1':
 assert re.fullmatch('[0-9a-f]{40}',previous), 'invalid deployed commit'
 artifact=pathlib.Path(sys.argv[3])/'validation'/previous/'nexusflow'
 assert hashlib.sha256((p/'nexusflow').read_bytes()).digest()==hashlib.sha256(artifact.read_bytes()).digest(), 'recovery binary/attachment mismatch'
else:
 assert old==previous, 'old binary/commit mismatch'
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
