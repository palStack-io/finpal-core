"""Every `/api/v1/...` URL web-ui names must be a route this app serves.

The single most repeated defect in this codebase is a client calling an endpoint that
does not exist. PR #42 deleted **18** such service methods at once (AUDIT D-15), each
verified by hand — absent from `app.url_map` under any verb, and 404 against the
deployed instance. `authService.getCurrentUser` was a nineteenth, pointing at
`/api/v1/auth/profile` when the route is `/api/v1/auth/me`.

Hand-verification does not scale and does not repeat. This checks the whole surface at
once, in the only place that can see both sides: web-ui ships inside this repository,
so a pytest can read its source and compare it against the live `url_map`.

It is deliberately keyed to the *mechanism* — every URL literal in the client — rather
than to a list of known-bad endpoints. Three gates earlier in this session each missed
a defect because they enumerated known cases; see AUDIT D-28.

Not a lint rule about strings: a URL that does not resolve is a feature that silently
does nothing, and the client has no way to find out except at runtime.
"""
import re
from pathlib import Path

import pytest

WEB_SRC = Path(__file__).resolve().parents[2] / 'web-ui' / 'src'

# URLs web-ui names that this app deliberately does not serve. Each needs a reason.
# Empty: a client should not reference an endpoint that does not exist.
ALLOWED_MISSING = set()


def _without_comments(text):
    """Strip `//` and `/* */` comments.

    Necessary, not cosmetic: a comment explaining that a URL does *not* exist names
    that URL, and backticks are one of the quote styles the scanner matches. Without
    this, documenting a removal re-triggers the failure that prompted it — which is
    exactly what happened when `/api/v1/auth/profile` was deleted and explained.

    Deliberately crude. It can mangle a `//` inside a string literal, but no API URL
    literal here contains one, and the alternative is a TypeScript parser.
    """
    text = re.sub(r'/\*.*?\*/', '', text, flags=re.DOTALL)
    return re.sub(r'(?<!:)//[^\n]*', '', text)


def _client_urls():
    """Every `/api/v1/...` literal in web-ui, normalised to a route shape.

    Handles both quote styles, strips query strings, and turns `${expr}`
    interpolations into the same placeholder the url_map side uses.
    """
    pattern = re.compile(r"""['"`](/api/v1/[^'"`]*)['"`]""")
    found = {}
    for path in WEB_SRC.rglob('*.ts*'):
        if '__tests__' in path.parts or '__mocks__' in path.parts:
            # Mocks name URLs on purpose, including shapes the server never had —
            # that is how a contract test once passed against a nonexistent payload.
            continue
        text = _without_comments(
            path.read_text(encoding='utf-8', errors='replace'))
        for raw in pattern.findall(text):
            url = raw.split('?')[0]
            url = re.sub(r'\$\{[^}]*\}', '<*>', url)
            url = url.rstrip('/') or '/'
            if url.startswith('/api/v1'):
                found.setdefault(url, set()).add(
                    str(path.relative_to(WEB_SRC.parent.parent)))
    return found


def _server_routes(app):
    shapes = set()
    for rule in app.url_map.iter_rules():
        shape = re.sub(r'<[^>]+>', '<*>', str(rule.rule)).rstrip('/') or '/'
        if shape.startswith('/api/v1'):
            shapes.add(shape)
    return shapes


def _is_served(url, served):
    """True if `url` is a route, or the base prefix of one.

    The prefix case is needed because a client may hold a base constant and append
    to it — `web-ui/src/modules/pointspal/service.ts:214` has
    `const BASE = '/api/v1/pointspal'`, which is never requested on its own but is
    the root of twelve real routes.

    The trade-off, stated plainly: this also accepts a parent path when only its
    children exist, so `/api/v1/x` passes if `/api/v1/x/<id>` is served. That is a
    real weakening. It is preferred over an allowlist entry per base constant,
    because an allowlist has to be maintained and a rule does not — and the defect
    class this guards against is a *leaf* URL that resolves nowhere, which the
    prefix rule still catches.
    """
    if url in served:
        return True
    return any(route.startswith(url + '/') for route in served)


def test_web_ui_names_no_endpoint_that_does_not_exist(app):
    client_urls = _client_urls()
    assert client_urls, 'found no API URLs in web-ui — the scanner is broken'

    served = _server_routes(app)
    missing = {
        url: sorted(files) for url, files in client_urls.items()
        if not _is_served(url, served) and url not in ALLOWED_MISSING
    }

    assert not missing, (
        'web-ui calls these and no route serves them, so each is a feature that '
        'silently does nothing:\n%s' % '\n'.join(
            '  %-46s %s' % (url, ', '.join(files))
            for url, files in sorted(missing.items())))


def test_the_allowlist_is_not_hiding_a_route_that_now_exists(app):
    """Keeps `ALLOWED_MISSING` honest, the same way the duplicate-route allowlist is
    kept honest: an entry that starts resolving must come out."""
    served = _server_routes(app)
    stale = sorted(url for url in ALLOWED_MISSING if url in served)
    assert not stale, (
        'these are allowlisted as missing but the app now serves them — remove '
        'them from ALLOWED_MISSING: %s' % stale)


def test_the_scanner_sees_a_url_it_should_reject():
    """Confirms the scan actually reads files and normalises, rather than passing
    because it found nothing.

    A gate that silently scans zero files reports success, which is how the
    trailing-slash duplicates survived four audits.
    """
    urls = _client_urls()
    # A URL every client uses, with a path parameter, proving interpolation is
    # normalised rather than left as `${id}`.
    assert '/api/v1/transactions/<*>' in urls, sorted(urls)[:20]
    assert '/api/v1/auth/login' in urls
