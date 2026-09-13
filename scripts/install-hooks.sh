#!/usr/bin/env bash
#
# Install this repo's git hooks. Run once per clone.
#
#     ./scripts/install-hooks.sh
#
# Git hooks live in `.git/hooks/`, which is NOT tracked — so a hook cannot ship with the
# repo and every clone starts with none. That is why this script exists rather than the
# hooks just being there: the tracked copies live in `scripts/hooks/` and this symlinks
# them into place, so editing a hook edits the tracked file and nobody ends up running a
# private, drifted copy.
#
# Symlinks rather than copies, deliberately. A copied hook goes stale silently the moment
# the tracked one changes, and a stale gate that still exits 0 is the exact shape this
# project keeps getting caught by.
set -uo pipefail

cd "$(dirname "$0")/.." || exit 1
ROOT=$(pwd)
HOOK_SRC="$ROOT/scripts/hooks"
HOOK_DST="$ROOT/.git/hooks"

if [[ ! -d "$HOOK_DST" ]]; then
  echo "No .git/hooks directory at $HOOK_DST — is this a git clone?" >&2
  exit 1
fi

installed=0
for src in "$HOOK_SRC"/*; do
  [[ -f "$src" ]] || continue
  name=$(basename "$src")
  chmod +x "$src"
  ln -sf "$src" "$HOOK_DST/$name"
  printf '  \033[32m✓\033[0m %-12s -> scripts/hooks/%s\n' "$name" "$name"
  installed=$((installed + 1))
done

if [[ "$installed" -eq 0 ]]; then
  echo "Nothing in scripts/hooks/ to install." >&2
  exit 1
fi

printf '\n%s hook(s) installed.\n' "$installed"
printf 'pre-commit runs ./scripts/preflight.sh, SCOPED to what is staged, and refuses\n'
printf 'a red commit. pre-push now runs only the privacy guard.\n'
printf '\n'
printf 'The gate moved from pre-push to pre-commit on 2026-09-13 (D-190): a pre-push hook\n'
printf 'holds the SSH transport open for the whole ~12-minute preflight, GitHub closes the\n'
printf 'idle connection, and the push dies AFTER the gate prints "ALL GREEN". A commit\n'
printf 'holds no connection, so nothing can time out.\n'
printf 'Bypass deliberately with: SKIP_PREFLIGHT=1 git push\n'

# Prove it is live rather than asserting it — `make a check fail before believing it
# passes` is the house rule, and a hook that is present but not executable is the
# classic silent no-op.
# *** BOTH HOOKS, NOT JUST ONE. *** This checked only `pre-push` until 2026-09-13,
# which was fine while pre-push carried the gate. It now carries only the privacy
# guard and `pre-commit` carries everything else -- so verifying pre-push alone
# would report success on a clone where the real gate is not installed at all.
ok=1
for h in pre-commit pre-push; do
  if [[ -x "$HOOK_DST/$h" ]]; then
    printf '\033[32m  ✓ .git/hooks/%s is present and executable\033[0m\n' "$h"
  else
    printf '\033[31m  ✗ .git/hooks/%s is NOT executable — it will not run\033[0m\n' "$h"
    ok=0
  fi
done
if [[ "$ok" -ne 1 ]]; then
  exit 1
fi
