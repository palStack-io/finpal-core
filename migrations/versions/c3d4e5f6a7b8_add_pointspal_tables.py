"""Add pointsPal tables

Revision ID: c3d4e5f6a7b8
Revises: 6987639505a7, 8b2c3d4e5f6a
Create Date: 2026-03-05

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'c3d4e5f6a7b8'
down_revision = ('6987639505a7', '8b2c3d4e5f6a')
branch_labels = None
depends_on = None


def _table_exists(conn, name):
    r = conn.execute(sa.text(
        "SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename=:t"
    ), {"t": name})
    return r.fetchone() is not None


def _index_exists(conn, name):
    r = conn.execute(sa.text(
        "SELECT indexname FROM pg_indexes WHERE schemaname='public' AND indexname=:i"
    ), {"i": name})
    return r.fetchone() is not None


def upgrade():
    conn = op.get_bind()

    if not _table_exists(conn, 'points_programs'):
        op.create_table(
            'points_programs',
            sa.Column('id', sa.Integer(), nullable=False),
            sa.Column('program_id', sa.String(length=100), nullable=False),
            sa.Column('program_name', sa.String(length=200), nullable=False),
            sa.Column('issuer', sa.String(length=100), nullable=False),
            sa.Column('network', sa.String(length=50), nullable=True),
            sa.Column('currency_name', sa.String(length=100), nullable=True),
            sa.Column('annual_fee', sa.Float(), nullable=True),
            sa.Column('effective_annual_fee', sa.String(length=50), nullable=True),
            sa.Column('base_cpp', sa.Float(), nullable=True),
            sa.Column('tpg_cpp', sa.Float(), nullable=True),
            sa.Column('has_transfer_fee', sa.Boolean(), nullable=True),
            sa.Column('expiry_policy', sa.String(length=100), nullable=True),
            sa.Column('data_as_of', sa.String(length=20), nullable=True),
            sa.Column('issuer_effective_date', sa.String(length=20), nullable=True),
            sa.Column('known_change_event', sa.Text(), nullable=True),
            sa.Column('review_frequency_months', sa.Integer(), nullable=True),
            sa.Column('notes', sa.Text(), nullable=True),
            sa.Column('source_url', sa.Text(), nullable=True),
            sa.Column('contributor', sa.String(length=100), nullable=True),
            sa.Column('welcome_bonus', sa.Text(), nullable=True),
            sa.Column('foreign_transaction_fee_pct', sa.Float(), nullable=True),
            sa.Column('category_exceptions', sa.Text(), nullable=True),
            sa.Column('is_stale', sa.Boolean(), nullable=True, server_default='false'),
            sa.Column('created_at', sa.DateTime(), nullable=True),
            sa.Column('updated_at', sa.DateTime(), nullable=True),
            sa.PrimaryKeyConstraint('id'),
            sa.UniqueConstraint('program_id', name='uq_points_programs_program_id'),
        )

    if not _table_exists(conn, 'points_earn_categories'):
        op.create_table(
            'points_earn_categories',
            sa.Column('id', sa.Integer(), nullable=False),
            sa.Column('program_id', sa.String(length=100), nullable=False),
            sa.Column('category', sa.String(length=100), nullable=False),
            sa.Column('multiplier', sa.Float(), nullable=False),
            sa.Column('cap_amount', sa.Float(), nullable=True),
            sa.Column('cap_period', sa.String(length=20), nullable=True),
            sa.Column('multiplier_fallback', sa.Float(), nullable=True),
            sa.Column('card_variant', sa.String(length=100), nullable=True),
            sa.Column('notes', sa.Text(), nullable=True),
            sa.ForeignKeyConstraint(
                ['program_id'], ['points_programs.program_id'],
                name='fk_pec_program'
            ),
            sa.PrimaryKeyConstraint('id'),
        )
    if not _index_exists(conn, 'ix_pec_program_category'):
        op.create_index(
            'ix_pec_program_category',
            'points_earn_categories',
            ['program_id', 'category']
        )

    if not _table_exists(conn, 'points_transfer_partners'):
        op.create_table(
            'points_transfer_partners',
            sa.Column('id', sa.Integer(), nullable=False),
            sa.Column('program_id', sa.String(length=100), nullable=False),
            sa.Column('partner_name', sa.String(length=200), nullable=False),
            sa.Column('ratio', sa.String(length=20), nullable=True),
            sa.Column('type', sa.String(length=50), nullable=True),
            sa.Column('est_cpp', sa.Float(), nullable=True),
            sa.Column('notes', sa.Text(), nullable=True),
            sa.ForeignKeyConstraint(
                ['program_id'], ['points_programs.program_id'],
                name='fk_ptp_program'
            ),
            sa.PrimaryKeyConstraint('id'),
        )

    if not _table_exists(conn, 'pointspal_sync_log'):
        op.create_table(
            'pointspal_sync_log',
            sa.Column('id', sa.Integer(), nullable=False),
            sa.Column('synced_at', sa.DateTime(), nullable=False),
            sa.Column('status', sa.String(length=20), nullable=False),
            sa.Column('programs_upserted', sa.Integer(), nullable=True),
            sa.Column('schema_version', sa.String(length=20), nullable=True),
            sa.Column('error_message', sa.Text(), nullable=True),
            sa.PrimaryKeyConstraint('id'),
        )

    if not _table_exists(conn, 'user_cards'):
        op.create_table(
            'user_cards',
            sa.Column('id', sa.Integer(), nullable=False),
            sa.Column('user_id', sa.String(length=120), nullable=False),
            sa.Column('program_id', sa.String(length=100), nullable=True),
            sa.Column('card_nickname', sa.String(length=200), nullable=True),
            sa.Column('last_four', sa.String(length=4), nullable=True),
            sa.Column('association_source', sa.String(length=30), nullable=False,
                      server_default='user_manual'),
            sa.Column('earn_override', sa.Text(), nullable=True),
            sa.Column('confidence_level', sa.String(length=10), nullable=False,
                      server_default='medium'),
            sa.Column('user_last_verified_at', sa.DateTime(), nullable=True),
            sa.Column('user_stale_flag', sa.Boolean(), nullable=True, server_default='false'),
            sa.Column('submitted_to_community', sa.Boolean(), nullable=True, server_default='false'),
            sa.Column('community_pr_url', sa.Text(), nullable=True),
            sa.Column('created_at', sa.DateTime(), nullable=True),
            sa.Column('updated_at', sa.DateTime(), nullable=True),
            sa.ForeignKeyConstraint(['user_id'], ['users.id'], name='fk_uc_user'),
            sa.ForeignKeyConstraint(
                ['program_id'], ['points_programs.program_id'],
                name='fk_uc_program'
            ),
            sa.PrimaryKeyConstraint('id'),
        )
    if not _index_exists(conn, 'ix_user_cards_user_id'):
        op.create_index('ix_user_cards_user_id', 'user_cards', ['user_id'])

    if not _table_exists(conn, 'simplefin_card_links'):
        op.create_table(
            'simplefin_card_links',
            sa.Column('id', sa.Integer(), nullable=False),
            sa.Column('user_id', sa.String(length=120), nullable=False),
            sa.Column('user_card_id', sa.Integer(), nullable=True),
            sa.Column('simplefin_account_id', sa.String(length=200), nullable=False),
            sa.Column('simplefin_account_name', sa.String(length=200), nullable=True),
            sa.Column('simplefin_last_four', sa.String(length=4), nullable=True),
            sa.Column('match_source', sa.String(length=50), nullable=True),
            sa.Column('match_confidence', sa.Float(), nullable=True),
            sa.Column('is_credit_card', sa.Boolean(), nullable=True, server_default='false'),
            sa.Column('created_at', sa.DateTime(), nullable=True),
            sa.ForeignKeyConstraint(['user_id'], ['users.id'], name='fk_scl_user'),
            sa.ForeignKeyConstraint(['user_card_id'], ['user_cards.id'], name='fk_scl_card'),
            sa.PrimaryKeyConstraint('id'),
        )
    if not _index_exists(conn, 'ix_scl_simplefin_account'):
        op.create_index(
            'ix_scl_simplefin_account',
            'simplefin_card_links',
            ['simplefin_account_id']
        )
    if not _index_exists(conn, 'ix_scl_user_account'):
        op.create_index(
            'ix_scl_user_account',
            'simplefin_card_links',
            ['user_id', 'simplefin_account_id'],
            unique=True
        )

    if not _table_exists(conn, 'spend_period_totals'):
        op.create_table(
            'spend_period_totals',
            sa.Column('id', sa.Integer(), nullable=False),
            sa.Column('user_card_id', sa.Integer(), nullable=False),
            sa.Column('category', sa.String(length=100), nullable=False),
            sa.Column('period_type', sa.String(length=20), nullable=False),
            sa.Column('period_key', sa.String(length=10), nullable=False),
            sa.Column('total_spent', sa.Float(), nullable=True, server_default='0'),
            sa.Column('total_pts_earned', sa.Float(), nullable=True, server_default='0'),
            sa.Column('total_pts_missed', sa.Float(), nullable=True, server_default='0'),
            sa.Column('updated_at', sa.DateTime(), nullable=True),
            sa.ForeignKeyConstraint(['user_card_id'], ['user_cards.id'], name='fk_spt_card'),
            sa.PrimaryKeyConstraint('id'),
            sa.UniqueConstraint(
                'user_card_id', 'category', 'period_type', 'period_key',
                name='uq_spt_card_cat_period'
            ),
        )

    if not _table_exists(conn, 'optimizer_alerts'):
        op.create_table(
            'optimizer_alerts',
            sa.Column('id', sa.Integer(), nullable=False),
            sa.Column('user_id', sa.String(length=120), nullable=False),
            sa.Column('user_card_id', sa.Integer(), nullable=False),
            sa.Column('category', sa.String(length=100), nullable=False),
            sa.Column('period_type', sa.String(length=20), nullable=False),
            sa.Column('period_key', sa.String(length=10), nullable=False),
            sa.Column('alert_type', sa.String(length=20), nullable=False),
            sa.Column('pct_used', sa.Float(), nullable=True),
            sa.Column('dismissed', sa.Boolean(), nullable=True, server_default='false'),
            sa.Column('created_at', sa.DateTime(), nullable=True),
            sa.ForeignKeyConstraint(['user_id'], ['users.id'], name='fk_oa_user'),
            sa.ForeignKeyConstraint(['user_card_id'], ['user_cards.id'], name='fk_oa_card'),
            sa.PrimaryKeyConstraint('id'),
            sa.UniqueConstraint(
                'user_card_id', 'category', 'period_type', 'period_key', 'alert_type',
                name='uq_oa_alert_unique'
            ),
        )


def downgrade():
    conn = op.get_bind()
    if _table_exists(conn, 'optimizer_alerts'):
        op.drop_table('optimizer_alerts')
    if _table_exists(conn, 'spend_period_totals'):
        op.drop_table('spend_period_totals')
    if _table_exists(conn, 'simplefin_card_links'):
        if _index_exists(conn, 'ix_scl_user_account'):
            op.drop_index('ix_scl_user_account', table_name='simplefin_card_links')
        if _index_exists(conn, 'ix_scl_simplefin_account'):
            op.drop_index('ix_scl_simplefin_account', table_name='simplefin_card_links')
        op.drop_table('simplefin_card_links')
    if _table_exists(conn, 'user_cards'):
        if _index_exists(conn, 'ix_user_cards_user_id'):
            op.drop_index('ix_user_cards_user_id', table_name='user_cards')
        op.drop_table('user_cards')
    if _table_exists(conn, 'pointspal_sync_log'):
        op.drop_table('pointspal_sync_log')
    if _table_exists(conn, 'points_transfer_partners'):
        op.drop_table('points_transfer_partners')
    if _table_exists(conn, 'points_earn_categories'):
        if _index_exists(conn, 'ix_pec_program_category'):
            op.drop_index('ix_pec_program_category', table_name='points_earn_categories')
        op.drop_table('points_earn_categories')
    if _table_exists(conn, 'points_programs'):
        op.drop_table('points_programs')
