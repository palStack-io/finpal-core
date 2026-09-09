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

from sqlalchemy import text

from src.extensions import db

# `GoalService.direction` re-expressed in SQL, and the ONLY place it is duplicated.
#
# *** MECHANISM DECISION (B5), RECORDED HERE BECAUSE THE SPEC ASKED FOR THE
# CONSTRAINT AND NOT FOR A MECHANISM. *** The constraint has to be "one ACTIVE goal
# per (account, direction)", and `direction` is derived, not stored -- a partial
# unique index cannot call a Python method. Three options:
#
#   (a) store `direction` in a column written on save. Rejected: derived state in a
#       column drifts the moment anything writes the row without going through the
#       writer -- a CSV backfill, a `flask shell`, a raw UPDATE -- and the constraint
#       would then be enforcing a stale answer.
#   (b) index on `(account_id, status)` instead. Rejected as STRICTER than the spec:
#       it would forbid a paydown goal and a savings goal coexisting on one account.
#   (c) index the EXPRESSION. Chosen. Nothing is stored, so nothing can drift out of
#       step with the row it describes -- and both engines support an expression in
#       a partial unique index (SQLite >= 3.9, Postgres).
#
# The residual risk of (c) is that this string and `GoalService.direction` are two
# definitions of one rule, which is the duplication D-18 was opened for. A drifted
# index does not raise -- it silently constrains the wrong pairs. So
# `test_goal_double_counting.py::test_the_sql_expression_and_the_python_function_agree`
# drives both over the same matrix, boundaries included. **Change one, change both,
# and let that test tell you if you did not.**
# *** THE OUTER PARENTHESES ARE LOAD-BEARING AND SQLITE WILL NOT TELL YOU. ***
# Postgres requires an expression in an index to be parenthesised; without them it
# answers `syntax error at or near "CASE"` and the index is simply NEVER CREATED.
# SQLite accepts the bare form, so the suite -- which runs on SQLite -- was green
# with an index that production would have refused, leaving the double-counting
# vector wide open on the only database where anyone can exploit it. That is
# D-123's shape exactly, and it was found by running the DDL against a real
# Postgres 14 rather than by reading it. Verified there: the duplicate is refused,
# opposite directions coexist, archived does not block, and two manual goals do not
# collide. Keep them, and keep any reuse of this constant parenthesised too.
DIRECTION_SQL = (
    "(CASE WHEN start_amount < 0 OR target_amount < start_amount "
    "THEN 'paydown' ELSE 'accumulate' END)"
)


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

    # One ACTIVE goal per (account, direction) -- the double-counting constraint.
    #
    # In the SCHEMA and not in a service, because an application check RACES: two
    # requests can each read "no existing goal on this account" before either
    # writes, and both members then earn points for the same dollars.
    #
    # `account_id IS NOT NULL` as well as `status = 'active'`: a manual goal has no
    # shared pot to double-count. NULLs do not collide in a unique index on either
    # engine, so the clause is belt-and-braces -- and it is asserted rather than
    # assumed, because the two engines have differed here before (D-123).
    __table_args__ = (
        db.Index(
            'uq_goal_active_account_direction',
            'account_id', text(DIRECTION_SQL),
            unique=True,
            sqlite_where=text("status = 'active' AND account_id IS NOT NULL"),
            postgresql_where=text("status = 'active' AND account_id IS NOT NULL"),
        ),
    )

    # String-based, per the repo rule against importing one model file from another.
    user = db.relationship('User', backref=db.backref('goals', lazy=True))
    account = db.relationship('Account', backref=db.backref('goals', lazy=True))

    def __repr__(self):
        return f"<Goal {self.name} ({self.status})>"
