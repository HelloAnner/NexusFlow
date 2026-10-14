#!/usr/bin/env bash
# Run only inside an extracted server validation attachment, never against production env.
set -euo pipefail
DIR="$(cd "${1:?validation directory required}" && pwd)"
[[ $(uname -s) == Linux ]] || { echo 'server-only checks'; exit 1; }
BUN="$DIR/runtime/bun"
[[ $("$BUN" --version) == $(cat "$DIR/runtime/VERSION") ]] || { echo 'runtime version mismatch'; exit 1; }
mkdir -p "$DIR/test-home"
if [[ -x "$DIR/nexusflow-cli" && -f "$DIR/COMMIT" ]]; then
 NEXUSFLOW_BUILD_COMMIT=spoofed "$DIR/nexusflow-cli" version --local --json | python3 -c 'import json,pathlib,sys; assert json.load(sys.stdin)["version"]==pathlib.Path(sys.argv[1]).read_text().strip()' "$DIR/COMMIT"
fi
# Do not inherit DATABASE_URL, Redis/S3, credentials, or production dotenv.
exec env -i PATH="$DIR/runtime:/usr/bin:/bin" HOME="$DIR/test-home" VALIDATION_DIR="$DIR" bash <<'SH'
set -euo pipefail
cd "$VALIDATION_DIR/source"
if find . -name '.env' -o -name '.env.local' | grep -q .; then echo 'BLOCKED: dotenv in validation source'; exit 1; fi
for app in apps/api apps/web cli; do
 (cd "$app" && bun node_modules/typescript/bin/tsc --noEmit)
done
for app in apps/api cli; do (cd "$app" && bun test); done
python3 scripts/check-read-safety.py .
python3 scripts/tests/release_test.py
SH
