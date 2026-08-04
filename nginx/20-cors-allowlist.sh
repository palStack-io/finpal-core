#!/bin/sh
# Build the CORS allowlist from CORS_ALLOWED_ORIGINS before nginx starts.
#
# The official nginx image runs every /docker-entrypoint.d/*.sh in order, so this
# lands before `nginx -g 'daemon off;'`.
#
# CORS_ALLOWED_ORIGINS is a comma-separated list of exact origins, e.g.
#   CORS_ALLOWED_ORIGINS=https://finpal.example.com,https://app.example.com
# Leave it unset to keep the shipped defaults (localhost only). Same-origin
# deployments need nothing.
#
# Origins are matched exactly, not by prefix: "https://evil-example.com" must not
# match "https://example.com".
set -eu

TARGET=/etc/nginx/cors_allowlist.conf

if [ -z "${CORS_ALLOWED_ORIGINS:-}" ]; then
    echo "$0: CORS_ALLOWED_ORIGINS not set; keeping shipped allowlist defaults"
    exit 0
fi

{
    echo "# Generated from CORS_ALLOWED_ORIGINS at container start. Do not edit."
    # POSIX word-splitting on commas, so no bashisms.
    # `set -f` disables globbing first: unquoted expansion does word-splitting
    # *and* pathname expansion, so CORS_ALLOWED_ORIGINS="*" would otherwise
    # expand to the names of directories in / and never reach the '*' guard below.
    set -f
    OLD_IFS=$IFS
    IFS=,
    for origin in $CORS_ALLOWED_ORIGINS; do
        # Trim surrounding whitespace.
        trimmed=$(printf '%s' "$origin" | sed 's/^[[:space:]]*//; s/[[:space:]]*$//')
        [ -z "$trimmed" ] && continue
        case $trimmed in
            '*')
                echo "$0: refusing '*' — reflecting any origin with" \
                     "Allow-Credentials is what CVE-class CORS bugs are made of" >&2
                IFS=$OLD_IFS
                exit 1
                ;;
            http://*|https://*)
                # Quoted string key = exact match in an nginx map.
                printf '"%s" $http_origin;\n' "$trimmed"
                ;;
            *)
                echo "$0: ignoring '$trimmed' — origins must start with http:// or https://" >&2
                ;;
        esac
    done
    IFS=$OLD_IFS
    set +f
} > "$TARGET"

echo "$0: wrote $(grep -c '\$http_origin;' "$TARGET" || true) allowed origin(s) to $TARGET"
