"""Add preferred_data_source to UserApiSettings model

Revision ID: 5c900eb00454
Revises: 
Create Date: 2025-05-01 16:30:50.740718

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '5c900eb00454'
down_revision = None
branch_labels = None
depends_on = None


def _col_exists(conn, table, column):
    r = conn.execute(sa.text(
        "SELECT column_name FROM information_schema.columns "
        "WHERE table_name=:t AND column_name=:c"
    ), {"t": table, "c": column})
    return r.fetchone() is not None


def upgrade():
    conn = op.get_bind()
    if not _col_exists(conn, 'investments', 'exchange'):
        op.add_column('investments', sa.Column('exchange', sa.String(length=10), nullable=True))
    if not _col_exists(conn, 'investments', 'data_source'):
        op.add_column('investments', sa.Column('data_source', sa.String(length=20), nullable=True))
    if not _col_exists(conn, 'user_api_settings', 'preferred_data_source'):
        op.add_column('user_api_settings', sa.Column('preferred_data_source', sa.String(length=20), nullable=True))


def downgrade():
    conn = op.get_bind()
    if _col_exists(conn, 'user_api_settings', 'preferred_data_source'):
        op.drop_column('user_api_settings', 'preferred_data_source')
    if _col_exists(conn, 'investments', 'data_source'):
        op.drop_column('investments', 'data_source')
    if _col_exists(conn, 'investments', 'exchange'):
        op.drop_column('investments', 'exchange')
