"""Add color column to accounts table

Revision ID: 0abe58d0fc8d
Revises: 5c900eb00454
Create Date: 2025-12-27 05:00:29.999364

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '0abe58d0fc8d'
down_revision = '5c900eb00454'
branch_labels = None
depends_on = None


def upgrade():
    # Add color column to accounts table
    op.add_column('accounts', sa.Column('color', sa.String(length=7), nullable=True))


def downgrade():
    # Remove color column from accounts table
    op.drop_column('accounts', 'color')
