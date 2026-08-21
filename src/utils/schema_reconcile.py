"""Bring a live database's columns up to what the models declare. ADDITIVE ONLY.

Why this exists
---------------
finPal's schema comes from `db.create_all()` at boot, not from Alembic — a deployed
instance has no `alembic_version` row at all, which is measurable rather than assumed.
`create_all()` creates tables that are MISSING and **never adds a column to a table that
already exists**.

The consequence is worse than a missing field, and this is the part that was understated
for a long time: SQLAlchemy SELECTs every column the model DECLARES, so a declared column
with no database column makes the *query* raise. `users` is read on essentially every
authenticated request, so one missing column there is not a degraded page — it is
`POST /auth/login` answering 500 and an instance nobody can get into. That is
palStack-io/finpal-core#122 (`expenses.notes` breaking the dashboard and the transactions
list at once) and #124, whose reporter had to type the `ALTER`s by hand.

What this does, and what it deliberately does NOT
-------------------------------------------------
Owner decision, 2026-08-21: reconcile at boot rather than refuse to boot.

  * ADDS a declared column the table does not have — only when it is nullable or carries a
    default. A NOT NULL column with no default cannot be added to a table that already has
    rows, so that case is REPORTED and left alone rather than attempted and failed.
  * WIDENS a column the database has narrower than the model declares. `expenses.paid_by`
    was VARCHAR(50) against a model wanting 120, found on both production stacks.
  * Never drops, never renames, never narrows, never changes a type. There is no
    destructive statement in this module, which is the property that makes it safe to run
    unattended against somebody else's data.

`flask db upgrade` is NOT the answer and should not be reached for: against a database
whose tables `create_all()` built, it replays from zero and fails on "table already
exists". `flask db stamp head` is worse, because it looks like it worked — it marks
migrations as applied when they never ran, so the column never appears and Alembic then
reports the database as healthy.
"""
import os

from sqlalchemy import inspect, text


def _is_truthy(value, default=True):
    if value is None:
        return default
    return str(value).strip().lower() not in ('0', 'false', 'no', 'off')


def auto_reconcile_enabled(app=None):
    """Whether to apply changes at boot. On by default; opt OUT, not in.

    Default-on because the failure it prevents is a total outage, and an operator who
    wants control can set `SCHEMA_AUTO_RECONCILE=false` and run
    `python scripts/schema_drift.py` themselves.
    """
    raw = os.getenv('SCHEMA_AUTO_RECONCILE')
    if raw is None and app is not None:
        raw = app.config.get('SCHEMA_AUTO_RECONCILE')
    return _is_truthy(raw, default=True)


def detect_drift(engine, metadata):
    """What the models declare and the database does not have. Reads only.

    Shared with `scripts/schema_drift.py` so the detector has ONE definition — a
    read-only reporter and an applier that disagreed about what drift is would be worse
    than either alone.

    Returns (missing_tables, addable_columns, unaddable_columns, narrow_columns).
    """
    inspector = inspect(engine)
    live_tables = set(inspector.get_table_names())

    missing_tables = []
    addable_columns = []
    unaddable_columns = []
    narrow_columns = []

    for name, table in sorted(metadata.tables.items()):
        if name not in live_tables:
            # create_all() handles these, so they are not this module's business.
            missing_tables.append(name)
            continue

        live = {c['name']: c for c in inspector.get_columns(name)}
        for column in table.columns:
            if column.name not in live:
                safe = (
                    column.nullable
                    or column.default is not None
                    or column.server_default is not None
                )
                (addable_columns if safe else unaddable_columns).append((name, column))
                continue

            want = getattr(column.type, 'length', None)
            have = getattr(live[column.name]['type'], 'length', None)
            if want and have and have < want:
                narrow_columns.append((name, column, have, want))

    return missing_tables, addable_columns, unaddable_columns, narrow_columns


def statements_for(engine, addable_columns, narrow_columns):
    """The exact SQL, so it can be logged, printed, or run by hand identically."""
    dialect = engine.dialect
    out = []
    for table, column in addable_columns:
        ddl = column.type.compile(dialect=dialect)
        out.append(f'ALTER TABLE {table} ADD COLUMN {column.name} {ddl}')
    for table, column, _have, want in narrow_columns:
        ddl = column.type.compile(dialect=dialect)
        if dialect.name == 'postgresql':
            out.append(f'ALTER TABLE {table} ALTER COLUMN {column.name} TYPE {ddl}')
        else:
            # SQLite does not enforce VARCHAR lengths, so there is nothing to widen and
            # no statement that would do it. Saying so beats emitting SQL that fails.
            continue
    return out


def reconcile_schema(app, db):
    """Apply the additive changes. Returns the statements executed.

    Never raises. A schema problem must not stop the container starting, because a
    container that will not start cannot serve the log that explains why. On failure the
    exact SQL is logged at ERROR so an operator can run it by hand — which is precisely
    what #124's reporter did successfully.
    """
    log = app.logger

    if not auto_reconcile_enabled(app):
        _, addable, unaddable, narrow = detect_drift(db.engine, db.metadata)
        pending = statements_for(db.engine, addable, narrow)
        if pending or unaddable:
            log.warning(
                'SCHEMA_AUTO_RECONCILE is off and this database is behind the models. '
                'Run `python scripts/schema_drift.py` and apply what it prints, or the '
                'app will fail on any query touching these columns:\n  %s',
                '\n  '.join(pending) or '(see the script)')
        return []

    try:
        _, addable, unaddable, narrow = detect_drift(db.engine, db.metadata)
    except Exception:
        log.exception('Could not inspect the schema; skipping reconcile')
        return []

    if unaddable:
        # Reported, never attempted: adding NOT NULL with no default to a populated table
        # fails, and a failed boot-time statement is worse than a named warning.
        for table, column in unaddable:
            log.error(
                'Column %s.%s is NOT NULL with no default and cannot be added '
                'automatically to a table that already has rows. It needs a manual '
                'migration with a backfill.', table, column.name)

    statements = statements_for(db.engine, addable, narrow)
    if not statements:
        return []

    log.warning('Schema is behind the models; applying %d additive change(s). '
                'This is expected on an upgrade — see D-121.', len(statements))

    applied = []
    for statement in statements:
        try:
            with db.engine.begin() as connection:
                connection.execute(text(statement))
            applied.append(statement)
            log.warning('  applied: %s', statement)
        except Exception:
            # Logged with the statement, so the operator can run exactly this by hand.
            log.exception('  FAILED, run this yourself: %s', statement)

    return applied
