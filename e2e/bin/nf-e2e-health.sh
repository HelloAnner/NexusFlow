#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${BASE_URL:-http://127.0.0.1:8089}"
OUT_DIR="${1:-}"

if [[ -n "$OUT_DIR" ]]; then
  mkdir -p "$OUT_DIR"
  curl -sS "$BASE_URL/healthz" > "$OUT_DIR/healthz.json"
  curl -sS "$BASE_URL/readyz" > "$OUT_DIR/readyz.json"
else
  curl -sS "$BASE_URL/healthz"
  printf '\n'
  curl -sS "$BASE_URL/readyz"
  printf '\n'
fi

