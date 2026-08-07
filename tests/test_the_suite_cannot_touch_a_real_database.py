"""The suite must run against an in-memory database, and prove it.

**This is here because the opposite was true and nothing said so.**

Flask-SQLAlchemy 2.5.1 built engines lazily, per app context, so the `app`
fixture could call `create_app()` and override `SQLALCHEMY_DATABASE_URI`
afterwards. 3.0 builds them eagerly in `init_app()` and caches them, so the late
override became a no-op that still *looked* right:

    app.config['SQLALCHEMY_DATABASE_URI']  ->  sqlite:///:memory:
    db.engine.url                          ->  sqlite:////.../instance/expenses.db

The `db` fixture calls `drop_all()` after every test. So the suite was set up to
drop every table in the real configured database, once per test, and report a
green run while doing it. Nothing in 900+ tests noticed, because every test
asserts on data it created itself and a freshly-dropped-and-recreated real
database behaves exactly like a fresh in-memory one — right up until the
database is one somebody cared about.

The lesson generalises past this upgrade: **`app.config` is a statement of
intent, and `db.engine` is what is actually happening.** Assert on the engine.
"""
import pytest
from sqlalchemy import inspect


def test_the_engine_is_in_memory_sqlite(app, db):
    """Assert on the ENGINE, never on app.config — config is what lied."""
    url = db.engine.url
    assert url.drivername.startswith('sqlite'), (
        f'the suite is pointed at a {url.drivername} database: {url}')
    assert url.database in (None, ':memory:'), (
        f'the suite is pointed at a database FILE, and the db fixture calls '
        f'drop_all() after every test: {url}')


def test_config_and_engine_agree(app, db):
    """The two disagreeing silently is the whole failure mode.

    If a future change reintroduces a late override, this fails even though the
    test above would still pass on the engine alone.
    """
    configured = app.config.get('SQLALCHEMY_DATABASE_URI')
    actual = str(db.engine.url)
    assert configured == actual, (
        f'app.config says {configured!r} but the engine is {actual!r}. '
        f'Flask-SQLAlchemy builds engines in init_app(), so a URI set after '
        f'create_app() is read by nothing.')


def test_no_real_data_is_visible(app, db):
    """A real database would arrive with rows in it; :memory: starts empty.

    Belt and braces, and it catches the case the URL check cannot: a sqlite file
    that happens to be named `:memory:`, or a future switch to a shared cache
    URI that is still a real, persistent database.
    """
    from src.models.user import User
    assert User.query.count() == 0, (
        'users already exist at the start of a test - this database is not '
        'freshly created, so it is not the in-memory one the suite assumes')


def test_the_tables_exist_so_the_check_above_means_something(app, db):
    """A pass on an EMPTY database with no schema would be vacuous.

    `test_no_real_data_is_visible` would also pass against a database where the
    query silently returned nothing. This pins that the schema really is there,
    which is what makes the zero-rows assertion evidence rather than an accident.
    """
    tables = set(inspect(db.engine).get_table_names())
    assert 'users' in tables, f'no users table; schema was never created: {sorted(tables)}'
    assert len(tables) > 10, f'suspiciously few tables: {sorted(tables)}'
