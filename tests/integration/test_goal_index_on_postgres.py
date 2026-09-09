"""The B5 index, executed against a real Postgres.

*** THIS FILE EXISTS BECAUSE THE SQLITE SUITE PASSED WITH DDL POSTGRES REFUSES. ***
The first version of `uq_goal_active_account_direction` indexed a bare
`CASE ... END`. SQLite created it and every double-counting test went green.
Postgres answers `syntax error at or near "CASE"` -- an expression in an index has
to be parenthesised -- so on the only database anyone can actually exploit, the
index would never have been created at all and the gaming vector would have been
wide open behind a green suite. D-123's shape: the two engines disagree, and the
one the tests run on is the permissive one.

Run by hand against Postgres 14 on 2026-09-09, with the parenthesised form: the
duplicate is refused, opposite directions coexist on one account, an archived goal
does not block a new one, and two manual goals do not collide.

Skipped unless `POSTGRES_TEST_URL` is set, because a Postgres is not a dependency
of this suite. Set it to run the check:

    POSTGRES_TEST_URL=postgresql://localhost/finpal_pg_check \
        ./venv/bin/python -m pytest tests/integration/test_goal_index_on_postgres.py -q
"""
import os

import pytest
from sqlalchemy import create_engine, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.schema import CreateIndex, CreateTable

PG_URL = os.environ.get('POSTGRES_TEST_URL')

pytestmark = pytest.mark.skipif(
    not PG_URL,
    reason='POSTGRES_TEST_URL not set; the B5 index was verified by hand against '
           'Postgres 14 on 2026-09-09 (see this module docstring) and is verified '
           'again on the deploy, inside the container.',
)


def test_the_index_is_accepted_and_enforced_by_postgres(app):
    """Creates the real table and index on Postgres and drives the four cases."""
    from src.models.goal import Goal

    engine = create_engine(PG_URL)
    index = next(i for i in Goal.__table__.indexes
                 if i.name == 'uq_goal_active_account_direction')

    with engine.begin() as conn:
        conn.execute(text('DROP TABLE IF EXISTS goals_pg_check'))
    # Rendered from the real model, under a scratch name, so this checks the DDL
    # the deploy will emit rather than a hand-copy of it that can drift.
    ddl_table = str(CreateTable(Goal.__table__).compile(engine)).replace(
        'CREATE TABLE goals', 'CREATE TABLE goals_pg_check', 1)
    # The foreign keys are dropped so the scratch table stands alone -- users,
    # accounts and currencies do not exist in this database, and none of them is
    # what is under test. Rebuilt line by line rather than by a string replace,
    # because dropping the last constraint leaves a dangling comma that Postgres
    # refuses with an error about the closing paren, not about the comma.
    lines = [line for line in ddl_table.splitlines()
             if 'FOREIGN KEY' not in line and 'CONSTRAINT fk_' not in line]
    for i in range(len(lines) - 1, -1, -1):
        if lines[i].strip() in ('', ')'):
            continue
        lines[i] = lines[i].rstrip().rstrip(',')
        break
    ddl_table = '\n'.join(lines)
    ddl_index = str(CreateIndex(index).compile(engine)).replace(
        ' ON goals ', ' ON goals_pg_check ', 1)

    with engine.begin() as conn:
        conn.execute(text(ddl_table))
        # The assertion is that this does not raise. A bare CASE raises here.
        conn.execute(text(ddl_index))

    def _insert(conn, account_id, start, target, status):
        conn.execute(text(
            'INSERT INTO goals_pg_check (user_id, name, kind, scope, account_id, '
            'start_amount, target_amount, status, start_date) VALUES '
            # start_date is NOT NULL with a PYTHON-side default, which raw SQL does
            # not apply -- the mirror image of the note that an ORM-built row cannot
            # produce the NULL production has (D-155).
            "(:u, 'g', 'savings', 'personal', :a, :s, :t, :st, DATE '2026-01-01')"),
            {'u': 'pg@test.com', 'a': account_id, 's': start, 't': target,
             'st': status})

    with engine.begin() as conn:
        _insert(conn, 1, 0, 5000, 'active')
        _insert(conn, 1, -800, 0, 'active')      # opposite direction: allowed
        _insert(conn, 2, 0, 100, 'archived')
        _insert(conn, 2, 0, 100, 'active')       # archived does not block
        _insert(conn, None, 0, 100, 'active')
        _insert(conn, None, 0, 100, 'active')    # manual goals do not collide

    with pytest.raises(IntegrityError):
        with engine.begin() as conn:
            _insert(conn, 1, 0, 5000, 'active')  # same account, same direction

    with engine.begin() as conn:
        count = conn.execute(text('SELECT count(*) FROM goals_pg_check')).scalar()
        conn.execute(text('DROP TABLE goals_pg_check'))
    assert count == 6
