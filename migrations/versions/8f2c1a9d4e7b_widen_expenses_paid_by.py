"""widen expenses.paid_by to hold a user id

`expenses.paid_by` holds a user id, and a finPal user id is an email address:
`users.id` is VARCHAR(120). The column was VARCHAR(50), so a user whose address
exceeded 50 characters could not be recorded as the payer of a transaction —
StringDataRightTruncation on Postgres, silently over-long on SQLite.

Found by tests/unit/test_validators_fit_their_columns.py while fixing #123, which is
the same defect class in the other direction (a validator looser than its column).

Widening is safe in both directions of use: every existing value already fits, and
nothing reads a fixed width. The downgrade truncates, so it is guarded — it refuses
rather than silently destroying an id that no longer fits.

Revision ID: 8f2c1a9d4e7b
Revises: b1c2d3e4f5a6
Create Date: 2026-08-19

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '8f2c1a9d4e7b'
down_revision = 'b1c2d3e4f5a6'
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table('expenses', schema=None) as batch_op:
        batch_op.alter_column(
            'paid_by',
            existing_type=sa.String(length=50),
            type_=sa.String(length=120),
            existing_nullable=False,
        )


def downgrade():
    conn = op.get_bind()
    too_long = conn.execute(
        sa.text('SELECT COUNT(*) FROM expenses WHERE LENGTH(paid_by) > 50')
    ).scalar()
    if too_long:
        raise RuntimeError(
            f'{too_long} expense row(s) have a paid_by longer than 50 characters; '
            'narrowing the column would destroy them. Reassign those payers first.'
        )

    with op.batch_alter_table('expenses', schema=None) as batch_op:
        batch_op.alter_column(
            'paid_by',
            existing_type=sa.String(length=120),
            type_=sa.String(length=50),
            existing_nullable=False,
        )
