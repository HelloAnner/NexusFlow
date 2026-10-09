#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="${DEPLOY_OUT:-$ROOT/dist/linux-x86_64/nexusflow}"
command -v bun >/dev/null || { echo 'bun is required'; exit 1; }
command -v python3 >/dev/null || { echo 'python3 is required to embed static assets'; exit 1; }
ASSET_MODULE="$ROOT/apps/api/src/web-assets.generated.ts"
BACKUP="$(mktemp)"
cp "$ASSET_MODULE" "$BACKUP"
restore() { cp "$BACKUP" "$ASSET_MODULE"; rm -f "$BACKUP"; }
trap restore EXIT
(cd "$ROOT/apps/web" && NEXUSFLOW_STATIC_EXPORT=1 NEXUSFLOW_BASE_PATH=/nexusflow bun run build)
[[ -f "$ROOT/apps/web/out/index.html" ]] || { echo 'Static web export is missing apps/web/out/index.html'; exit 1; }
python3 - "$ROOT/apps/web/out" "$ASSET_MODULE" <<'PY'
import base64,json,pathlib,sys
root=pathlib.Path(sys.argv[1]); target=pathlib.Path(sys.argv[2])
assets={p.relative_to(root).as_posix():base64.b64encode(p.read_bytes()).decode() for p in root.rglob('*') if p.is_file()}
target.write_text('export const webAssets: Record<string,string> = '+json.dumps(assets,separators=(',',':'))+';\n')
PY
mkdir -p "$(dirname "$OUT")"
(cd "$ROOT/apps/api" && bun build --compile --target=bun-linux-x64 --outfile "$OUT" src/index.ts)
chmod +x "$OUT"
echo "Built single-binary API + web assets: $OUT"
