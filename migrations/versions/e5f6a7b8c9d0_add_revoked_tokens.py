"""add revoked_tokens table for JWT blocklist

Revision ID: e5f6a7b8c9d0
Revises: d4e5f6a7b8c9
Create Date: 2026-03-05 00:00:00.000000
"""
from alembic import op
import sqlalchemy as sa

revision = 'e5f6a7b8c9d0'
down_revision = 'd4e5f6a7b8c9'
branch_labels = None
depends_on = None


def _table_exists(conn, name):
    r = conn.execute(sa.text(
        "SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename=:t"
    ), {"t": name})
    return r.fetchone() is not None


def _index_exists(conn, name):
    r = conn.execute(sa.text(
        "SELECT indexname FROM pg_indexes WHERE schemaname='public' AND indexname=:i"
    ), {"i": name})
    return r.fetchone() is not None


def upgrade():
    conn = op.get_bind()
    if not _table_exists(conn, 'revoked_tokens'):
        op.create_table(
            'revoked_tokens',
            sa.Column('id', sa.Integer(), primary_key=True),
            sa.Column('jti', sa.String(36), nullable=False, unique=True),
            sa.Column('revoked_at', sa.DateTime(), nullable=False, server_default=sa.func.now()),
        )
    if not _index_exists(conn, 'ix_revoked_tokens_jti'):
        op.create_index('ix_revoked_tokens_jti', 'revoked_tokens', ['jti'], unique=True)


def downgrade():
    conn = op.get_bind()
    if _index_exists(conn, 'ix_revoked_tokens_jti'):
        op.drop_index('ix_revoked_tokens_jti', table_name='revoked_tokens')
    if _table_exists(conn, 'revoked_tokens'):
        op.drop_table('revoked_tokens')
