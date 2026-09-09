#!/usr/bin/env bash
#
# End-to-end: boot a real stack, drive a real browser, tear it all down.
#
# ONE COMMAND, A FEW LINES OF OUTPUT:
#
#     ./scripts/e2e/run.sh              # everything
#     ./scripts/e2e/run.sh standards    # WCAG AA only
#     ./scripts/e2e/run.sh goals        # the goals flow only
#
# *** WHY THIS EXISTS ALONGSIDE THE THREE WALKS. *** `contrast-walk`,
# `responsive-walk` and `modal-walk` render components into jsdom and measure the
# captures. They are good at what they do and they cannot click through a login,
# cannot see a route guard, cannot notice that the API renamed a field, and
# cannot read an accessibility tree — that structure only exists in a real
# browser. This drives Chromium against Flask.
#
# *** IT IS NOT PART OF preflight.sh, ON PURPOSE. *** Preflight runs before every
# push and already takes ~15 minutes. This needs browser binaries and a booted
# stack; bolting it on is how a pre-push gate starts getting skipped, and a
# skipped gate protects nothing. Run it deliberately, before a release or after
# touching the UI.
#
# THE DATABASE IS A THROWAWAY FILE, SEEDED FROM SCRATCH. Never the deployed demo:
# these specs create and delete goals, and a suite that mutates a public service
# is a suite nobody will dare run twice.
set -uo pipefail

cd "$(dirname "$0")/../.." || exit 1
ROOT="$PWD"
FILTER="${1:-}"

BACKEND_PORT=5001
FRONTEND_PORT=5173
DB_FILE="$(mktemp -t finpal-e2e-XXXXXX).sqlite"
LOG_DIR="$(mktemp -d -t finpal-e2e-logs-XXXXXX)"
BACKEND_PID=""
FRONTEND_PID=""

red()   { printf '\033[31m%s\033[0m\n' "$*"; }
green() { printf '\033[32m%s\033[0m\n' "$*"; }
dim()   { printf '\033[2m%s\033[0m\n' "$*"; }

cleanup() {
  [ -n "$FRONTEND_PID" ] && kill "$FRONTEND_PID" 2>/dev/null
  [ -n "$BACKEND_PID" ]  && kill "$BACKEND_PID"  2>/dev/null
  # The vite dev server forks; killing the parent leaves the child on the port,
  # so the NEXT run boots against a stale bundle and reports a phantom failure.
  lsof -ti :"$FRONTEND_PORT" 2>/dev/null | xargs kill -9 2>/dev/null
  lsof -ti :"$BACKEND_PORT"  2>/dev/null | xargs kill -9 2>/dev/null
  rm -f "$DB_FILE"
}
trap cleanup EXIT INT TERM

# A port already in use means something else is answering, and every assertion
# below would then be about that other thing. Refuse rather than guess.
for port in "$BACKEND_PORT" "$FRONTEND_PORT"; do
  if lsof -ti :"$port" >/dev/null 2>&1; then
    red "Port $port is already in use."
    dim  "  Something else would answer these tests. Stop it, or run:"
    dim  "    lsof -ti :$port | xargs kill"
    exit 1
  fi
done

if [ ! -d "$ROOT/web-ui/node_modules/@playwright" ]; then
  red "Playwright is not installed."
  dim  "  cd web-ui && npm install && npx playwright install chromium"
  exit 1
fi

wait_for() {  # wait_for <url> <label> <seconds>
  local url="$1" label="$2" limit="$3" waited=0
  until curl -fsS -o /dev/null "$url" 2>/dev/null; do
    sleep 1; waited=$((waited + 1))
    if [ "$waited" -ge "$limit" ]; then
      red "  ✗ $label did not come up in ${limit}s"
      dim "  ---- last 25 lines ----"
      tail -25 "$LOG_DIR/$label.log" 2>/dev/null
      exit 1
    fi
  done
  green "  ✓ $label"
}

printf '\n\033[1mfinPal E2E\033[0m  %s\n' "$(date '+%H:%M:%S')"
dim "  database  $DB_FILE (throwaway, seeded from scratch)"
dim "  logs      $LOG_DIR"
echo "────────────────────────────────"

# DEMO_MODE=true is what runs the seeder, and the seeder is what gives these
# specs demo1@finpal.demo with goals, a co-owned account and credit terms. If the
# demo seed regresses, this suite goes red — which is the point, because D-77 has
# escaped three times with everything downstream of the seed staying green.
SECRET_KEY="e2e-only-not-a-real-secret-000000000000" \
JWT_SECRET_KEY="e2e-only-not-a-real-secret-111111111111" \
SQLALCHEMY_DATABASE_URI="sqlite:///$DB_FILE" \
DEMO_MODE=true \
EMAIL_ENABLED=false \
"$ROOT/venv/bin/python" -m flask --app src run --port "$BACKEND_PORT" --no-reload \
  > "$LOG_DIR/backend.log" 2>&1 &
BACKEND_PID=$!
wait_for "http://localhost:$BACKEND_PORT/health" backend 60

# Vite proxies /api to :5001 (vite.config.ts), so the client's relative baseURL
# reaches the backend with no CORS and no build-time configuration.
# *** VITE_API_BASE_URL IS PINNED HERE, IN THE ENVIRONMENT, AND IT IS
# LOAD-BEARING. *** Vite gives a variable already present in the shell higher
# priority than any env FILE, so this overrides whatever a developer has locally.
# On this machine the untracked `web-ui/.env` sets it to `http://localhost` —
# port 80, where nothing listens — and the symptom was brutal to read: a login
# form that filled correctly, a button that clicked, and no error anywhere,
# because axios failed at the network layer and the page had already rendered
# its heading.
#
# Empty means relative URLs, which the Vite proxy forwards to Flask — the same
# path production takes through nginx, so this exercises real code rather than a
# special case.
#
# It is set here rather than in a committed `.env.e2e` because
# `test_no_private_data_in_tracked_files.py` refuses ANY tracked env file that is
# not an example, and that guard exists because 980 files carrying home paths
# once reached this public repo (D-169). Widening a secrets guard for a
# convenience file is the wrong trade; one line of shell costs nothing.
( cd "$ROOT/web-ui" && VITE_API_BASE_URL= npx vite --port "$FRONTEND_PORT" --strictPort ) \
  > "$LOG_DIR/frontend.log" 2>&1 &
FRONTEND_PID=$!
wait_for "http://localhost:$FRONTEND_PORT" frontend 60

echo "────────────────────────────────"
cd "$ROOT/web-ui" || exit 1
if [ -n "$FILTER" ]; then
  npx playwright test "$FILTER"
else
  npx playwright test
fi
STATUS=$?

echo "────────────────────────────────"
if [ "$STATUS" -eq 0 ]; then
  green "ALL GREEN — real browser, real API, seeded demo data."
else
  red "E2E FAILED."
  dim "  backend log:  $LOG_DIR/backend.log"
  dim "  traces:       web-ui/test-results/"
  # Kept on failure so the log paths above still resolve.
  trap - EXIT
  [ -n "$FRONTEND_PID" ] && kill "$FRONTEND_PID" 2>/dev/null
  [ -n "$BACKEND_PID" ]  && kill "$BACKEND_PID"  2>/dev/null
  lsof -ti :"$FRONTEND_PORT" 2>/dev/null | xargs kill -9 2>/dev/null
  lsof -ti :"$BACKEND_PORT"  2>/dev/null | xargs kill -9 2>/dev/null
fi
exit "$STATUS"
