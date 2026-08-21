"""D-121 — an upgraded instance could not log in, and now it repairs itself at boot.

finPal's schema comes from `db.create_all()`, not Alembic: production has no
`alembic_version` table at all, which is measured rather than assumed. `create_all()`
creates MISSING TABLES and never adds a column to a table that already exists.

*** THE CONSEQUENCE IS NOT A MISSING FIELD, IT IS A 500. *** SQLAlchemy SELECTs every
column the model DECLARES, so a declared column with no database column makes the query
raise. `users` is read on essentially every authenticated request, so one missing column
there means `POST /auth/login` answers 500 and nobody can get in. That is #122
(`expenses.notes` breaking the dashboard and the transactions list at once) and #124,
whose reporter applied the `ALTER`s by hand.

Owner decision, 2026-08-21: reconcile at boot. The alternative on the table was refusing
to boot with a named recovery command, which was rejected because a container that will
not start cannot serve the log explaining why.

Proven end to end before these tests were written, against a copy of a real 2026-08-10
database missing both of this release's new columns: boot applied exactly two `ALTER`s and
`POST /auth/login` went from **500 to 200**, with `/auth/me`, `/accounts/`,
`/transactions/` and `/recurring/` all 200.

What is asserted here is the SAFETY of it as much as the effect, because this runs
unattended against other people's data: additive only, nothing destructive, NOT NULL
columns reported rather than attempted, and idempotent.
"""
import os

import pytest
from sqlalchemy import inspect, text

from src.extensions import db
from src.utils.schema_reconcile import (
    auto_reconcile_enabled,
    detect_drift,
    reconcile_schema,
    statements_for,
)


def _columns(table):
    return {c['name'] for c in inspect(db.engine).get_columns(table)}


def _drop_column(table, column):
    """Manufacture the drift a self-hoster arrives with."""
    with db.engine.begin() as connection:
        connection.execute(text(f'ALTER TABLE {table} DROP COLUMN {column}'))


def test_a_dropped_nullable_column_is_restored(app, db):
    """The reported shape: a column the models declare and the database lacks."""
    assert 'description' in _columns('accounts')
    _drop_column('accounts', 'description')
    assert 'description' not in _columns('accounts'), 'the fixture did not create drift'

    applied = reconcile_schema(app, db)

    assert 'description' in _columns('accounts'), f'not restored; applied={applied}'
    assert any('accounts' in s and 'description' in s for s in applied), applied


def test_the_query_that_used_to_raise_now_works(app, db, client, auth_headers):
    """Assert on BEHAVIOUR, not on the column list.

    A column can exist and the app still be broken; the point of the whole row is that
    the request stops failing. `users` is the dangerous one — it is read on essentially
    every authenticated request.
    """
    from tests.factories import UserFactory
    user = UserFactory()
    headers = auth_headers(user)
    assert client.get('/api/v1/accounts/', headers=headers).status_code == 200

    _drop_column('users', 'number_locale')
    db.session.remove()

    reconcile_schema(app, db)
    db.session.remove()

    assert client.get('/api/v1/accounts/', headers=headers).status_code == 200
    assert 'number_locale' in _columns('users')


def test_it_is_idempotent(app, db):
    """A healthy database must be left completely alone.

    This runs on every boot, so "does nothing when there is nothing to do" is a
    correctness requirement, not a nicety.
    """
    assert reconcile_schema(app, db) == []
    assert reconcile_schema(app, db) == []


def test_it_never_emits_a_destructive_statement(app, db):
    """The property that makes this safe to run unattended against someone's data.

    Asserted against the generated SQL for EVERY table in the metadata, not a sample, and
    on the statement text rather than on intent — a future change that adds a DROP would
    fail here even if its author believed it was safe.
    """
    _, addable, _unaddable, narrow = detect_drift(db.engine, db.metadata)
    # Force a non-empty statement list so this cannot pass by having nothing to check.
    _drop_column('accounts', 'description')
    _, addable, _unaddable, narrow = detect_drift(db.engine, db.metadata)
    statements = statements_for(db.engine, addable, narrow)
    assert statements, 'no statements generated — the test proves nothing'

    for statement in statements:
        upper = statement.upper()
        for forbidden in ('DROP ', 'DELETE ', 'TRUNCATE', 'RENAME', 'SET NOT NULL'):
            assert forbidden not in upper, f'destructive statement generated: {statement}'
        assert upper.startswith('ALTER TABLE'), statement

    reconcile_schema(app, db)  # leave the database as we found it


