"""Goal progress -- server-side, and in exactly one place.

*** NEVER COMPUTED IN A CLIENT. *** Two clients computing the same percentage is
D-101's shape: `mobile/src/services/analyticsService.ts` and web-ui disagreed about
the same figures for months because each derived them, and a green typecheck was
reassuring the whole time. The payload carries the number.
"""

from datetime import datetime
from decimal import Decimal

from src.extensions import db


class GoalService:
    """Progress, direction, and the achieved stamp."""

    def current_amount(self, goal):
        """The goal's current figure: computed if linked, typed if not.

        *** LINKING IS WHAT MAKES A GOAL HONEST *** and is the answer to the
        gamification problem, not a convenience: a typed `current_manual` can be
        inflated, a linked `account.balance` cannot. Points are awarded only for
        linked goals (spec §5).

        A manual goal with nothing typed yet reads as its own `start_amount` --
        "no progress yet" -- rather than None, which would make `progress` raise a
        TypeError on a goal the API had just created.
        """
        if goal.account_id is not None:
            return goal.account.balance
        if goal.current_manual is None:
            return goal.start_amount
        return goal.current_manual

    def direction(self, goal):
        """Derived, never stored.

        *** THE SPEC'S LITERAL RULE WAS WRONG AND THE SPEC'S OWN EXAMPLES PROVE IT.
        *** It read "`accumulate` if `target > start`, `paydown` if `target < start`",
        and the worked example two rows above it is "Pay off Chase Amazon", start
        -1,125.41, target 0. Card debt is a NEGATIVE balance (verified: `_move`
        applies one rule for every account type), so paying a card off moves the
        number UP -- `target > start` -- and the literal rule labels every payoff
        goal `accumulate`. Corrected here, and in the spec, on 2026-09-09.

        Both consumers break under the literal rule, which is why this is not
        cosmetic:
          * presentation reads "your number is going up, good news" while what the
            user is watching is a debt they are trying to shrink;
          * the partial unique index is on `(account_id, direction)`, so a payoff
            goal and a savings goal on the same account would collide as one
            direction while two payoff goals on one card would not.

        The corrected rule, which satisfies all three of the spec's examples:
        a goal is a `paydown` when the account was in DEBT at snapshot, or when the
        target is below the start. Everything else accumulates.
        """
        if goal.start_amount < 0 or goal.target_amount < goal.start_amount:
            return 'paydown'
        return 'accumulate'

    def progress(self, goal):
        """(current - start) / (target - start). 0.0-1.0+, NEVER clamped.

        *** ONE EXPRESSION, NO BRANCH ON DIRECTION. *** Card debt is a negative
        balance -- `balances.py::_move` applies one rule for every account type with
        no `type == 'credit'` special case -- so a payoff goal runs from -1,125.41
        toward 0 and this absorbs it: (-450 + 1125.41) / (0 + 1125.41) = 0.60.

        A `paydown` branch would be `(start - current) / (start - target)`, which is
        the SAME expression with both signs flipped and therefore cannot compute a
        different number. That is precisely the argument for not writing it: a
        branch that can only ever agree with the other one is a place for a sign
        typo to live, not a case that needs handling.

        Not clamped, because overshooting is real information and the caller decides
        how to render it.
        """
        span = goal.target_amount - goal.start_amount
        # `validate` refuses span == 0 at write time, so this cannot divide by zero.
        return (self.current_amount(goal) - goal.start_amount) / span

    def validate(self, *, start_amount, target_amount):
        """Refuse the one input that makes `progress` divide by zero.

        Refused at write time rather than defended against at read time, so the
        formula never has to branch and no stored goal can be uncomputable.
        """
        if target_amount == start_amount:
            raise ValueError('target_amount must differ from start_amount')

    def stamp_if_achieved(self, goal):
        """True only on the transition. Idempotent afterwards.

        A caller that awards points on a True return would award them on every read
        if this answered True twice.
        """
        if goal.status != 'active':
            return False
        if self.progress(goal) >= 1:
            goal.status = 'achieved'
            goal.achieved_at = datetime.utcnow()
            db.session.commit()
            return True
        return False

    def contributions(self, goal):
        """`SUM(amount) GROUP BY paid_by` over money moving INTO the linked account.

        *** `paid_by` IS WHO FRONTED THE CASH, NOT WHOSE MONEY IT IS. ***
        Attribution is the account's owner (D-18, owner decision 2026-08-06) and
        stays that way. These are two different questions with two correct answers,
        and a contribution tracker wants the second: on a joint account Harun owns,
        attribution reads 700/0 and this reads 400/300.

        *** TWO SHAPES COUNT AS MONEY COMING IN, AND THE SECOND IS THE ONE THE SPEC
        ACTUALLY DESCRIBES. *** An `income` row on the account, and a `transfer`
        whose DESTINATION is the account -- the spec's own example of how a couple
        records a contribution is *"I moved $200 into the emergency fund"*, which is
        a transfer, and a transfer's `account_id` is the account the money LEFT.
        Keying this to income alone reports zero for the exact interaction the
        feature exists for, and every test written from income rows stays green.

        Returns [] for a manual goal: there is no account, so there are no rows and
        no honest way to say who contributed. An empty list is the correct answer,
        not a row reading $0.00 -- a zero beside a name reads as a measurement
        ("this person put in nothing") when the truth is "nobody knows".

        `imported` is per person, via `max()` over the group, not per breakdown:
        `creation.py` defaults `paid_by` to whoever CREATED the row, so a CSV or
        SimpleFin row credits the importer rather than the payer. The row stays and
        the claim is qualified. Flagging everyone because one row was imported would
        train the user to ignore the label, which is worse than not showing it.
        """
        from src.models.transaction import Expense
        from src.utils.household import display_name

        if goal.account_id is None:
            return []

        incoming = db.or_(
            db.and_(Expense.account_id == goal.account_id,
                    Expense.transaction_type == 'income'),
            db.and_(Expense.destination_account_id == goal.account_id,
                    Expense.transaction_type == 'transfer'),
        )
        rows = db.session.execute(
            db.select(Expense.paid_by,
                      db.func.sum(Expense.amount),
                      db.func.max(db.case((Expense.import_source.isnot(None), 1),
                                          else_=0)))
              .where(incoming)
              .group_by(Expense.paid_by)).all()
        return [{'user_id': uid,
                 # Never None: `User.name` is nullable and nothing backfills it, and
                 # one nameless row once stopped the whole household's report
                 # rendering (D-154).
                 'display_name': display_name(uid),
                 'amount': total,
                 'imported': bool(flag)} for uid, total, flag in rows]

    def as_payload(self, goal):
        """The computed fields a client must not derive for itself."""
        return {
            'current_amount': float(self.current_amount(goal)),
            'direction': self.direction(goal),
            'progress': float(self.progress(goal)),
        }
