"""How a user has chosen to clear their debts.

*** A TABLE, NOT COLUMNS ON `Goal`, AND D-121 IS THE REASON. *** This deploy
calls `create_all()`, which creates MISSING TABLES and never missing columns —
so a `Goal.payoff_method` column would apply cleanly here and silently never
appear on any running stack. A new table appears. That trap chose the shape.

*** ONE PLAN PER USER, NOT ONE PER GOAL. *** Avalanche and snowball are
ORDERINGS ACROSS DEBTS: "pay this one first because it costs the most" is
meaningless about a single goal considered alone. A per-goal method would let
somebody hold two contradictory orderings at once and finPal would have to
pick one to report against.

*** IT STORES THE CHOICE, NEVER THE PROJECTION. *** What the plan implies —
which debt first, how long it takes — is derived from the accounts every time
it is asked, by `goal/projection.py`. Storing a computed payoff date would be
a second copy of an arithmetic that already has one home (D-101), and it would
go stale the first time a balance moved.
"""
from datetime import datetime

from src.extensions import db

# Ordered cheapest-first vs smallest-first. finPal states what each does and
# what it costs; it does not recommend one -- that is the advice line the
# product refuses to cross.
AVALANCHE = 'avalanche'
SNOWBALL = 'snowball'
VALID_METHODS = (AVALANCHE, SNOWBALL)


class DebtPlan(db.Model):
    """USER DATA. One row per user, created when they choose a method."""

    __tablename__ = 'debt_plans'

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.String(120), db.ForeignKey('users.id'),
                        nullable=False, unique=True, index=True)

    # `avalanche` | `snowball`. Not nullable: a plan with no method is not a
    # plan, and the row is only created when one is chosen.
    method = db.Column(db.String(12), nullable=False)

    # What they intend to put toward debt each month, in total.
    #
    # *** NULLABLE, BECAUSE THE METHOD IS USEFUL WITHOUT IT. *** Somebody can
    # choose an ordering before they know what they can afford, and refusing
    # to record the choice until they name a number would lose the choice. A
    # plan with no amount orders their debts and projects nothing -- which is
    # the same "no payment, no projection" rule `peak.py` already follows.
    monthly_amount = db.Column(db.Numeric(18, 2), nullable=True)

    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow,
                           onupdate=datetime.utcnow, nullable=False)

    def __repr__(self):
        return f'<DebtPlan {self.user_id} {self.method}>'
