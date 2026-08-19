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

    app = create_app()
    with app.app_context():
        inspector = inspect(db.engine)
        live_tables = set(inspector.get_table_names())

        missing_tables = []
        missing_columns = []
        narrow_columns = []

        for name, table in sorted(db.metadata.tables.items()):
            if name not in live_tables:
                missing_tables.append(name)
                continue

            live = {c['name']: c for c in inspector.get_columns(name)}
            for column in table.columns:
                if column.name not in live:
                    nullable = column.nullable or column.default is not None
                    missing_columns.append((name, column.name, column.type, nullable))
                    continue

                # A width that shrank in the database relative to the model: the model
                # widened and create_all() could not follow. `paid_by` did this.
                want = getattr(column.type, 'length', None)
                have = getattr(live[column.name]['type'], 'length', None)
                if want and have and have < want:
                    narrow_columns.append((name, column.name, have, want))

        if not (missing_tables or missing_columns or narrow_columns):
            print('No drift: every model table and column is present, and no column '
                  'is narrower than its model.')
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
            print(f'{len(missing_columns)} column(s) missing. create_all() will NEVER '
                  'add these.')
            print('  Back up first, then apply:')
            for table, col, type_, nullable in missing_columns:
                null = '' if nullable else ' /* model says NOT NULL - needs a default */'
                print(f'    ALTER TABLE {table} ADD COLUMN {col} '
                      f'{type_.compile(db.engine.dialect)};{null}')
            print()

        if narrow_columns:
            print(f'{len(narrow_columns)} column(s) narrower than the model expects.')
            for table, col, have, want in narrow_columns:
                print(f'    {table}.{col}: database {have}, model {want}')
            print()

        return 1


if __name__ == '__main__':
    sys.exit(main())
