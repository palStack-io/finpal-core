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

    with pytest.raises(RuntimeError, match='Duplicate URL rules'):
        _assert_no_new_duplicate_routes(probe)


def test_known_duplicates_are_tolerated_but_recorded(app):
    """The pre-existing duplicates must not break the boot — they are load-bearing.

    web-ui calls /api/v1/transactions and gets the blueprint; mobile calls
    /api/v1/transactions/ and gets restx. Deleting either side breaks a client.
    """
    from src import _KNOWN_DUPLICATE_RULES, _assert_no_new_duplicate_routes

    assert '/api/v1/transactions' in _KNOWN_DUPLICATE_RULES
    # The real app boots, which means every actual duplicate is accounted for.
    _assert_no_new_duplicate_routes(app)
