"""add agent actions

Revision ID: f5fc4f9672a2
Revises: 16f9694227d8
Create Date: 2026-08-03 22:13:49.018330

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'f5fc4f9672a2'
down_revision = '16f9694227d8'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'agent_actions',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.String(length=120), nullable=False),
        sa.Column('token_id', sa.Integer(), nullable=True),
        sa.Column('action', sa.String(length=40), nullable=False),
        sa.Column('payload', sa.JSON(), nullable=False),
        sa.Column('undo_state', sa.JSON(), nullable=True),
        sa.Column('status', sa.String(length=20), nullable=False),
        sa.Column('target_ref', sa.String(length=80), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('decided_at', sa.DateTime(), nullable=True),
        sa.Column('reverted_at', sa.DateTime(), nullable=True),
        sa.Column('expires_at', sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(['user_id'], ['users.id']),
        sa.ForeignKeyConstraint(['token_id'], ['personal_access_tokens.id']),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_agent_actions_user_id', 'agent_actions', ['user_id'])
    op.create_index('ix_agent_actions_status', 'agent_actions', ['status'])


def downgrade():
    op.drop_index('ix_agent_actions_status', table_name='agent_actions')
    op.drop_index('ix_agent_actions_user_id', table_name='agent_actions')
    op.drop_table('agent_actions')
