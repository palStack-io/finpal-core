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

    endpoint, _ = app.url_map.bind('localhost').match(
        '/api/v1/auth/logout', method='POST')
    assert endpoint == 'auth_api.logout'


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


def test_the_one_remaining_duplicate_is_the_deferred_categories_collection(app):
    """Everything else has been resolved; this one is a deferred decision.

    `category_api.get_categories` filters to the caller and
    `api.categories_category_list` returns the whole household, so choosing a
    winner decides whether a category belongs to a person or a household — the
    question the owner deferred to the money-model revamp (AUDIT D-18/D-20).
    """
    from src import _KNOWN_DUPLICATE_ROUTES, _assert_no_new_duplicate_routes

    assert _KNOWN_DUPLICATE_ROUTES == {
        ('/api/v1/categories', 'GET'),
        ('/api/v1/categories', 'POST'),
    }, _KNOWN_DUPLICATE_ROUTES
    # The real app boots, which means every actual duplicate is accounted for.
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
