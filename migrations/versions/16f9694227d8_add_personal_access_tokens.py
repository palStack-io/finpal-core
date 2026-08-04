"""add personal access tokens

Revision ID: 16f9694227d8
Revises: 679da3d5b2cc
Create Date: 2026-08-03 21:55:11.767329

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '16f9694227d8'
down_revision = '679da3d5b2cc'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'personal_access_tokens',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.String(length=120), nullable=False),
        sa.Column('name', sa.String(length=120), nullable=False),
        sa.Column('token_prefix', sa.String(length=20), nullable=False),
        sa.Column('token_hash', sa.String(length=64), nullable=False),
        sa.Column('scopes', sa.String(length=40), nullable=False),
        sa.Column('expires_at', sa.DateTime(), nullable=False),
        sa.Column('last_used_at', sa.DateTime(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('revoked_at', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['user_id'], ['users.id']),
        sa.PrimaryKeyConstraint('id'),
    )
    # The model expresses uniqueness as `unique=True, index=True` on the column,
    # which SQLAlchemy renders as a single UNIQUE index — not a plain index plus
    # a separate UNIQUE constraint. Emitting the latter makes alembic's
    # compare_metadata report a permanent diff against the model.
    op.create_index('ix_personal_access_tokens_token_hash',
                    'personal_access_tokens', ['token_hash'], unique=True)
    op.create_index('ix_personal_access_tokens_user_id',
                    'personal_access_tokens', ['user_id'])


def downgrade():
    op.drop_index('ix_personal_access_tokens_user_id',
                  table_name='personal_access_tokens')
    op.drop_index('ix_personal_access_tokens_token_hash',
                  table_name='personal_access_tokens')
    op.drop_table('personal_access_tokens')
