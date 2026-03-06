"""add performance indexes on high-frequency query columns

Revision ID: f6a7b8c9d0e1
Revises: e5f6a7b8c9d0
Create Date: 2026-03-06 00:00:00.000000
"""
from alembic import op
import sqlalchemy as sa

revision = 'f6a7b8c9d0e1'
down_revision = 'e5f6a7b8c9d0'
branch_labels = None
depends_on = None

_INDEXES = [
    # (index_name, table, columns, unique)
    ('ix_expenses_user_id',        'expenses',  ['user_id'],       False),
    ('ix_expenses_date',           'expenses',  ['date'],          False),
    ('ix_expenses_category_id',    'expenses',  ['category_id'],   False),
    ('ix_expenses_account_id',     'expenses',  ['account_id'],    False),
    ('ix_expenses_external_id',    'expenses',  ['external_id'],   False),
    ('ix_expenses_import_source',  'expenses',  ['import_source'], False),
    ('ix_budgets_user_id',         'budgets',   ['user_id'],       False),
    ('ix_budgets_active',          'budgets',   ['active'],        False),
    ('ix_accounts_user_id',        'accounts',  ['user_id'],       False),
    ('ix_accounts_import_source',  'accounts',  ['import_source'], False),
]


def _index_exists(conn, name):
    r = conn.execute(sa.text(
        "SELECT indexname FROM pg_indexes WHERE schemaname='public' AND indexname=:i"
    ), {"i": name})
    return r.fetchone() is not None


def upgrade():
    conn = op.get_bind()
    for idx_name, table, cols, unique in _INDEXES:
        if not _index_exists(conn, idx_name):
            op.create_index(idx_name, table, cols, unique=unique)


def downgrade():
    conn = op.get_bind()
    for idx_name, table, _, _ in reversed(_INDEXES):
        if _index_exists(conn, idx_name):
            op.drop_index(idx_name, table_name=table)