def test_a_not_null_column_without_a_default_is_reported_not_attempted(app, db):
    """Adding NOT NULL with no default to a populated table FAILS, so it must not be tried.

    *** THIS TEST WAS WRITTEN WRONG FIRST AND A SABOTAGE CAUGHT IT. *** The original only
    dropped a NULLABLE column and then asserted that everything in `addable` was safe —
    which is trivially true when no NOT NULL column is missing in the first place. Forcing
    `safe = True` in `detect_drift` left all 16 tests GREEN. A sabotage that passes is a
    hole in the test, not a harmless change, so the fixture now actually removes a NOT NULL
    column and asserts which bucket it lands in.
    """
    name_column = db.metadata.tables['accounts'].columns['name']
    assert not name_column.nullable and name_column.default is None \
        and name_column.server_default is None, (
        'the fixture assumption changed; pick another NOT NULL column'
    )

    _drop_column('accounts', 'name')
    _, addable, unaddable, _narrow = detect_drift(db.engine, db.metadata)

    addable_names = {(t, c.name) for t, c in addable}
    unaddable_names = {(t, c.name) for t, c in unaddable}
    assert ('accounts', 'name') in unaddable_names, (
        'a NOT NULL column with no default was classed as safe to add automatically'
    )
    assert ('accounts', 'name') not in addable_names

    # And the applier must not emit a statement for it, even though it is missing.
    statements = statements_for(db.engine, addable, _narrow)
    assert not any('name' in s and 'accounts' in s for s in statements), statements


def test_it_can_be_turned_off(app, db, monkeypatch):
    """`SCHEMA_AUTO_RECONCILE=false` for an operator who wants to apply changes by hand.

    Opt-OUT rather than opt-in, because the default has to be the one that prevents an
    outage — but a self-hoster who wants control must be able to take it.
    """
    monkeypatch.setenv('SCHEMA_AUTO_RECONCILE', 'false')
    assert auto_reconcile_enabled(app) is False

    _drop_column('accounts', 'description')
    applied = reconcile_schema(app, db)

    assert applied == [], 'it changed the schema with auto-reconcile disabled'
    assert 'description' not in _columns('accounts')

    monkeypatch.delenv('SCHEMA_AUTO_RECONCILE')
    reconcile_schema(app, db)  # restore
    assert 'description' in _columns('accounts')


@pytest.mark.parametrize('value,expected', [
    (None, True), ('true', True), ('1', True), ('yes', True),
    ('false', False), ('0', False), ('no', False), ('off', False), ('FALSE', False),
])
def test_the_flag_parses_the_spellings_people_actually_write(app, monkeypatch, value,
                                                            expected):
    """A flag read as a bare string is how `POINTSPAL_ENABLED` became D-120.

    That defect was one variable with opposite defaults in three readers. Pinning the
    spellings here means a future second reader has something to disagree with loudly.
    """
    if value is None:
        monkeypatch.delenv('SCHEMA_AUTO_RECONCILE', raising=False)
    else:
        monkeypatch.setenv('SCHEMA_AUTO_RECONCILE', value)
    assert auto_reconcile_enabled(app) is expected


def test_boot_actually_calls_it(app):
    """*** ADOPTION, NOT BEHAVIOUR. ***

    A helper whose own tests pass while nothing calls it is D-106, and I shipped exactly
    that shape earlier in this same body of work (`parseMoneyInput`, 13 green tests, zero
    call sites). So this asserts the wiring: `create_app` must call the reconcile, and it
    must do so BEFORE the seeders, which query `users` and `accounts` themselves and are
    therefore the first things to trip over the gap.
    """
    source = open(os.path.join(os.path.dirname(os.path.dirname(
        os.path.dirname(os.path.abspath(__file__)))), 'src', '__init__.py')).read()
    assert 'reconcile_schema' in source, 'create_app does not call the reconcile at all'

    reconcile_at = source.index('reconcile_schema(app, db)')
    create_all_at = source.index('db.create_all()')
    assert create_all_at < reconcile_at, 'reconcile must run after create_all()'

    # `_seed_reference_data` is the first boot step that queries a table.
    seed_at = source.index('_seed_reference_data(app)')
    assert reconcile_at < seed_at, (
        'reconcile runs AFTER the seeders, so the code that trips over a missing column '
        'runs first — which is the whole failure being fixed'
    )
