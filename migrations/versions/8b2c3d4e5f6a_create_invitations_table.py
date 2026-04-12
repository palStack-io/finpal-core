"""create invitations table

Revision ID: 8b2c3d4e5f6a
Revises: 7a1b2c3d4e5f
Create Date: 2026-02-07

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '8b2c3d4e5f6a'
down_revision = '7a1b2c3d4e5f'
branch_labels = None
depends_on = None


def _table_exists(conn, name):
    r = conn.execute(sa.text(
        "SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename=:t"
    ), {"t": name})
    return r.fetchone() is not None


def upgrade():
    conn = op.get_bind()
    if not _table_exists(conn, 'invitations'):
        op.create_table('invitations',
            sa.Column('id', sa.Integer(), nullable=False),
            sa.Column('email', sa.String(length=120), nullable=False),
            sa.Column('role', sa.String(length=20), nullable=True),
            sa.Column('invited_by', sa.String(length=120), nullable=False),
            sa.Column('token', sa.String(length=100), nullable=False),
            sa.Column('status', sa.String(length=20), nullable=True),
            sa.Column('created_at', sa.DateTime(), nullable=True),
            sa.ForeignKeyConstraint(['invited_by'], ['users.id'], ),
            sa.PrimaryKeyConstraint('id'),
            sa.UniqueConstraint('token')
        )


def downgrade():
    conn = op.get_bind()
    if _table_exists(conn, 'invitations'):
        op.drop_table('invitations')
