"""Add investment tracking to UserApiSettings

Revision ID: 3fd04a714f6a
Revises: 4a74d3b48385
Create Date: 2025-12-28 02:24:13.537889

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '3fd04a714f6a'
down_revision = '4a74d3b48385'
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
    if not _col_exists(conn, 'user_api_settings', 'investment_tracking_enabled'):
        op.add_column('user_api_settings', sa.Column('investment_tracking_enabled', sa.Boolean(), nullable=True))


def downgrade():
    conn = op.get_bind()
    if _col_exists(conn, 'user_api_settings', 'investment_tracking_enabled'):
        op.drop_column('user_api_settings', 'investment_tracking_enabled')
