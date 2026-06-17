#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${BASE_URL:-http://127.0.0.1:8089}"
LOGIN_NAME="${LOGIN_NAME:-Anner}"
PASSWORD="${PASSWORD:-1}"
OUT_FILE="${1:-}"

BODY="$(printf '{"login_name":"%s","password":"%s"}' "$LOGIN_NAME" "$PASSWORD")"

if [[ -n "$OUT_FILE" ]]; then
  mkdir -p "$(dirname "$OUT_FILE")"
  curl -sS "$BASE_URL/api/auth/login" \
    -H 'Content-Type: application/json' \
    -d "$BODY" > "$OUT_FILE"
else
  curl -sS "$BASE_URL/api/auth/login" \
    -H 'Content-Type: application/json' \
    -d "$BODY"
fi

