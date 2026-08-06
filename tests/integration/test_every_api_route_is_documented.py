"""Every live /api/v1 route must appear in swagger.json.

**Why this is a gate and not a nice-to-have.** Only flask-restx resources appear
in the swagger document; a route on a plain Flask blueprint serves traffic and is
invisible to it. That gap is not cosmetic — it is what made a generated OpenAPI
client useless. Measured before the auth port: swagger documented 167 operations,
mobile made 70 distinct `(method, path)` calls, and **17 of them were absent**,
*including every single authentication call*. A client generated from that
document would have had no login, no register and no refresh.

Counting it by hand found that. Nothing would have found it a second time, which
is what this file is for.

**Keyed to the mechanism, with a shrinking inventory.** The rule is
`every rule in app.url_map under /api/v1 is in swagger.json`, derived from the
routing table at runtime — not from a list of families somebody remembered to
add. `UNDOCUMENTED` below is an explicit inventory of what is *known* to be
missing, and the assertion is two-sided: an entry that gets documented must be
removed from the list, so the inventory can only shrink. A one-sided assertion
would let it rot into a list of things nobody intends to fix, which is how
`_KNOWN_DUPLICATE_ROUTES` earned its comment.

**Path comparison.** Werkzeug spells converters `<int:id>`, swagger spells them
`{id}`, and the two do not agree on the *name* either — `api/v1/groups.py` calls
it `id` where the retired blueprint called it `group_id`. Parameter names play no
part in matching a URL, so they are erased to `{}` before comparing. Getting this
wrong is not a hypothetical: the first run of this comparison reported 41 false
positives because `<int:id>` was normalised to `<id>` rather than `{}`, which
looks exactly like a real finding.
"""
import re

import pytest

# Live routes that are NOT in swagger. This list must only ever get shorter.
#
# `/api/v1` and `/api/v1/docs` are flask-restx's own documentation endpoints —
# the Swagger UI and its root redirect. They are not part of the API and restx
# does not document itself, so they stay here permanently.
#
# The four `categories/{}` rules are the last plain-blueprint family
# (src/services/category/api_routes.py). restx owns only the collection route,
# while the detail route — which both mobile and web-ui call — is the
# blueprint's. Porting it is step 1b, and doing so must delete those four lines.
UNDOCUMENTED = {
    ('GET', '/api/v1'),
    ('GET', '/api/v1/docs'),
    ('GET', '/api/v1/categories/{}'),
    ('PUT', '/api/v1/categories/{}'),
    ('PATCH', '/api/v1/categories/{}'),
    ('DELETE', '/api/v1/categories/{}'),
}

METHODS = {'GET', 'POST', 'PUT', 'PATCH', 'DELETE'}


def _normalise(path):
    """`/api/v1/groups/<int:id>` and `/groups/{group_id}` must compare equal."""
    path = re.sub(r'<(?:[^:>]+:)?([^>]+)>', r'{\1}', path)
    path = re.sub(r'\{[^}]*\}', '{}', path)
    return path.rstrip('/') or '/'


@pytest.fixture
def surfaces(app, client):
    spec = client.get('/api/v1/swagger.json').get_json()
    assert spec and spec.get('paths'), 'swagger.json served nothing usable'

    documented = {
        (method.upper(), _normalise('/api/v1' + path))
        for path, operations in spec['paths'].items()
        for method in operations
        if method.upper() in METHODS
    }

    live = set()
    for rule in app.url_map.iter_rules():
        path = str(rule.rule)
        if not path.startswith('/api/v1') or '/swagger' in path:
            continue
        for method in rule.methods - {'HEAD', 'OPTIONS'}:
            live.add((method, _normalise(path)))

    return live, documented


def test_every_live_api_route_is_in_swagger(surfaces):
    live, documented = surfaces
    missing = live - documented - UNDOCUMENTED
    assert not missing, (
        'these routes serve traffic but are absent from swagger.json, so a '
        'generated client cannot call them: %s' % sorted(missing))


