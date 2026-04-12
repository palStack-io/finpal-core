"""add user_module_access table

Revision ID: a1b2c3d4e5f6
Revises: f6a7b8c9d0e1
Create Date: 2026-03-10

"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = 'a1b2c3d4e5f6'
down_revision = 'f6a7b8c9d0e1'
branch_labels = None
depends_on = None


def _table_exists(conn, name):
    r = conn.execute(sa.text(
        "SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = :t)"
    ), {'t': name})
    return r.scalar()


def upgrade():
    conn = op.get_bind()
    if _table_exists(conn, 'user_module_access'):
        return
    op.create_table(
        'user_module_access',
        sa.Column('user_id', sa.String(120), sa.ForeignKey('users.id'), primary_key=True, nullable=False),
        sa.Column('module_name', sa.String(100), primary_key=True, nullable=False),
        sa.Column('enabled', sa.Boolean(), nullable=False, server_default='false'),
        sa.Column('granted_by', sa.String(50), nullable=True),
        sa.Column('granted_at', sa.DateTime(), nullable=True),
    )


def downgrade():
    op.drop_table('user_module_access')
