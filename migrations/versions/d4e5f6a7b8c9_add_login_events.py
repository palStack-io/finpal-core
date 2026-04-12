"""add login_events table

Revision ID: d4e5f6a7b8c9
Revises: c3d4e5f6a7b8
Create Date: 2026-03-05

"""
from alembic import op
import sqlalchemy as sa

revision = 'd4e5f6a7b8c9'
down_revision = 'c3d4e5f6a7b8'
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
    if not _table_exists(conn, 'login_events'):
        op.create_table(
            'login_events',
            sa.Column('id', sa.Integer(), nullable=False),
            sa.Column('user_id', sa.String(length=120), nullable=False),
            sa.Column('timestamp', sa.DateTime(), nullable=False, server_default=sa.func.now()),
            sa.Column('ip_address', sa.String(length=45), nullable=True),
            sa.Column('user_agent', sa.String(length=500), nullable=True),
            sa.Column('success', sa.Boolean(), nullable=False, server_default='true'),
            sa.ForeignKeyConstraint(['user_id'], ['users.id'], name='fk_login_events_user', ondelete='CASCADE'),
            sa.PrimaryKeyConstraint('id'),
        )
    if not _index_exists(conn, 'ix_login_events_user_id'):
        op.create_index('ix_login_events_user_id', 'login_events', ['user_id'])
    if not _index_exists(conn, 'ix_login_events_timestamp'):
        op.create_index('ix_login_events_timestamp', 'login_events', ['timestamp'])


def downgrade():
    conn = op.get_bind()
    if _index_exists(conn, 'ix_login_events_timestamp'):
        op.drop_index('ix_login_events_timestamp', table_name='login_events')
    if _index_exists(conn, 'ix_login_events_user_id'):
        op.drop_index('ix_login_events_user_id', table_name='login_events')
    if _table_exists(conn, 'login_events'):
        op.drop_table('login_events')
