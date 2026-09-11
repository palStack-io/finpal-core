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
#     ./scripts/preflight.sh backend  # pytest only (BOTH interpreters)
#     ./scripts/preflight.sh quick    # everything except the 3.11 leg
#
# *** IT RUNS PYTEST TWICE, ON 3.12 AND 3.11, BECAUSE CI DOES AND THIS FILE CLAIMS TO
# MIRROR CI. *** Added 2026-09-08 after two branches were merged with their CI still
# pending: the local gate was green and had only ever run 3.12, so `main` briefly carried
# code that no 3.11 interpreter had executed anywhere. The workflow's own comment says why
# that leg exists — *"finpal_core is self-hosted, and self-hosters will not all be on the
# same interpreter as the shipped image"* — so 3.11 is other people's production, not a
# formality. 3.12 is what the Docker image runs.
#
# Use `quick` while iterating; use the default before you push. The pre-push hook runs the
# default (see scripts/hooks/pre-push).
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
# The second interpreter. Created with:
#     uv venv --python 3.11 venv311
#     uv pip install --python venv311/bin/python -r requirements.txt -r requirements-test.txt
# Absent rather than broken is treated as a FAILURE, not a skip: a gate that quietly
# covers less than it claims is the thing this script was written to stop (see the header).
PY311=./venv311/bin/python

# *** EVERY STEP RUNS UNDER A WALL CLOCK, ADDED 2026-09-10 ON THE OWNER'S
# INSTRUCTION. *** Nothing here had one. A step that hangs -- a walk waiting on a
# Chrome that never launched, an MSW handler that never answers, a scheduler job
# sharing the request's connection (D-61) -- blocked the whole gate until a human
# noticed, and on 2026-09-10 that cost roughly half an hour of a session sitting
# on a run that was never going to answer.
#
# Implemented in pure bash because *** macOS HAS NEITHER `timeout` NOR
# `gtimeout` *** unless coreutils is installed, and a gate that depends on an
# optional Homebrew package is a gate that silently does not run.
#
# A timed-out step is a FAILURE, never a skip. "It took too long" and "it passed"
# must not look the same from the summary -- that is the shape of every silent
# gate this project has been bitten by.
STEP_TIMEOUT=${STEP_TIMEOUT:-900}      # 15 min; the slowest honest step is ~8

run_with_timeout() {
  local secs=$1; shift
  # *** `set -m` IS LOAD-BEARING AND WAS ADDED AFTER TESTING, NOT BEFORE. ***
  # Without job control a background child is NOT a process-group leader, so
  # `kill -- -PID` fails and only the direct child dies. Proven with a parent
  # spawning a long-lived grandchild: without this the grandchild survived the
  # timeout, which for a real step means an orphaned pytest or a headless Chrome
  # left holding a port. With it, the whole group goes and 0 orphans remain.
  set -m
  # *** `< /dev/null` IS INSURANCE AGAINST THE CLASSIC CAUSE OF EXACTLY THE
  # SYMPTOM THIS WRAPPER EXISTS TO CATCH. *** `set -m` puts the job in its own
  # process group, and a background process group that READS STDIN gets SIGTTIN
  # and is STOPPED — not killed, stopped — which looks identical to a hang and
  # lasts until the wall clock fires. No step here has any business reading
  # stdin, so closing it converts that failure mode into an immediate EOF.
  #
  # Added after the contrast walk timed out at 900s inside a full run on
  # 2026-09-11 and then completed in 18s both standalone AND through this
  # wrapper — i.e. NOT REPRODUCED. This does not claim to be the cause; it
  # removes the likeliest one so a recurrence means something else.
  "$@" < /dev/null &
  local pid=$!
  set +m
  local waited=0
  while kill -0 "$pid" 2>/dev/null; do
    if [ "$waited" -ge "$secs" ]; then
      # The step's own children (pytest, node, chrome) are what actually hold the
      # time, so kill the process GROUP, not just the shell that launched it.
      kill -TERM -"$pid" 2>/dev/null || kill -TERM "$pid" 2>/dev/null
      sleep 3
      kill -KILL -"$pid" 2>/dev/null || kill -KILL "$pid" 2>/dev/null
      return 124
    fi
    sleep 2
    waited=$((waited + 2))
  done
  wait "$pid"
}

