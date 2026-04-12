"""Add profile_emoji column to users table

Revision ID: 7a1b2c3d4e5f
Revises: 0abe58d0fc8d
Create Date: 2026-02-07

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '7a1b2c3d4e5f'
down_revision = '0abe58d0fc8d'
branch_labels = None
depends_on = None


def upgrade():
    conn = op.get_bind()
    result = conn.execute(sa.text(
        "SELECT column_name FROM information_schema.columns "
        "WHERE table_name='users' AND column_name='profile_emoji'"
    ))
    if not result.fetchone():
        op.add_column('users', sa.Column('profile_emoji', sa.String(length=10), nullable=True))


def downgrade():
    conn = op.get_bind()
    result = conn.execute(sa.text(
        "SELECT column_name FROM information_schema.columns "
        "WHERE table_name='users' AND column_name='profile_emoji'"
    ))
    if result.fetchone():
        op.drop_column('users', 'profile_emoji')
