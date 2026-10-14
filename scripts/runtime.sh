#!/usr/bin/env bash
# Official @oven distribution, pinned runtime + SHA512; no global installation.
set -euo pipefail
VERSION=1.3.10
DEST="${1:?runtime directory required}"
ARCHIVE="${2:-bun-linux-x64-baseline.zip}"
case "$ARCHIVE" in
 bun-linux-x64-baseline.zip) INTEGRITY='oqvMDYpX6dGJO03HgO5bXuccEsH3qbdO3MaAiAlO4CfkBPLUXz3N0DDElg5hz0L6ktdDVKbQVE5lfe+LAUISQg==' ;;
 bun-darwin-aarch64.zip) INTEGRITY='PXgg5gqcS/rHwa1hF0JdM1y5TiyejVrMHoBmWY/DjtfYZoFTXie1RCFOkoG0b5diOOmUcuYarMpH7CSNTqwj+w==' ;;
 bun-darwin-x64.zip) INTEGRITY='Nhssuh7GBpP5PiDSOl3+qnoIG7PJo+ec2oomDevnl9pRY6x6aD2gRt0JE+uf+A8Om2D6gjeHCxjEdrw5ZHE8mA==' ;;
 *) echo 'unsupported runtime archive' >&2; exit 1;;
esac
PACKAGE="${ARCHIVE%.zip}"
mkdir -p "$DEST"
curl -fsSL --connect-timeout 20 --max-time 900 --retry 2 "https://registry.npmjs.org/@oven/$PACKAGE/-/$PACKAGE-$VERSION.tgz" -o "$DEST/runtime.tgz"
python3 - "$DEST" "$INTEGRITY" <<'PY'
import base64,hashlib,pathlib,sys,tarfile
p=pathlib.Path(sys.argv[1]); archive=p/'runtime.tgz'
if base64.b64encode(hashlib.sha512(archive.read_bytes()).digest()).decode()!=sys.argv[2]:
    raise SystemExit('runtime checksum mismatch')
with tarfile.open(str(archive),'r:gz') as t:
    member=t.extractfile('package/bin/bun')
    if member is None: raise SystemExit('runtime executable missing')
    (p/'bun').write_bytes(member.read())
(p/'bun').chmod(0o755)
PY
rm "$DEST/runtime.tgz"
printf '%s\n' "$VERSION" > "$DEST/VERSION"