step() {
  local label=$1; shift
  printf '\n\033[1m▶ %s\033[0m\n' "$label"
  local rc=0
  run_with_timeout "$STEP_TIMEOUT" "$@" || rc=$?
  if [ "$rc" -eq 0 ]; then
    printf '\033[32m  ✓ %s\033[0m\n' "$label"
  elif [ "$rc" -eq 124 ]; then
    printf '\033[31m  ✗ %s — TIMED OUT after %ss\033[0m\n' "$label" "$STEP_TIMEOUT"
    FAILED+=("$label (TIMED OUT after ${STEP_TIMEOUT}s — it hung, it did not fail)")
  else
    printf '\033[31m  ✗ %s\033[0m\n' "$label"
    FAILED+=("$label")
  fi
}

# *** THE TWO INTERPRETERS RUN IN PARALLEL, AND THAT IS WHAT MAKES A LOCAL-ONLY
# BACKEND GATE VIABLE AT ALL. ***
#
# CI stopped running pytest on 2026-09-09 (owner instruction: the backend suite runs
# locally, so a PR never waits on it). CI was the only place 3.11 ever ran, so this
# script is now the only thing standing between a self-hoster's interpreter and main.
#
# Run sequentially, that is 20-40 minutes — and this file's own history says a gate
# that slow gets bypassed, which is worse than no gate. The two legs are independent
# processes over an in-memory SQLite database each, exactly as CI's matrix ran them,
# so they parallelise for free: the wall clock becomes the slower leg (~8-11 min)
# rather than the sum.
#
# Output is buffered to a file per leg and printed after, because two pytest processes
# interleaving on one terminal produces a progress line nobody can read.
run_backend_legs() {
  local want311=$1
  local pids=() labels=() logs=() rcs=()

  "$PY" -m pytest -q > /tmp/preflight-312.log 2>&1 &
  pids+=($!); labels+=("backend: pytest (3.12 — what the image runs)"); logs+=(/tmp/preflight-312.log)

  if [[ "$want311" == "yes" ]]; then
    "$PY311" -m pytest -q > /tmp/preflight-311.log 2>&1 &
    pids+=($!); labels+=("backend: pytest (3.11 — what self-hosters run)"); logs+=(/tmp/preflight-311.log)
  fi

  printf '\n\033[1m▶ %s\033[0m\n' "backend: ${#pids[@]} interpreter(s), in parallel"
  local i
  for i in "${!pids[@]}"; do
    if wait "${pids[$i]}"; then
      printf '\033[32m  ✓ %s\033[0m\n' "${labels[$i]}"
      tail -1 "${logs[$i]}"
    else
      printf '\033[31m  ✗ %s\033[0m\n' "${labels[$i]}"
      tail -25 "${logs[$i]}"
      FAILED+=("${labels[$i]}")
    fi
  done
}

if [[ "$WHICH" == "all" || "$WHICH" == "backend" || "$WHICH" == "quick" ]]; then
  [[ -x "$PY" ]] || { echo "no venv at $PY — run: python -m venv venv && ./venv/bin/pip install -r requirements.txt"; exit 1; }

  WANT311=no
  if [[ "$WHICH" == "all" || "$WHICH" == "backend" ]]; then
    if [[ -x "$PY311" ]]; then
      WANT311=yes
    else
      printf '\n\033[31m✗ no 3.11 venv at %s\033[0m\n' "$PY311"
      printf '  *** CI NO LONGER RUNS pytest AT ALL, so this is the only place 3.11\n'
      printf '  can run. Without it the gate covers one interpreter and says ALL GREEN.\n'
      printf '  Create it with:\n'
      printf '    uv venv --python 3.11 venv311\n'
      printf '    uv pip install --python venv311/bin/python -r requirements.txt -r requirements-test.txt\n'
      FAILED+=("backend: pytest (3.11) — no venv311, so this leg did not run")
    fi
  fi

  run_backend_legs "$WANT311"
fi

if [[ "$WHICH" == "all" || "$WHICH" == "web" || "$WHICH" == "quick" ]]; then
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

  # The modal walk has its OWN capture and its own directory. The page capture
  # writes `container.innerHTML`, and Modal.tsx/SlidePanel.tsx portal to
  # document.body — so their markup is a sibling of that container and the two
  # walks above have never seen it.
  step "web-ui: capture for the modal walk" \
    env WALK_CAPTURE=scripts/modal-walk/capture-modals.walk.tsx \
    npx vitest run --config scripts/contrast-walk/vitest.walk.config.ts
  step "web-ui: modal overflow walk (dialogs at 4 widths, both themes)" \
    node scripts/modal-walk/run.mjs
  cd "$ROOT" || exit 1
fi

# Has CI grown a step this script does not run? Counting `run:` keys in the two test jobs
# is crude, but it fails LOUDLY when the workflow changes, which is the point: a gate that
# silently covers less than it claims is how the contrast walk got missed in the first
# place.
EXPECTED_CI_RUN_STEPS=5
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
