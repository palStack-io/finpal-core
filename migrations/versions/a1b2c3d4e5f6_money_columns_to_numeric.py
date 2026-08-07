"""Money columns become NUMERIC — AUDIT D-58.

`Account.balance` is a stored column mutated **in place**: every write applies a
delta and nothing ever re-derives it from the transactions that produced it. As a
binary float that means the error accumulates and never self-corrects. Observed on
a real instance: a balance of 1104.55 became **1104.5500000000002** after a single
add-and-delete of one transaction.

Three scales, chosen per cluster rather than uniformly:

* ``NUMERIC(18, 2)`` — currency amounts. Two places is what money has.
* ``NUMERIC(20, 8)`` — share counts, which are legitimately fractional well past
  two places and are multiplied by a price to produce money.
* ``NUMERIC(20, 10)`` — exchange rates, for the same reason one step further out.

``import_sources.confidence`` and ``import_batches.confidence`` are deliberately
**not** converted: they are 0..1 heuristic scores that never touch money.

**This migration is a merge point.** The revision tree had three heads before it
(``6987639505a7``, ``8b2c3d4e5f6a``, ``f5fc4f9672a2``), so ``alembic upgrade head``
could not run at all without naming one. Depending on all three fixes that as a
side effect rather than adding a fourth.

**Note for anyone deploying this without Alembic.** ``db.create_all()`` creates
missing *tables* and does **not** alter existing *columns*, so on an instance
whose schema came from ``create_all`` the model change alone is a silent no-op —
the code will hand Postgres a Decimal and Postgres will keep storing a double.
Run this migration, or run the equivalent ``ALTER TABLE ... TYPE NUMERIC`` by
hand, and verify with ``\\d+ accounts`` that the column type actually moved.
"""
from alembic import op
import sqlalchemy as sa

revision = 'a1b2c3d4e5f6'
down_revision = ('6987639505a7', '8b2c3d4e5f6a', 'f5fc4f9672a2')
branch_labels = None
depends_on = None

MONEY = sa.Numeric(18, 2)
QUANTITY = sa.Numeric(20, 8)
RATE = sa.Numeric(20, 10)

#: (table, column, new type). Every one of these was read in the model files
#: before being listed; the set is pinned by `test_money_is_exact.py`.
COLUMNS = [
    ('accounts', 'balance', MONEY),
    ('expenses', 'amount', MONEY),
    ('expenses', 'original_amount', MONEY),
    ('expenses', 'split_value', MONEY),
    ('category_splits', 'amount', MONEY),
    ('budgets', 'amount', MONEY),
    ('budgets', 'rollover_amount', MONEY),
    ('settlements', 'amount', MONEY),
    ('recurring_expenses', 'amount', MONEY),
    ('recurring_expenses', 'original_amount', MONEY),
    ('recurring_expenses', 'split_value', MONEY),
    ('ignored_recurring_patterns', 'amount', MONEY),
    ('transaction_rules', 'amount_min', MONEY),
    ('transaction_rules', 'amount_max', MONEY),
    ('investments', 'shares', QUANTITY),
    ('investments', 'purchase_price', MONEY),
    ('investments', 'current_price', MONEY),
    ('investment_transactions', 'shares', QUANTITY),
    ('investment_transactions', 'price', MONEY),
    ('investment_transactions', 'fees', MONEY),
    ('currencies', 'rate_to_base', RATE),
]


def _alter(to_type, from_type):
    bind = op.get_bind()
    # SQLite cannot ALTER a column type in place; batch mode rebuilds the table.
    # Postgres needs the USING clause, which alembic emits from postgresql_using.
    sqlite = bind.dialect.name == 'sqlite'
    for table, column, money_type in COLUMNS:
        target = money_type if to_type == 'numeric' else sa.Float()
        existing = sa.Float() if to_type == 'numeric' else money_type
        kwargs = dict(existing_type=existing, type_=target, existing_nullable=True)
        if not sqlite:
            kwargs['postgresql_using'] = '%s::%s' % (
                column, 'numeric' if to_type == 'numeric' else 'double precision')
        if sqlite:
            with op.batch_alter_table(table) as batch:
                batch.alter_column(column, **kwargs)
        else:
            op.alter_column(table, column, **kwargs)


def upgrade():
    _alter('numeric', 'float')


def downgrade():
    """Reverses the type, and **loses precision doing so** — that is inherent to
    going back to binary floating point, not a defect in this function."""
    _alter('float', 'numeric')
