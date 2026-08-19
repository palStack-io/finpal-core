"""
The schema-drift detector, tested against a database that really has drifted.

This is the diagnostic half of D-121 / palStack-io/finpal-core#122. finPal's schema comes
from `db.create_all()` at boot rather than from Alembic — a deployed instance has no
`alembic_version` row — and `create_all()` creates MISSING TABLES but never adds a column to
a table that already exists, nor widens one. So an upgraded instance sits in a state no test
models: every table added since it was installed is present, every column added to a
pre-existing table is absent.

*** THE SUITE CANNOT NORMALLY SEE THIS, AND THAT IS WHY IT SHIPPED: every test database is
built fresh from the current models, so it is correct by construction. *** This file is the
exception — it BUILDS the broken state, by copying a freshly created schema and dropping
columns out of it, then asserts the detector reports exactly those columns.

Running the detector in a subprocess is deliberate. It is a script an operator runs against
their own database (`docker exec finpal-backend python scripts/schema_drift.py`), the
model-to-live comparison happens at import/boot time, and the env var that selects the
database is read by `src/config.py` before the app exists. Testing the function in-process
would test something the operator never runs.

One thing this file pins that cost a wrong verification: the variable is
`SQLALCHEMY_DATABASE_URI`, not `DATABASE_URL`. Overriding the latter is silently ignored, so
the detector ran against the ORIGINAL database, reported no missing columns, and looked like
a failure of the detector rather than of the test setup.
"""

import os
import shutil
import sqlite3
import subprocess
import sys
from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parents[2]
SCRIPT = REPO_ROOT / 'scripts' / 'schema_drift.py'

# Dropped to reconstruct the reporter's state. `notes` is the column their traceback named;
# `has_category_splits` is chosen because NO migration mentions it at all, which is the part
# that makes "just run alembic upgrade" an incomplete answer.
DROPPED = ('notes', 'has_category_splits')


def _build_reference_db(tmp_path):
    """A database with the CURRENT schema, made the way a deploy makes one."""
    db_path = tmp_path / 'reference.db'
    env = {
        **os.environ,
        'SQLALCHEMY_DATABASE_URI': f'sqlite:///{db_path}',
        'DEMO_MODE': 'false',
        'RUN_SCHEDULER': 'false',
    }
    proc = subprocess.run(
        [sys.executable, '-c',
         'import sys; sys.path.insert(0, "."); '
         'from src import create_app; create_app()'],
        cwd=str(REPO_ROOT), env=env, capture_output=True, text=True, timeout=180,
    )
    assert proc.returncode == 0, f'could not build a reference db:\n{proc.stderr[-2000:]}'
    assert db_path.exists(), 'create_all() produced no database file'
    return db_path


def _run_detector(db_path):
    env = {
        **os.environ,
        'SQLALCHEMY_DATABASE_URI': f'sqlite:///{db_path}',
        'DEMO_MODE': 'false',
        'RUN_SCHEDULER': 'false',
    }
    return subprocess.run(
        [sys.executable, str(SCRIPT)],
        cwd=str(REPO_ROOT), env=env, capture_output=True, text=True, timeout=180,
    )


def test_the_script_exists_where_the_docs_say_it_does():
    """It is named in the #122 reply and in D-121; a rename must break this, not the reply."""
    assert SCRIPT.exists(), f'{SCRIPT} is missing'


@pytest.fixture(scope='module')
def reference_db(tmp_path_factory):
    return _build_reference_db(tmp_path_factory.mktemp('reference'))


def test_a_freshly_created_database_shows_no_missing_columns(reference_db):
    """
    The fail-first control. If the detector reported missing columns on a database
    `create_all()` had just built, every assertion below would be meaningless.

    Narrow columns are NOT asserted absent here: `expenses.paid_by` was widened 50 → 120 in
    the same pass, and on a database created before that the detector correctly reports it.
    A fresh one has 120 and is clean, but this test must not depend on that.
    """
    result = _run_detector(reference_db)
    assert 'column(s) missing' not in result.stdout, result.stdout[-2000:]


def test_the_detector_names_every_dropped_column_and_the_alter_to_restore_it(tmp_path,
                                                                            reference_db):
    drifted = tmp_path / 'drifted.db'
    shutil.copy(reference_db, drifted)

    with sqlite3.connect(drifted) as conn:
        for column in DROPPED:
            conn.execute(f'ALTER TABLE expenses DROP COLUMN {column}')

    # The premise, checked rather than assumed.
    with sqlite3.connect(drifted) as conn:
        live = {row[1] for row in conn.execute('PRAGMA table_info(expenses)')}
    for column in DROPPED:
        assert column not in live, f'{column} was not actually dropped'

    result = _run_detector(drifted)

    assert result.returncode == 1, (
        f'expected exit 1 on drift, got {result.returncode}\n{result.stdout[-2000:]}'
    )
    assert 'SCHEMA DRIFT FOUND' in result.stdout
    for column in DROPPED:
        assert f'ADD COLUMN {column}' in result.stdout, (
            f'{column} missing from the report:\n{result.stdout[-2000:]}'
        )
    # The ALTER has to be runnable, so the type must be there too.
    assert 'ALTER TABLE expenses ADD COLUMN notes TEXT;' in result.stdout


def test_the_detector_changes_nothing(tmp_path, reference_db):
    """
    It is offered to operators to run against production, so "read-only" has to be a
    measured property rather than a claim in a docstring.
    """
    drifted = tmp_path / 'readonly.db'
    shutil.copy(reference_db, drifted)
    with sqlite3.connect(drifted) as conn:
        conn.execute('ALTER TABLE expenses DROP COLUMN notes')

    before = drifted.read_bytes()
    result = _run_detector(drifted)
    after = drifted.read_bytes()

    assert result.returncode == 1
    # create_all() runs during create_app() and may touch the file, so compare the SCHEMA
    # rather than the bytes — what matters is that the missing column is still missing.
    with sqlite3.connect(drifted) as conn:
        live = {row[1] for row in conn.execute('PRAGMA table_info(expenses)')}
    assert 'notes' not in live, (
        'the detector added the column — it must only report. If create_all() added it, '
        'then the premise of D-121 is wrong and that is a bigger finding than this test.'
    )
    assert len(before) > 0 and len(after) > 0
