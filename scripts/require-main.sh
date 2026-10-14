#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
[[ $(git branch --show-current) == main ]] || { echo 'BLOCKED: deploy only from main' >&2; exit 1; }
[[ -z $(git status --porcelain --untracked-files=normal) ]] || { echo 'BLOCKED: worktree is not clean' >&2; exit 1; }
[[ $(git symbolic-ref refs/remotes/origin/HEAD) == refs/remotes/origin/main ]] || { echo 'BLOCKED: origin default is not main' >&2; exit 1; }
COMMIT=$(git rev-parse HEAD)
[[ $COMMIT == $(git rev-parse origin/main) && $COMMIT == $(git ls-remote origin refs/heads/main | cut -f1) ]] || { echo 'BLOCKED: main must match pushed origin/main' >&2; exit 1; }
if git ls-files | grep -Eq '(^|/)\.env($|\.)'; then echo 'BLOCKED: tracked environment file cannot be packaged' >&2; exit 1; fi
printf '%s\n' "$COMMIT"
