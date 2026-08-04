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
os.environ.setdefault('POINTSPAL_ENABLED', 'true')
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
        'SQLALCHEMY_DATABASE_URI': 'sqlite:///:memory:',
        'SQLALCHEMY_TRACK_MODIFICATIONS': False,
        'JWT_SECRET_KEY': 'test-secret-key',
        'SECRET_KEY': 'test-secret-key',
        'POINTSPAL_ENABLED': 'true',
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
    """Flask test client. Depends on db so tables exist."""
    with app.test_client() as c:
        with app.app_context():
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
