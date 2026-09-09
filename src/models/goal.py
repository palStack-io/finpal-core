"""Goal model.

*** THIS IS A CORE MODEL AND MUST STAY ONE. *** Nothing under
`src/modules/learnpal/` may own this table: debtPal, retirementPal and firePal all
need goals and none of them may depend on a learning module. Moving it into the
module later is reverting an owner decision (2026-09-08, *"yes goal can be on
core"*), not refactoring.

A schema declaration only, matching `account.py`'s style -- progress lives in
`src/services/goal/service.py`, in exactly one place, so no second copy can
disagree with it.
"""

from datetime import datetime

from src.extensions import db


class Goal(db.Model):
    __tablename__ = 'goals'

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.String(120),
                        db.ForeignKey('users.id', name='fk_goal_user'),
                        nullable=False, index=True)
    name = db.Column(db.String(120), nullable=False)
    # 'payoff' | 'savings' | 'custom'. Presentation and copy only -- the arithmetic
    # is driven by `direction`, which is DERIVED from the amounts, so a goal whose
    # kind disagrees with its numbers still computes correctly.
    kind = db.Column(db.String(20), nullable=False, default='savings')
    # 'personal' | 'household'. A flag, not a membership table: a goal is ownership
    # shape (a) -- owned, household-visible, owner-or-admin mutable, like Account
    # and Portfolio. `group_users` exists because a group can hold a SUBSET of the
    # household; a household goal is essentially always everyone (D-94: being a user
    # IS being a household member), so a membership list would re-import that
    # mechanism's "who may add whom" problem for no benefit.
    scope = db.Column(db.String(20), nullable=False, default='personal')
    # NULL = a manual goal, whose current figure is typed rather than computed.
    account_id = db.Column(db.Integer,
                           db.ForeignKey('accounts.id', name='fk_goal_account'),
                           nullable=True)
    target_amount = db.Column(db.Numeric(18, 2), nullable=False)
    # *** SNAPSHOTTED AT CREATION AND NEVER RECOMPUTED. CANNOT BE RETROFITTED. ***
    # A payoff goal has no denominator without it: knowing a card is at -$450 with a
    # target of $0 says nothing about how far the user has come. Once users have
    # goals, the history needed to backfill this is gone.
    start_amount = db.Column(db.Numeric(18, 2), nullable=False)
    # Only meaningful when `account_id IS NULL`. Nullable because a manual goal is
    # created before its first figure is typed.
    current_manual = db.Column(db.Numeric(18, 2), nullable=True)
    currency_code = db.Column(db.String(3),
                              db.ForeignKey('currencies.code',
                                            name='fk_goal_currency'),
                              nullable=True)
    start_date = db.Column(db.Date, nullable=False, default=datetime.utcnow)
    target_date = db.Column(db.Date, nullable=True)
    # 'active' | 'achieved' | 'archived'. `achieved` is stamped ONCE by
    # `GoalService.stamp_if_achieved`, so a later transaction that moves the balance
    # back cannot retract a badge the user has already been shown.
    status = db.Column(db.String(20), nullable=False, default='active')
    achieved_at = db.Column(db.DateTime, nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow,
                           onupdate=datetime.utcnow)

    # String-based, per the repo rule against importing one model file from another.
    user = db.relationship('User', backref=db.backref('goals', lazy=True))
    account = db.relationship('Account', backref=db.backref('goals', lazy=True))

    def __repr__(self):
        return f"<Goal {self.name} ({self.status})>"
