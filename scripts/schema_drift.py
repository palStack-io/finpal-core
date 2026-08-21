"""Report where the live database disagrees with the models. READ-ONLY.

Why this exists
---------------
finPal's schema comes from `db.create_all()` at boot, not from Alembic (a deployed
instance has no `alembic_version` row at all). `create_all()` creates tables that are
MISSING; it never adds a column to a table that already exists, and never widens one.

So an instance that has been upgraded ends up in a state no test models: every table
added since it was installed is present, and every column added to a pre-existing
table is absent. That is palStack-io/finpal-core#122 — `column expenses.notes does
not exist` breaking the dashboard and the transactions list at once.

Running migrations is not a complete answer either, and that is worth knowing before
reaching for `flask db upgrade`: several model columns have no migration that
mentions them, so `alembic upgrade head` would not create them.

This script only READS. It prints what it finds and changes nothing, so it is safe to
run against a production database. It exits 1 when it finds drift, so it can be used
as a check.

    docker exec finpal-backend python scripts/schema_drift.py

*** SINCE 2026-08-21 THE APP ALSO REPAIRS THIS ITSELF AT BOOT (D-121). *** See
`src/utils/schema_reconcile.py`: an additive reconcile runs after `create_all()` and adds
missing nullable columns and widens narrowed ones. So on a normal upgrade there is nothing
left for this script to report. It remains useful for three things: checking a database
WITHOUT changing it, seeing what an instance running `SCHEMA_AUTO_RECONCILE=false` still
needs, and printing the statements for a NOT NULL column, which the reconcile deliberately
refuses to add unattended because it cannot invent a backfill.

The detection below is IMPORTED from that module rather than reimplemented. A read-only
reporter and an applier that disagreed about what counts as drift would be worse than
either alone.
"""
import os
import sys

# Runnable as `python scripts/schema_drift.py` from the repo root as well as from inside
# the container, where /app is already on the path.
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


def main():
    from sqlalchemy import inspect

    from src import create_app
    from src.extensions import db
    import src.models  # noqa: F401  -- registers every model on db.metadata

    # *** THIS SCRIPT MUST NOT CHANGE ANYTHING, AND `create_app()` NOW WOULD. ***
    # Since D-121 the app reconciles the schema at boot, so simply constructing it here
    # would repair the very drift this script exists to REPORT — and a tool documented as
    # "safe to run against a production database" would quietly be applying DDL. Caught by
    # `test_schema_drift_detector.py`, which asserts exit 1 on drift and got 0.
    #
    # The instance's real setting is captured first, because the messages below describe
    # what WILL happen on the next boot, not what this process was forced to do.
    configured_auto = os.getenv('SCHEMA_AUTO_RECONCILE')
    os.environ['SCHEMA_AUTO_RECONCILE'] = 'false'
    try:
        app = create_app()
    finally:
        if configured_auto is None:
            os.environ.pop('SCHEMA_AUTO_RECONCILE', None)
        else:
            os.environ['SCHEMA_AUTO_RECONCILE'] = configured_auto

    with app.app_context():
        from src.utils.schema_reconcile import (
            auto_reconcile_enabled, detect_drift, statements_for,
        )

        missing_tables, addable, unaddable, narrow = detect_drift(
            db.engine, db.metadata)
        # Reported together, since to an operator "missing" is one question; they differ
        # only in whether the reconcile will handle it unattended.
        missing_columns = [(t, c, True) for t, c in addable] + \
                          [(t, c, False) for t, c in unaddable]
        narrow_columns = [(t, c.name, have, want) for t, c, have, want in narrow]

        if not (missing_tables or missing_columns or narrow_columns):
            print('No drift: every model table and column is present, and no column '
                  'is narrower than its model.')
            if not auto_reconcile_enabled():
                print('NOTE: SCHEMA_AUTO_RECONCILE is off on this instance, so nothing '
                      'will be repaired automatically on the next boot.')
            return 0

        print('SCHEMA DRIFT FOUND. Nothing has been changed.\n')

        if missing_tables:
            print(f'{len(missing_tables)} table(s) the models declare and the database '
                  'does not have.')
            print('  These WILL be created the next time the app boots, because '
                  'create_all() creates missing tables:')
            for name in missing_tables:
                print(f'    {name}')
            print('  If they are pointsPal tables, set POINTSPAL_ENABLED=true and '
                  'restart — with the\n  variable unset the models were not imported, '
                  'which is #122.\n')

        if missing_columns:
            auto = auto_reconcile_enabled()
            print(f'{len(missing_columns)} column(s) missing. create_all() will NEVER '
                  'add these.')
            if auto:
                print('  The boot-time reconcile WILL add the nullable ones by itself; '
                      'this is what it would run:')
            else:
                print('  SCHEMA_AUTO_RECONCILE is off, so nothing will do this for you. '
                      'Back up first, then apply:')
            for statement in statements_for(db.engine, addable, narrow):
                print(f'    {statement};')
            for table, column, safe in missing_columns:
                if safe:
                    continue
                print(f'    /* {table}.{column.name} is NOT NULL with no default. The '
                      'reconcile will NOT attempt this: it needs a migration with a '
                      'backfill. */')
            print()

        if narrow_columns:
            print(f'{len(narrow_columns)} column(s) narrower than the model expects.')
            for table, col, have, want in narrow_columns:
                print(f'    {table}.{col}: database {have}, model {want}')
            print()

        return 1


if __name__ == '__main__':
    sys.exit(main())
