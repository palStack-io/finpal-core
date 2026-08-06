"""S-07, S-08 and S-13 against the handlers that actually serve traffic.

All three were fixed on the flask-restx surface in `api/v1/auth.py`, but
`src/__init__.py` registers `src/services/auth/api_routes.py`'s blueprint first
and it claims identical URLs, so Werkzeug routes real requests to the older
handler. The fixes were committed, reviewed and dead.

These tests deliberately go through the URL. If the routing ever flips, or the
legacy blueprint is removed, they keep testing whatever is actually live.
"""
import pytest

from src.extensions import db
from src.models.user import RevokedToken
from tests.factories import UserFactory


def test_auth_routes_are_no_longer_duplicated(app):
    """The six shadowed restx Resources are gone; one handler per auth rule.

    This test previously asserted the *opposite* — that duplicates existed — so
    that the assertions below could not silently drift onto dead code. The
    duplicates have since been deleted, so it now pins the cleaned-up state.
    """
    auth_rules = {}
    for rule in app.url_map.iter_rules():
        path = str(rule.rule)
        if path.startswith('/api/v1/auth'):
            auth_rules.setdefault(path, set()).add(rule.endpoint)

    duplicated = {p: sorted(eps) for p, eps in auth_rules.items() if len(eps) > 1}
    assert not duplicated, f'auth rules are shadowed again: {duplicated}'

    # This used to assert `endpoint == 'auth_api.logout'`, naming the blueprint
    # that served it. That is a guard keyed to a spelling, and it went off the
    # moment the handlers were ported onto flask-restx — the third time this
    # project has watched a name-keyed guard fire on a rename instead of on a
    # defect. What it was really protecting is that the assertions below run
    # against whatever is live, and the no-duplicates check above already
    # guarantees there is only one candidate.
    #
    # Re-keyed to the property that actually matters now: the handler serving
    # /auth/logout must be one flask-restx knows about, because a route restx
    # does not own is a route absent from swagger — which is exactly the defect
    # this port existed to fix. Asserted through the swagger document itself, not
    # through an endpoint name, so it survives the next rename too.
    endpoint, _ = app.url_map.bind('localhost').match(
        '/api/v1/auth/logout', method='POST')
    assert endpoint in app.view_functions

    spec = app.test_client().get('/api/v1/swagger.json').get_json()
    assert '/auth/logout' in spec['paths'], (
        'POST /api/v1/auth/logout is not in swagger, so it is served by '
        'something restx does not document: %s' % sorted(spec['paths'])[:10])
    assert 'post' in spec['paths']['/auth/logout']


# --- S-08: logout must revoke the token -------------------------------------

def test_logout_revokes_the_token(client, db, auth_headers):
    user = UserFactory()
    headers = auth_headers(user)

    assert client.get('/api/v1/auth/me', headers=headers).status_code == 200

    assert client.post('/api/v1/auth/logout', headers=headers).status_code == 200

    after = client.get('/api/v1/auth/me', headers=headers)
    assert after.status_code == 401, (
        'the token still worked after logout — a stolen token stays valid '
        'until it expires')


def test_logout_records_the_revocation(client, db, auth_headers):
    user = UserFactory()
    client.post('/api/v1/auth/logout', headers=auth_headers(user))
    assert RevokedToken.query.count() == 1


# --- S-13: register must not confirm which emails exist ---------------------

def test_register_does_not_reveal_that_an_account_exists(client, db):
    existing = UserFactory(id='taken@example.com')
    db.session.commit()

    resp = client.post('/api/v1/auth/register', json={
        'email': 'taken@example.com', 'password': 'AnotherPass123!'})

    assert resp.status_code == 400
    body = resp.get_data(as_text=True).lower()
    for tell in ('already exists', 'already registered', 'taken'):
        assert tell not in body, (
            f'response confirms the account exists ({tell!r}): {body}')


# --- S-07: login must be rate limited --------------------------------------

@pytest.fixture
def rate_limiting_on():
    """conftest disables the limiter so the shared app fixture does not trip it.

    This turns it back on for one test, and resets the counters, so the assertion
    below is about the decorator on the live route rather than leftover state.
    """
    from src.extensions import limiter
    limiter.enabled = True
    limiter.reset()
    yield
    limiter.reset()
    limiter.enabled = False


def test_login_is_rate_limited(client, db, rate_limiting_on):
    """Unthrottled login is free credential stuffing."""
    UserFactory(id='victim@example.com')
    db.session.commit()

    statuses = []
    for _ in range(25):
        r = client.post('/api/v1/auth/login', json={
            'email': 'victim@example.com', 'password': 'wrong-guess'})
        statuses.append(r.status_code)
        if r.status_code == 429:
            break

    assert 429 in statuses, (
        f'25 failed logins drew no 429; statuses seen: {sorted(set(statuses))}')


# --- the guard that makes this class of bug impossible to reintroduce ---------