def test_the_undocumented_inventory_has_no_stale_entries(surfaces):
    """The other half. Without it the inventory only ever grows.

    An entry that has since been documented is not harmless: it is permission
    for the next port to quietly skip a family and still pass.
    """
    live, documented = surfaces
    fixed = {entry for entry in UNDOCUMENTED if entry in documented}
    assert not fixed, (
        'these are documented now — delete them from UNDOCUMENTED: %s'
        % sorted(fixed))

    gone = {entry for entry in UNDOCUMENTED
            if entry not in live and entry not in documented}
    assert not gone, (
        'these routes no longer exist — delete them from UNDOCUMENTED: %s'
        % sorted(gone))


def test_the_whole_auth_surface_is_documented(surfaces):
    """The point of the port, asserted directly rather than inferred.

    `npm test` passing and the contract oracle passing both say the *behaviour*
    survived. Neither says the routes are in the document, which is the only
    reason the port happened.
    """
    live, documented = surfaces
    auth_routes = {(m, p) for m, p in live if p.startswith('/api/v1/auth')}
    assert len(auth_routes) >= 15, (
        f'expected at least 15 auth rules, found {len(auth_routes)}: '
        f'{sorted(auth_routes)}')
    missing = auth_routes - documented
    assert not missing, f'auth routes absent from swagger: {sorted(missing)}'

    # Named explicitly, because these three are what a generated client is
    # useless without and what was measured missing before the port.
    for method, path in (('POST', '/api/v1/auth/login'),
                         ('POST', '/api/v1/auth/register'),
                         ('POST', '/api/v1/auth/refresh')):
        assert (method, path) in documented, f'{method} {path} is not in swagger'


def test_a_documented_required_field_is_actually_required(app, client, db):
    """Presence in swagger is not the same as swagger being *true*.

    Caught in review of the auth port, not by any gate: `@ns.expect` was put on
    `/auth/register` carrying a model that declared `username` required, while the
    handler defaults it to the local part of the email. That model had been inert
    scaffolding for two years — the Resources it was written for were deleted in
    #19 — and publishing it would have made `username` mandatory in every
    generated client. A missing route and a route documented with the wrong
    contract break a generated client identically.

    Checked by *making the request the document says is invalid* and asserting the
    server accepts it, so this cannot drift out of agreement with the handler.
    """
    spec = client.get('/api/v1/swagger.json').get_json()
    required = spec['definitions']['Register'].get('required', [])
    assert 'username' not in required, (
        'swagger says username is required to register, but the handler '
        'defaults it — a generated client would demand a field nobody needs')

    resp = client.post('/api/v1/auth/register',
                       json={'email': 'nousername@finpal.test',
                             'password': 'longenough1'})
    assert resp.status_code == 201, (
        'registering without a username failed, so `username` really is '
        f'required and the model should say so: {resp.get_json()}')
    assert resp.get_json()['user']['name'] == 'nousername'

    # Both fields the model *does* mark required must genuinely be refused when
    # absent, or the assertion above is only half a check.
    for missing in ('email', 'password'):
        body = {'email': 'x@finpal.test', 'password': 'longenough1'}
        del body[missing]
        assert missing in required, f'{missing} should be documented as required'
        assert client.post('/api/v1/auth/register',
                           json=body).status_code == 400


def test_the_comparison_can_fail(surfaces):
    """Proof this file inspects something.

    A `_normalise` that mapped everything to the same string, or a swagger fetch
    that returned every path, would satisfy the assertions above silently. This
    project has hit a check that inspects nothing four separate times.
    """
    live, documented = surfaces
    assert ('POST', '/api/v1/auth/login') in live
    assert ('POST', '/api/v1/auth/lgoin') not in documented
    assert ('DELETE', '/api/v1/auth/login') not in documented
    # Normalisation must erase converter names but not path structure.
    assert _normalise('/api/v1/groups/<int:id>') == '/api/v1/groups/{}'
    assert _normalise('/groups/{group_id}') == '/groups/{}'
    assert _normalise('/api/v1/groups/<int:id>') != _normalise('/api/v1/groups')
