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

# *** learnPal IS `default_enabled = False`, AND ITS MODELS ARE IMPORTED
# CONDITIONALLY, SO WITHOUT THIS ITS TWO TABLES DO NOT EXIST IN THE SUITE AT
# ALL. *** `src/models/__init__.py` imports them only when `is_enabled()`, and
# `create_all()` can only build a table whose model has been imported — so the
# default would leave every learnPal test erroring on a missing table rather
# than failing on behaviour.
#
# Assigned, not `setdefault`-ed, for the same reason as the URI above: a stray
# value in .env must not be able to decide what the suite covers.
#
# The DISABLED path is therefore not exercised by these fixtures, which is
# exactly the hole pointsPal fell into. It is covered instead by
# `test_learnpal_in_core.py`, which drives `is_enabled()` directly with
# monkeypatched environments and pins the manifest and the model-import guard
# to one source of truth.
os.environ['LEARNPAL_ENABLED'] = 'true'

# Off for the same reason — it is read at create_app() time. Leaving it to .env
# meant every run seeded four demo users, 147 categories and 52 rules apiece
# before the first test.
os.environ['DEMO_MODE'] = 'False'

# *** THE SUITE MUST NOT RUN A LIVE SCHEDULER. THIS IS THE SAME BUG AS THE URI
# *** ABOVE, ONE EXTENSION OVER — AUDIT D-61.
#
# `scheduler_enabled()` reads the RUN_SCHEDULER **env var** and defaults to
# 'true', and `init_extensions` calls `scheduler.start()` on that. The `app`
# fixture below used to set SCHEDULER_API_ENABLED and APSCHEDULER_DAEMON in
# `app.config` after create_app(), which gates *nothing* — it only read as
# though it did. Measured under the suite's own configuration:
#
#     scheduler.running -> True, 7 jobs, csv_folder_scan next run in 299.99s
#
# So every run started a background thread and, five minutes in, executed
# `csv_folder_scan` for real. That is not merely wasteful: the engine is
# `sqlite:///:memory:`, which Flask-SQLAlchemy gives a **StaticPool** and
# `check_same_thread=False` so the in-memory database can be shared — meaning
# the scheduler thread issues statements on the **same DBAPI connection** as the
# request under test, with the guard that would have complained switched off.
#
# The damage is silent. Reproduced by rescheduling the real job to 0.05s and
# running 400 create/delete round trips: 13 requests answered
# `400 Internal server error`, and one DELETE **answered 200 while its row
# survived** — a committed-empty transaction. That last shape is what turned
# main red once on the Flask 3 merge (#88), as a 0.07 discrepancy in
# test_a_hundred_round_trips_do_not_drift, which reads as money drifting and is
# not. With RUN_SCHEDULER=false the same 400 round trips are 400/400 clean.
#
# Assigned rather than `setdefault`-ed, for the same reason as the URI: a stray
# RUN_SCHEDULER in the environment or a .env file must not be able to start a
# background thread inside a test run.
os.environ['RUN_SCHEDULER'] = 'false'
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
        # NOT the scheduler either. SCHEDULER_API_ENABLED and APSCHEDULER_DAEMON
        # used to be set here as "disable background tasks during tests"; they
        # gated nothing at all — `scheduler.start()` is gated on the
        # RUN_SCHEDULER env var, set at the top of this file. They are deleted
        # rather than left in place because two inert keys named after the thing
        # you want off are worse than no keys: they are why a live scheduler went
        # unnoticed for as long as it did. See D-61.
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
    """Create all tables before each test, drop all after. Function-scoped for isolation.

    *** THE CURRENCIES ARE SEEDED HERE, AND WITHOUT THAT LINE EVERY CURRENCY
    CONVERSION IN THE SUITE WAS THE IDENTITY FUNCTION. D-166. ***

    `create_default_currencies()` runs once at app boot (`src/__init__.py:408`), and
    the `app` fixture is session-scoped — so the FIRST test to take this fixture saw
    22 currency rows and every test after it saw **zero**, because `drop_all()` had
    taken them. `convert_currency` and `RateTable` both return their input unchanged
    when no base currency exists, by design: a missing rate must not turn a real
    figure into zero in the middle of a cron run. That safety valve is what made the
    hole invisible. Nothing raised, nothing was skipped, and any test that asserted a
    converted figure was asserting the unconverted one.

    Measured, not inferred: the D-156 test failed when run alone and passed when run
    in its file, because the file's first test had consumed the only seeded copy. It
    is also why `calculate_asset_debt_trends` — which HAS converted account balances
    for as long as it has existed — has never had that behaviour exercised here.

    Seeded per test rather than once, because `drop_all()` is what removes them; the
    insert is ~22 rows into SQLite and does not show up against the suite's runtime.
    """
    from src.cli import create_default_currencies
    with app.app_context():
        _db.create_all()
        create_default_currencies()
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
