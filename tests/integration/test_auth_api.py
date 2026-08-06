"""
Integration tests for auth API.

Tests: login (success/wrong password/unknown user), register,
/me (authed/unauthed), /sync endpoint.

Note: client fixture already provides app_context — do NOT nest with app.app_context().
      Store user.id as a plain string immediately after factory creation to avoid
      DetachedInstanceError if the session closes between statements.
"""

import pytest
from tests.factories import UserFactory


# ---------------------------------------------------------------------------
# Login
# ---------------------------------------------------------------------------

def test_login_success(client, db):
    user = UserFactory()
    user_id = user.id
    resp = client.post('/api/v1/auth/login', json={
        'email': user_id, 'password': 'testpassword',
    })
    assert resp.status_code == 200
    data = resp.get_json()
    assert 'access_token' in data
    assert data['user']['email'] == user_id


def test_login_wrong_password(client, db):
    user = UserFactory()
    user_id = user.id
    resp = client.post('/api/v1/auth/login', json={
        'email': user_id, 'password': 'wrongpassword',
    })
    assert resp.status_code == 401


def test_login_unknown_user(client, db):
    resp = client.post('/api/v1/auth/login', json={
        'email': 'nobody@test.com', 'password': 'anything',
    })
    assert resp.status_code == 401


def test_login_returns_modules_list(client, db):
    user = UserFactory()
    user_id = user.id
    resp = client.post('/api/v1/auth/login', json={
        'email': user_id, 'password': 'testpassword',
    })
    data = resp.get_json()
    assert 'modules' in data['user']
    assert isinstance(data['user']['modules'], list)


# ---------------------------------------------------------------------------
# Register
# ---------------------------------------------------------------------------

def test_register_creates_user(client, db):
    resp = client.post('/api/v1/auth/register', json={
        'email': 'new@test.com',
        'password': 'password123',
        'name': 'New User',
    })
    assert resp.status_code == 201
    data = resp.get_json()
    assert data['user']['email'] == 'new@test.com'


def test_register_duplicate_email_returns_409(client, db):
    user = UserFactory()
    user_id = user.id
    resp = client.post('/api/v1/auth/register', json={
        'email': user_id,
        'password': 'password123',
        'name': 'Dupe User',
    })
    assert resp.status_code in (400, 409)  # api_routes.py returns 400 for existing user


# ---------------------------------------------------------------------------
# /me
# ---------------------------------------------------------------------------

def test_me_returns_user_when_authed(client, db, auth_headers):
    user = UserFactory()
    user_id = user.id
    headers = auth_headers(user)
    resp = client.get('/api/v1/auth/me', headers=headers)
    assert resp.status_code == 200
    assert resp.get_json()['email'] == user_id


def test_me_returns_401_when_unauthenticated(client, db):
    resp = client.get('/api/v1/auth/me')
    assert resp.status_code == 401


# ---------------------------------------------------------------------------
# /sync
# ---------------------------------------------------------------------------

def test_sync_returns_200_when_authed(client, db, auth_headers):
    user = UserFactory()
    headers = auth_headers(user)
    resp = client.post('/api/v1/auth/sync', headers=headers)
    assert resp.status_code in (200, 202)  # /sync returns 202 Accepted


def test_sync_returns_401_when_unauthenticated(client, db):
    resp = client.post('/api/v1/auth/sync')
    assert resp.status_code == 401


def test_internal_errors_do_not_leak_exception_text(app, client, db, auth_headers,
                                                    monkeypatch):
    """A 500 must not hand the client the exception string.

    finpal_core/CLAUDE.md: "never return str(e) to the client — log the
    exception, return a sanitized message". Exception text routinely carries
    table names, DSNs and internal hostnames.
    """
    user = UserFactory()

    def boom(*args, **kwargs):
        raise RuntimeError(
            'psycopg2.errors.UndefinedTable: relation "users_v2" does not exist'
            ' (host=10.0.0.5 port=5432 user=finpal_admin)'
        )

    # get_jwt_identity is imported into the handler module's namespace, so
    # patching it there makes the /me handler raise inside its own try block.
    #
    # The module moved: the auth routes were `src.services.auth.api_routes` until
    # they were ported onto flask-restx. A monkeypatch target is a *string*, so
    # nothing failed at import — this test errored with ModuleNotFoundError the
    # moment the port landed, which is the good outcome. It is resolved through
    # the routing table rather than hardcoded again, so the next move of these
    # handlers keeps this test pointed at whatever actually serves /auth/me.
    import importlib
    endpoint, _ = app.url_map.bind('localhost').match(
        '/api/v1/auth/me', method='GET')
    handler_module = app.view_functions[endpoint].__module__
    importlib.import_module(handler_module)
    monkeypatch.setattr(f'{handler_module}.get_jwt_identity', boom)

    resp = client.get('/api/v1/auth/me', headers=auth_headers(user))

    assert resp.status_code == 500
    body = resp.get_data(as_text=True)
    for leak in ('users_v2', '10.0.0.5', '5432', 'finpal_admin', 'psycopg2', 'UndefinedTable'):
        assert leak not in body, f'response leaked {leak!r}: {body}'
