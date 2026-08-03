"""add csv import tables

Revision ID: 679da3d5b2cc
Revises: 200f76059b3b
Create Date: 2026-08-03 10:19:04.324048

Note on how this was produced: `flask db migrate` boots the app, and
create_app() calls db.create_all(), which creates missing *tables* (it never adds
missing columns). So by the time autogenerate compared metadata to the database,
import_sources / import_profiles / import_batches already existed and no
create_table was emitted — only the expenses column, index and FK were detected.
The three create_table blocks below were therefore written to mirror
src/models/import_source.py exactly, and verified by upgrading an empty database
with this migration and diffing the result against a db.create_all() schema:
identical tables, columns, nullability and unique indexes.
"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '679da3d5b2cc'
down_revision = '200f76059b3b'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'import_sources',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('kind', sa.String(length=30), nullable=False),
        sa.Column('config', sa.JSON(), nullable=False),
        sa.Column('enabled', sa.Boolean(), nullable=False),
        sa.Column('scan_interval_minutes', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.String(length=120), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('last_scanned_at', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ),
        sa.PrimaryKeyConstraint('id'),
    )

    op.create_table(
        'import_profiles',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('name', sa.String(length=120), nullable=False),
        sa.Column('header_fingerprint', sa.String(length=64), nullable=False),
        sa.Column('mapping', sa.JSON(), nullable=False),
        sa.Column('date_format', sa.String(length=40), nullable=False),
        sa.Column('sign_convention', sa.String(length=20), nullable=False),
        sa.Column('origin', sa.String(length=20), nullable=False),
        sa.Column('confidence', sa.Float(), nullable=True),
        sa.Column('times_used', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.String(length=120), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ),
        sa.PrimaryKeyConstraint('id'),
        # Per-user, not global: two users can bank with the same institution, so the
        # same header shape appears once per owner. A global unique on
        # header_fingerprint let one user's save overwrite another user's profile.
        sa.UniqueConstraint('user_id', 'header_fingerprint',
                            name='uq_import_profiles_user_fingerprint'),
    )
    with op.batch_alter_table('import_profiles', schema=None) as batch_op:
        batch_op.create_index(
            batch_op.f('ix_import_profiles_header_fingerprint'),
            ['header_fingerprint'], unique=False)

    op.create_table(
        'import_batches',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('source_id', sa.Integer(), nullable=True),
        sa.Column('profile_id', sa.Integer(), nullable=True),
        sa.Column('filename', sa.String(length=255), nullable=False),
        sa.Column('file_hash', sa.String(length=64), nullable=False),
        sa.Column('mapping_used', sa.JSON(), nullable=True),
        sa.Column('confidence', sa.Float(), nullable=True),
        sa.Column('row_count', sa.Integer(), nullable=False),
        sa.Column('imported_count', sa.Integer(), nullable=False),
        sa.Column('skipped_count', sa.Integer(), nullable=False),
        sa.Column('error_count', sa.Integer(), nullable=False),
        sa.Column('errors', sa.JSON(), nullable=True),
        sa.Column('status', sa.String(length=20), nullable=False),
        sa.Column('user_id', sa.String(length=120), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('reverted_at', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['profile_id'], ['import_profiles.id'], ),
        sa.ForeignKeyConstraint(['source_id'], ['import_sources.id'], ),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ),
        sa.PrimaryKeyConstraint('id'),
    )
    # UNIQUE on file_hash is the concurrency arbiter for scans — two scanners that
    # pick up the same file race here and the database decides, rather than the
    # application trying to reason about it.
    with op.batch_alter_table('import_batches', schema=None) as batch_op:
        batch_op.create_index(
            batch_op.f('ix_import_batches_file_hash'), ['file_hash'], unique=True)

    with op.batch_alter_table('expenses', schema=None) as batch_op:
        batch_op.add_column(sa.Column('import_batch_id', sa.Integer(), nullable=True))
        batch_op.create_index(
            batch_op.f('ix_expenses_import_batch_id'), ['import_batch_id'], unique=False)
        batch_op.create_foreign_key(
            'fk_expense_import_batch', 'import_batches', ['import_batch_id'], ['id'])


def downgrade():
    with op.batch_alter_table('expenses', schema=None) as batch_op:
        batch_op.drop_constraint('fk_expense_import_batch', type_='foreignkey')
        batch_op.drop_index(batch_op.f('ix_expenses_import_batch_id'))
        batch_op.drop_column('import_batch_id')

    with op.batch_alter_table('import_batches', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_import_batches_file_hash'))
    op.drop_table('import_batches')

    with op.batch_alter_table('import_profiles', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_import_profiles_header_fingerprint'))
    op.drop_table('import_profiles')

    op.drop_table('import_sources')
