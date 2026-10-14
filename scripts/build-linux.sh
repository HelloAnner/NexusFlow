#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
COMMIT="$("$ROOT/scripts/require-main.sh")"
TIME="$(git -C "$ROOT" show -s --format=%cI "$COMMIT")"
OUT="$ROOT/dist/linux-x86_64"
# Build only a committed archive, not files changed concurrently in a worktree.
STAGE="$(mktemp -d)"; trap 'rm -rf "$STAGE"' EXIT
mkdir -p "$OUT" "$STAGE/source"
case "$(uname -s)-$(uname -m)" in
 Darwin-arm64) ARCHIVE=bun-darwin-aarch64.zip;;
 Darwin-x86_64) ARCHIVE=bun-darwin-x64.zip;;
 Linux-x86_64) ARCHIVE=bun-linux-x64-baseline.zip;;
 *) echo 'unsupported build platform' >&2; exit 1;;
esac
"$ROOT/scripts/runtime.sh" "$STAGE/build-runtime" "$ARCHIVE"
export PATH="$STAGE/build-runtime:$PATH"
git -C "$ROOT" archive "$COMMIT" | tar -x -C "$STAGE/source"
python3 "$STAGE/source/scripts/check-read-safety.py" "$STAGE/source"
for app in apps/api apps/web cli; do (cd "$STAGE/source/$app" && bun install --frozen-lockfile); done
(cd "$STAGE/source/apps/web" && NEXUSFLOW_STATIC_EXPORT=1 NEXUSFLOW_BASE_PATH=/nexusflow bun run build)
[[ -f "$STAGE/source/apps/web/out/index.html" ]] || { echo 'static export missing'; exit 1; }
# Dependency attachment is used only for server tsc/tests (no native web build there).
git -C "$ROOT" archive "$COMMIT" | gzip > "$OUT/source.tar.gz"
(cd "$STAGE/source" && COPYFILE_DISABLE=1 tar -czf "$OUT/dependencies.tar.gz" apps/api/node_modules apps/web/node_modules cli/node_modules)
python3 - "$STAGE/source/apps/web/out" "$STAGE/source/apps/api/src/web-assets.generated.ts" <<'PY'
import base64,json,pathlib,sys
root=pathlib.Path(sys.argv[1]); target=pathlib.Path(sys.argv[2])
assets={p.relative_to(root).as_posix():base64.b64encode(p.read_bytes()).decode() for p in root.rglob('*') if p.is_file()}
target.write_text('export const webAssets: Record<string,string> = '+json.dumps(assets,separators=(',',':'))+';\n')
PY
DEFINE=(--define "process.env.NEXUSFLOW_BUILD_COMMIT=\"$COMMIT\"" --define "process.env.NEXUSFLOW_BUILD_TIME=\"$TIME\"")
(cd "$STAGE/source/apps/api" && bun build --compile --target=bun-linux-x64-baseline "${DEFINE[@]}" --outfile "$OUT/nexusflow" src/index.ts)
(cd "$STAGE/source/cli" && bun build --compile --target=bun-linux-x64-baseline "${DEFINE[@]}" --outfile "$OUT/nexusflow-cli" src/index.ts)
"$ROOT/scripts/runtime.sh" "$OUT/runtime"
printf '%s\n' "$COMMIT" > "$OUT/COMMIT"
printf '%s\n' "$TIME" > "$OUT/BUILD_TIME"
python3 - "$OUT" <<'PY'
import hashlib,pathlib,sys
p=pathlib.Path(sys.argv[1]); names=['nexusflow','nexusflow-cli','source.tar.gz','dependencies.tar.gz','COMMIT','BUILD_TIME','runtime/bun','runtime/VERSION']
(p/'SHA256SUMS').write_text(''.join(hashlib.sha256((p/n).read_bytes()).hexdigest()+'  '+n+'\n' for n in names))
PY
echo "build artifacts ready: $COMMIT"
