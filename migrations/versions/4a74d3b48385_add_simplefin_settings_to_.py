"""Add SimpleFin settings to UserApiSettings

Revision ID: 4a74d3b48385
Revises: 0abe58d0fc8d
Create Date: 2025-12-28 02:10:36.256539

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '4a74d3b48385'
down_revision = '0abe58d0fc8d'
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
    # Drop legacy investment columns if they exist
    if _col_exists(conn, 'investments', 'data_source'):
        op.drop_column('investments', 'data_source')
    if _col_exists(conn, 'investments', 'exchange'):
        op.drop_column('investments', 'exchange')
    # Add SimpleFin columns if not yet present
    if not _col_exists(conn, 'user_api_settings', 'simplefin_enabled'):
        op.add_column('user_api_settings', sa.Column('simplefin_enabled', sa.Boolean(), nullable=True))
    if not _col_exists(conn, 'user_api_settings', 'simplefin_access_url'):
        op.add_column('user_api_settings', sa.Column('simplefin_access_url', sa.Text(), nullable=True))
    # Drop legacy column if it exists
    if _col_exists(conn, 'user_api_settings', 'preferred_data_source'):
        op.drop_column('user_api_settings', 'preferred_data_source')


def downgrade():
    conn = op.get_bind()
    if not _col_exists(conn, 'user_api_settings', 'preferred_data_source'):
        op.add_column('user_api_settings', sa.Column('preferred_data_source', sa.VARCHAR(length=20), autoincrement=False, nullable=True))
    if _col_exists(conn, 'user_api_settings', 'simplefin_access_url'):
        op.drop_column('user_api_settings', 'simplefin_access_url')
    if _col_exists(conn, 'user_api_settings', 'simplefin_enabled'):
        op.drop_column('user_api_settings', 'simplefin_enabled')
    if not _col_exists(conn, 'investments', 'exchange'):
        op.add_column('investments', sa.Column('exchange', sa.VARCHAR(length=10), autoincrement=False, nullable=True))
    if not _col_exists(conn, 'investments', 'data_source'):
        op.add_column('investments', sa.Column('data_source', sa.VARCHAR(length=20), autoincrement=False, nullable=True))
