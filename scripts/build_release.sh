#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

RUST_IMAGE="${NEXUSFLOW_RUST_IMAGE:-docker.m.daocloud.io/library/rust:1.91.1-bullseye}"
CARGO_CACHE="${NEXUSFLOW_CARGO_CACHE:-/opt/nexusflow/cargo-cache}"

if [ ! -f "$ROOT_DIR/frontend/dist/index.html" ]; then
  echo "frontend/dist/index.html is missing; run bun build before syncing deploy source" >&2
  exit 1
fi

mkdir -p "$CARGO_CACHE"

docker run --rm \
  --platform linux/amd64 \
  -v "$ROOT_DIR:/work:Z" \
  -v "$CARGO_CACHE:/cargo:Z" \
  -w /work/backend \
  -e CARGO_HOME=/cargo \
  -e CARGO_REGISTRIES_CRATES_IO_PROTOCOL=sparse \
  "$RUST_IMAGE" \
  cargo build --release --offline

install -Dm755 "$ROOT_DIR/backend/target/release/nexusflow-backend" /opt/nexusflow/nexusflow
