#!/usr/bin/env sh
# Create .env from .env.example with real, generated secrets.
#
# Why this exists: the quickstart used to be "copy the example, then edit it", and the editing
# step is the one people skip. The app now refuses to boot on the placeholder secrets this repo
# publishes (they are readable by anyone, so tokens signed with them are forgeable) -- which is
# safe but unhelpful on its own. This closes the gap: one command, real secrets, no editor.
#
# Deliberately POSIX sh and dependency-free. It runs before Docker, before Python, on whatever
# the host happens to have; needing bash or python here would defeat the point.
#
# Idempotent by refusing: it will not overwrite an existing .env, because doing so would rotate
# secrets and lock everyone out of an instance that was working a moment ago.

set -eu

cd "$(dirname "$0")/.."

if [ -f .env ]; then
    echo ".env already exists -- leaving it alone."
    echo "Delete it first if you really want fresh secrets (this logs out every user)."
    exit 0
fi

if [ ! -f .env.example ]; then
    echo "error: .env.example not found. Run this from a finPal checkout." >&2
    exit 1
fi

# openssl is on practically every host; fall back to /dev/urandom if not.
gen_secret() {
    if command -v openssl > /dev/null 2>&1; then
        openssl rand -hex 32
    else
        # 64 hex chars = 32 bytes, same strength.
        LC_ALL=C tr -dc 'a-f0-9' < /dev/urandom | head -c 64
        echo
    fi
}

SECRET_KEY_VALUE=$(gen_secret)
JWT_SECRET_KEY_VALUE=$(gen_secret)
DB_PASSWORD_VALUE=$(gen_secret | cut -c1-32)

# awk, not `sed -i`: the -i flag needs an argument on BSD/macOS and none on GNU, so a portable
# in-place sed is more trouble than reading and writing the file honestly.
awk -v secret="$SECRET_KEY_VALUE" -v jwt="$JWT_SECRET_KEY_VALUE" -v dbpw="$DB_PASSWORD_VALUE" '
    /^SECRET_KEY=/     { print "SECRET_KEY=" secret; next }
    /^JWT_SECRET_KEY=/ { print "JWT_SECRET_KEY=" jwt; next }
    /^DB_PASSWORD=/    { print "DB_PASSWORD=" dbpw; next }
    { print }
' .env.example > .env

chmod 600 .env

echo "Wrote .env with generated SECRET_KEY, JWT_SECRET_KEY and DB_PASSWORD (mode 600)."
echo
echo "Next:"
echo "  docker compose up -d"
echo "  open http://localhost      # first account to sign up becomes the admin"
