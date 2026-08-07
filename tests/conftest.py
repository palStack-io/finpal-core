"""
Shared pytest fixtures for finPal test suite.

Key fixtures:
  app         — Flask app configured for testing (SQLite in-memory)
  db          — creates all tables before each test, drops after
  client      — Flask test client
  auth_headers — factory: returns Bearer token headers for a user
"""

import os
import pytest

os.environ.setdefault('TESTING', 'true')

# *** THE DATABASE URI MUST BE SET BEFORE create_app(), NOT AFTER. ***
#
# Flask-SQLAlchemy 2.5.1 built engines LAZILY, per app context, from whatever
# `SQLALCHEMY_DATABASE_URI` said at the time — so the `app` fixture could call
# create_app() and override the URI afterwards and it worked.
#
# 3.0 creates engines EAGERLY in `init_app()` and caches them on the app. The
# late override is then read by nothing: `app.config` says `sqlite:///:memory:`
# while `db.engine.url` is still the real configured database. Verified, because
# it is silent and nothing in the suite would have said so:
#
#     config URI after override : sqlite:///:memory:
#     ENGINE ACTUALLY IN USE    : sqlite:////.../instance/expenses.db
#
# The `db` fixture calls `drop_all()` after every test, so the suite would have
# been dropping every table in the developer's real database, once per test,
# while reporting passes. Assigned rather than `setdefault`-ed: a stray
# SQLALCHEMY_DATABASE_URI in the environment or a .env file must not be able to
# point the suite at a real database. `test_the_suite_cannot_touch_a_real_database`
# asserts this held.
os.environ['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///:memory:'

# Off for the same reason — it is read at create_app() time. Leaving it to .env
# meant every run seeded four demo users, 147 categories and 52 rules apiece
# before the first test.
os.environ['DEMO_MODE'] = 'False'
# POINTSPAL_ENABLED is deliberately NOT set here. pointsPal is part of core and
# enables itself; forcing it on would mean the suite never exercised that default,
# and the deployed instance served none of pointsPal while these tests were green.
os.environ.setdefault('SECRET_KEY', 'test-secret-key')
os.environ.setdefault('ENCRYPTION_KEY', '')

from src import create_app
from src.extensions import db as _db


@pytest.fixture(scope='session')
def app():
    """Create Flask app with test config. Session-scoped — one app per run."""
    application = create_app()
    application.config.update({
        'TESTING': True,
        # NOT the database URI — that is set as an env var at the top of this
        # file, before create_app(), because Flask-SQLAlchemy 3 builds the engine
        # eagerly and would ignore it here. Setting it again at this point would
        # be worse than useless: it would make app.config agree with what the
        # suite intends while the engine quietly pointed somewhere else, which is
        # exactly the state that hid this for the whole upgrade.
        'SQLALCHEMY_TRACK_MODIFICATIONS': False,
        'JWT_SECRET_KEY': 'test-secret-key',
        'SECRET_KEY': 'test-secret-key',
        'WTF_CSRF_ENABLED': False,
        # Disable background tasks during tests
        'SCHEDULER_API_ENABLED': False,
        'APSCHEDULER_DAEMON': False,
        # Login is rate limited to 10/min in production. The app fixture is
        # session-scoped and the limiter stores counters in memory, so leaving it
        # on would make the 11th test that calls auth_headers() fail with 429 —
        # the limit is real, the shared fixture is the problem. Tests that assert
        # on rate limiting turn it back on explicitly; see
        # tests/integration/test_live_auth_hardening.py.
        'RATELIMIT_ENABLED': False,
    })
    from src.extensions import limiter
    limiter.enabled = False
    return application


@pytest.fixture(scope='function')
def db(app):
    """Create all tables before each test, drop all after. Function-scoped for isolation."""
    with app.app_context():
        _db.create_all()
        yield _db
        _db.session.remove()
        _db.drop_all()


@pytest.fixture(scope='function')
def client(app, db):
    """Flask test client. Depends on db so tables exist.

    **No second `app.app_context()` here, and that is load-bearing under
    Flask-SQLAlchemy 3.**

    2.5.1 scoped the session to the *thread*, so the `db` fixture's context and a
    nested one here shared a single session and nobody noticed the nesting. 3.0
    scopes the session to the **app context** — so pushing a second context gave
    the fixtures one session and the test body another. Rows committed by a
    factory were invisible to the request, and relationship targets came back as
    `None`, surfacing as `FlushError: Can't flush None value found in collection
    Group.members` rather than as anything that named the real cause.

    `db` already yields from inside `with app.app_context()`, so a context is
    active for the whole test. This fixture just uses it.
    """
    with app.test_client() as c:
        yield c


@pytest.fixture
def auth_headers(client):
    """
    Factory fixture: call auth_headers(user) to get Bearer token headers.

    Usage:
        def test_something(client, auth_headers, db):
            user = UserFactory(password_plain='secret')
            headers = auth_headers(user, password='secret')
            resp = client.get('/api/v1/...', headers=headers)
    """
    def _make(user, password='testpassword'):
        resp = client.post('/api/v1/auth/login', json={
            'email': user.id,
            'password': password,
        })
        assert resp.status_code == 200, f"Login failed: {resp.get_json()}"
        token = resp.get_json()['access_token']
        return {'Authorization': f'Bearer {token}'}
    return _make
