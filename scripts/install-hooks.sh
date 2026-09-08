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
printf 'pre-push now runs ./scripts/preflight.sh and refuses a red push.\n'
printf 'Bypass deliberately with: SKIP_PREFLIGHT=1 git push\n'

# Prove it is live rather than asserting it — `make a check fail before believing it
# passes` is the house rule, and a hook that is present but not executable is the
# classic silent no-op.
if [[ -x "$HOOK_DST/pre-push" ]]; then
  printf '\n\033[32mVerified: .git/hooks/pre-push is present and executable.\033[0m\n'
else
  printf '\n\033[31mWARNING: .git/hooks/pre-push is NOT executable — it will not run.\033[0m\n'
  exit 1
fi
