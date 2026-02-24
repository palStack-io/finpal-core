"""add_advanced_matching_to_transaction_rules

Revision ID: 6987639505a7
Revises: 3fd04a714f6a
Create Date: 2025-12-28 15:48:48.757257

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '6987639505a7'
down_revision = '3fd04a714f6a'
branch_labels = None
depends_on = None


def upgrade():
    # Add new columns for advanced matching
    op.add_column('transaction_rules', sa.Column('amount_min', sa.Float(), nullable=True))
    op.add_column('transaction_rules', sa.Column('amount_max', sa.Float(), nullable=True))
    op.add_column('transaction_rules', sa.Column('transaction_type_filter', sa.String(length=20), nullable=True))


def downgrade():
    # Remove advanced matching columns
    op.drop_column('transaction_rules', 'transaction_type_filter')
    op.drop_column('transaction_rules', 'amount_max')
    op.drop_column('transaction_rules', 'amount_min')