def test_startup_rejects_a_new_duplicate_route(app):
    """A new shadowed handler must break the boot, not hide.

    Three security fixes were once written on handlers a duplicate rule had made
    unreachable. This is the check that would have caught it.
    """
    from flask import Flask

    from src import _assert_no_new_duplicate_routes

    probe = Flask('probe')
    probe.add_url_rule('/api/v1/thing', endpoint='first', view_func=lambda: '')
    probe.add_url_rule('/api/v1/thing', endpoint='second', view_func=lambda: '')

    with pytest.raises(RuntimeError, match='Duplicate URL routes'):
        _assert_no_new_duplicate_routes(probe)


def test_startup_rejects_a_duplicate_that_differs_only_by_trailing_slash(app):
    """The gap that let the shadowing survive four audits.

    `url_map.strict_slashes = False` makes a slash-less rule match the slashed
    request too, so these two rules are one route. The guard compared rule strings
    without normalising the slash, so it reported success while web-ui and mobile
    were being served different implementations of groups and of transaction
    creation.
    """
    from flask import Flask

    from src import _assert_no_new_duplicate_routes

    probe = Flask('probe')
    probe.url_map.strict_slashes = False
    probe.add_url_rule('/api/v1/thing', endpoint='bare', view_func=lambda: '')
    probe.add_url_rule('/api/v1/thing/', endpoint='slashed', view_func=lambda: '')

    with pytest.raises(RuntimeError, match='Duplicate URL routes'):
        _assert_no_new_duplicate_routes(probe)


def test_differing_methods_on_one_path_are_not_a_duplicate(app):
    """Two handlers on one path under different verbs are two routes.

    The legacy blueprint claims `POST /groups/<id>/members` and restx claims
    `GET`. Keying only on the path called that a duplicate and cost the allowlist
    an entry that hid a real one.
    """
    from flask import Flask

    from src import _assert_no_new_duplicate_routes

    probe = Flask('probe')
    probe.add_url_rule('/api/v1/thing', endpoint='reader',
                       view_func=lambda: '', methods=['GET'])
    probe.add_url_rule('/api/v1/thing', endpoint='writer',
                       view_func=lambda: '', methods=['POST'])

    _assert_no_new_duplicate_routes(probe)


def test_no_route_collision_is_allowlisted_any_more(app):
    """There are no deliberate duplicates left, and none should come back.

    This test used to assert the *opposite* — that `_KNOWN_DUPLICATE_ROUTES` held
    exactly the categories collection, because `category_api.get_categories`
    filtered to the caller while `api.categories_category_list` returned the whole
    household, and choosing a winner would have decided whether a category belongs
    to a person or a household by accident. That was D-20, deferred with the
    owner's "redo it, don't patch it".

    The owner settled the model on 2026-08-06 — a household is the instance and
    "budget, categories and rest is for household" — so the blueprint is deleted,
    one handler serves both slash spellings, and the allowlist is empty.

    **Asserted as empty rather than as "categories are absent from it"**, so it
    also catches the next port that widens the allowlist instead of resolving the
    collision. That is the failure mode the allowlist invites: a duplicate listed
    here means two clients can be served different code for one URL and no other
    test will notice, because `/x` and `/x/` are not the same `(path, method)` to
    the shadowing guard.
    """
    from src import _KNOWN_DUPLICATE_ROUTES, _assert_no_new_duplicate_routes

    assert _KNOWN_DUPLICATE_ROUTES == set(), (
        'a route collision is allowlisted again — resolve it or justify it here: '
        f'{sorted(_KNOWN_DUPLICATE_ROUTES)}')
    # The real app boots, which means there are no unaccounted duplicates either.
    _assert_no_new_duplicate_routes(app)


def test_transactions_is_no_longer_a_duplicate_rule(app):
    """The transactions duplicate is resolved, and must stay that way.

    It used to be the worst of the set: web-ui reached the legacy blueprint,
    which read no query parameters and returned the entire history, while mobile
    reached the paginating restx handler on the slashed spelling. One resource,
    two implementations, and the same split that left S-06 fixed for mobile and
    broken for the web.

    The legacy GET is retired, so only the restx rule serves lists. If a list
    handler is ever added back to the blueprint this fails, and
    `_KNOWN_DUPLICATE_ROUTES` should not simply be widened again to accommodate it.

    The POST has since gone the same way, which left the blueprint with no rules
    at all — it is no longer registered. So both verbs are asserted here.
    """
    from src import _KNOWN_DUPLICATE_ROUTES

    assert ('/api/v1/transactions', 'GET') not in _KNOWN_DUPLICATE_ROUTES
    assert ('/api/v1/transactions', 'POST') not in _KNOWN_DUPLICATE_ROUTES

    for method in ('GET', 'POST'):
        endpoints = {
            rule.endpoint
            for rule in app.url_map.iter_rules()
            if rule.rule.rstrip('/') == '/api/v1/transactions'
            and method in rule.methods
        }
        assert endpoints == {'api.transactions_transaction_list'}, (
            '%s /api/v1/transactions is served by %s' % (method, endpoints))
