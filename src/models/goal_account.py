"""`goal_accounts` -- one goal, several accounts (B12).

A CORE model for the same reason `Goal` is one: debtPal, retirementPal and firePal
all read goals and none of them may depend on a learning module (owner decision,
2026-09-08).

*** THIS IS AN ASSOCIATION OBJECT, NOT A PLAIN JOIN TABLE, AND THE TWO EXTRA
COLUMNS ARE THE WHOLE POINT OF IT. *** `account_owners` next door is a bare
`db.Table` because membership is the entire fact it records. Here each row carries
a `start_amount` snapshot and a denormalised `active_direction`, and both need to
be read and written by name.

RELEASE-GATING, and in two different ways:

  * The TABLE is created by `create_all()` on an existing database -- a new table
    is, unlike a new column (D-121) -- but only if this module is imported by the
    time it runs. It is reached through `src/models/__init__.py`, which imports it
    explicitly.
  * The ROWS are not. `create_all()` creates a missing table; it does not populate
    one. Every existing goal with an `account_id` needs a join row or it reads as
    an unlinked goal. That is `src/services/goal/backfill.py`, called at boot.
"""

from datetime import datetime

from src.extensions import db


class GoalAccount(db.Model):
    __tablename__ = 'goal_accounts'

    goal_id = db.Column(db.Integer,
                        db.ForeignKey('goals.id', name='fk_goal_account_goal'),
                        primary_key=True)
    account_id = db.Column(db.Integer,
                           db.ForeignKey('accounts.id',
                                         name='fk_goal_account_account'),
                           primary_key=True)
    # *** SNAPSHOTTED PER ROW AT THE MOMENT THIS ACCOUNT JOINED THE GOAL, AND NEVER
    # RECOMPUTED. *** The single-account model snapshots one `goals.start_amount`
    # and refuses to let anything move it, because the denominator of a percentage
    # the user has already been shown is not a client's to restate. Per row is what
    # makes "I forgot a card" answerable at all: adding an account extends the
    # denominator by that account's balance *as at the moment it was added*, so the
    # goal grows for a stated reason instead of jumping. An immutable account set
    # would have been cheaper today and unrecoverable tomorrow -- exactly the shape
    # of the `account_id` restriction, which exists because the history needed to
    # undo it is gone (spec §5.1).
    start_amount = db.Column(db.Numeric(18, 2), nullable=False)
    # 'paydown' | 'accumulate' while the goal is ACTIVE; NULL otherwise.
    #
    # *** THE ONE DENORMALISED COLUMN, AND IT REPLACES TWO. *** The double-counting
    # rule is "one ACTIVE goal per (account, direction)". `status` lives on `goals`
    # and `account_id` now lives here, and no engine has a partial unique index
    # across a join -- so something has to be denormalised onto this row. The spec
    # recommended two columns (`is_active` plus `direction`); one encodes the same
    # rule, because:
    #
    #   * NULLs DO NOT COLLIDE in a unique index on either engine, so "an archived
    #     or achieved goal releases its accounts" falls out of the encoding and
    #     needs no `WHERE` clause at all;
    #   * two derived columns would have to agree with each other as well as with
    #     the goal, and one drifts in one place;
    #   * there is no `CASE` expression in the index, so *** THE PARENTHESISATION
    #     TRAP THAT B5 HIT CANNOT RECUR HERE *** -- see `goal.py`'s `DIRECTION_SQL`,
    #     where the outer parentheses are load-bearing on Postgres and SQLite will
    #     not tell you.
    #
    # The residual risk is the same one `DIRECTION_SQL` carries: a stale value does
    # not raise, it silently constrains the wrong pairs. So it is written in exactly
    # ONE place -- `GoalService.sync_links` -- every writer goes through it, and
    # `test_goal_multi_account.py` drives status and amount changes and asserts this
    # column against `GoalService.direction` after each one.
    active_direction = db.Column(db.String(12), nullable=True)
    added_at = db.Column(db.DateTime, default=datetime.utcnow)

    # The double-counting constraint, moved here from `goals` and made strictly
    # stricter: it now sees EVERY account a goal reads, not just the primary.
    #
    # In the SCHEMA and not in a service, for the reason B5 recorded and which has
    # not changed: an application check RACES. Two requests can each read "no
    # existing goal on this account" before either writes, and both members then
    # earn points for the same dollars.
    __table_args__ = (
        db.Index('uq_goal_account_active_direction',
                 'account_id', 'active_direction', unique=True),
    )

    # String-based, per the repo rule against importing one model file from another.
    #
    # `delete-orphan` on BOTH sides on purpose. Deleting a goal must take its links
    # with it, and so must deleting an account: `goals.account_id` is already a hard
    # FK, so an account with a goal on it could not be deleted before either -- but
    # a join row would add a SECOND way to hit that, and on Postgres it is an
    # IntegrityError rather than anything a handler explains.
    goal = db.relationship(
        'Goal',
        backref=db.backref('links', lazy='selectin',
                           cascade='all, delete-orphan'))
    # `selectin` on BOTH, and on this side it is not a micro-optimisation:
    # `_serialize` renders `link.account.name` for every link of every goal, and
    # the list endpoint renders every goal a household has. Left lazy, a household
    # with thirty goals turns one page load into thirty-odd extra queries -- and
    # no gate in this repo counts queries, so nothing would have said so.
    account = db.relationship(
        'Account', lazy='selectin',
        backref=db.backref('goal_links', lazy=True,
                           cascade='all, delete-orphan'))

    def __repr__(self):
        return (f"<GoalAccount goal={self.goal_id} account={self.account_id} "
                f"active_direction={self.active_direction}>")
