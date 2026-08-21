#!/usr/bin/env bash
#
# Run everything CI runs, locally, before pushing.
#
# WHY THIS EXISTS: a contrast regression in this repo was found by GitHub Actions after
# three separate pushes, because the contrast tree-walk and the responsive walk are NOT
# part of `npx vitest run` — they are extra CI steps driving a real Chrome. Running the
# obvious two gates locally and pushing therefore felt complete and was not, and each
# discovery cost a full CI cycle.
#
#     ./scripts/preflight.sh          # everything
#     ./scripts/preflight.sh web      # web-ui only (faster loop)
#     ./scripts/preflight.sh backend  # pytest only
#
# Mirrors .github/workflows/tests.yml step for step. If a step is added there, add it
# here — and the last check in this script asserts the two have not drifted apart, so a
# new CI step makes this file fail rather than silently pass less than it claims.
set -uo pipefail

cd "$(dirname "$0")/.." || exit 1
ROOT=$(pwd)
WHICH=${1:-all}
FAILED=()

# The backend gate MUST run through ./venv/bin/python. `python -m pytest` picks up the
# global conda interpreter here, whose pytest_asyncio is broken — an error that looks
# like a code failure and is not.
PY=./venv/bin/python

step() {
  local label=$1; shift
  printf '\n\033[1m▶ %s\033[0m\n' "$label"
  if "$@"; then
    printf '\033[32m  ✓ %s\033[0m\n' "$label"
  else
    printf '\033[31m  ✗ %s\033[0m\n' "$label"
    FAILED+=("$label")
  fi
}

if [[ "$WHICH" == "all" || "$WHICH" == "backend" ]]; then
  [[ -x "$PY" ]] || { echo "no venv at $PY — run: python -m venv venv && ./venv/bin/pip install -r requirements.txt"; exit 1; }
  step "backend: pytest" "$PY" -m pytest -q
fi

if [[ "$WHICH" == "all" || "$WHICH" == "web" ]]; then
  cd "$ROOT/web-ui" || exit 1
  # `npm run typecheck` (tsc -b), NEVER `npx tsc --noEmit`: the latter compiled ZERO files
  # and exited 0 for five sessions. That is D-45.
  step "web-ui: typecheck" npm run typecheck
  step "web-ui: vitest" npx vitest run

  # The two walks CI runs that vitest does not. They need a real Chrome and they are the
  # reason this script exists at all.
  step "web-ui: capture for the walks (default)" \
    npx vitest run --config scripts/contrast-walk/vitest.walk.config.ts
  step "web-ui: capture for the walks (pages)" \
    env WALK_CAPTURE=scripts/contrast-walk/capture-pages.walk.tsx \
    npx vitest run --config scripts/contrast-walk/vitest.walk.config.ts
  step "web-ui: contrast tree-walk" node scripts/contrast-walk/run.mjs
  step "web-ui: responsive walk (overflow at 4 widths, both themes)" \
    node scripts/responsive-walk/run.mjs
  cd "$ROOT" || exit 1
fi

# Has CI grown a step this script does not run? Counting `run:` keys in the two test jobs
# is crude, but it fails LOUDLY when the workflow changes, which is the point: a gate that
# silently covers less than it claims is how the contrast walk got missed in the first
# place.
EXPECTED_CI_RUN_STEPS=6
ACTUAL=$(/usr/bin/grep -cE '^\s+run:' .github/workflows/tests.yml)
if [[ "$ACTUAL" != "$EXPECTED_CI_RUN_STEPS" ]]; then
  printf '\n\033[33m! .github/workflows/tests.yml has %s run-steps, this script expects %s.\033[0m\n' \
    "$ACTUAL" "$EXPECTED_CI_RUN_STEPS"
  printf '\033[33m  A CI step was added or removed. Update scripts/preflight.sh to match, then bump EXPECTED_CI_RUN_STEPS.\033[0m\n'
  FAILED+=("preflight is out of step with the workflow")
fi

printf '\n────────────────────────────────\n'
if [[ ${#FAILED[@]} -eq 0 ]]; then
  printf '\033[32mALL GREEN — safe to push.\033[0m\n'
  exit 0
fi
printf '\033[31m%s FAILED:\033[0m\n' "${#FAILED[@]}"
for f in "${FAILED[@]}"; do printf '  - %s\n' "$f"; done
printf '\nDo not push. Fix these first.\n'
exit 1
