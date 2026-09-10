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

    # ---------------------------------------------------------------- B12 ----
    # A goal may read SEVERAL accounts (`goal_accounts`), and three things below
    # changed shape for it. They are grouped here rather than scattered so the
    # coupling between them is visible:
    #
    #   * `sync_links` is the ONLY writer of `goal_accounts.active_direction`,
    #     of `goals.start_amount` on a linked goal, and of `goals.account_id`.
    #   * `current_amount` sums the linked balances.
    #   * `mixed_direction` refuses a set whose accounts disagree in sign.
    #
    # *** THE THIRD IS WHAT MAKES THE FIRST TWO SAFE, AND THAT IS NOT OBVIOUS.
    # *** Summing snapshots and summing balances is only honest while every
    # account in the set is on the same side of zero. A card at -1,650 and a
    # savings account at +4,000 net to +2,350, and the sum then presents a goal
    # that is half debt as an accumulation -- one figure, technically computed
    # correctly, describing nothing that happened. The sign check is per ACCOUNT
    # and deliberately not a check on the summed start, which would pass that
    # exact pair. Do not relax one of these without the other.

    def sync_links(self, goal):
        """Recompute everything derived from the link set. THE ONE WRITER.

        Called on create, on update, on archive, on add- and remove-account, and
        from `stamp_if_achieved` -- every path that can change a goal's status,
        its amounts or its accounts. It does not commit; the caller does, in the
        same transaction as whatever it changed.

        Three derived values, and each is a place a stale copy could sit:

        **`goal_accounts.active_direction`** -- 'paydown'/'accumulate' while the
        goal is active, NULL otherwise. The unique index on
        `(account_id, active_direction)` is the double-counting rule, and NULLs
        do not collide, so writing NULL here is literally what "archiving
        releases the account" means. A stale value does not raise; it silently
        constrains the wrong pairs. That is why there is exactly one writer.

        **`goals.start_amount`** -- kept equal to the SUM of the per-row
        snapshots. The per-row snapshots are the immutable fact; this column is a
        maintained total of them, which is what lets `progress`, `validate` and
        `DIRECTION_SQL` stay exactly as they were. It is not a restatement of the
        denominator by a client: each addend was snapshotted by the server at the
        moment its account joined, and none of them ever changes.

        **`goals.account_id`** -- the PRIMARY link, the first account added.
        *** IT IS NEVER NULL FOR A LINKED GOAL, AND THAT IS A DECISION, NOT AN
        ACCIDENT. *** Leaving it NULL for a multi-account goal would send every
        such goal down the manual branch of `current_amount` (reading 0%), render
        `account_name: null` -- "Tracked by hand" -- on any client that has not
        migrated, and make the old `goals` index inert while its test went on
        passing. See the plan's "What `goals.account_id` holds".
        """
        links = sorted(goal.links or [],
                       key=lambda link: (link.added_at or datetime.min,
                                         link.account_id))
        if links:
            goal.start_amount = sum(link.start_amount for link in links)
            goal.account_id = links[0].account_id
        # Computed AFTER `start_amount` is restated, because `direction` reads it.
        direction = self.direction(goal) if goal.status == 'active' else None
        for link in links:
            link.active_direction = direction

    @staticmethod
    def linked_account_ids(goal):
        """Every account this goal reads. [] for a manual goal.

        The single-account fallback is kept for the reason `current_amount`'s is:
        between the table appearing at boot and the backfill running, an existing
        goal has an `account_id` and no link.
        """
        if goal.links:
            return [link.account_id for link in goal.links]
        if goal.account_id is not None:
            return [goal.account_id]
        return []

    @staticmethod
    def mixed_direction(snapshots):
        """True when a set of snapshot balances spans both sides of zero.

        Per ACCOUNT, never on the sum -- see the block comment above. A negative
        snapshot is a debt being paid down; zero and above accumulate, and a
        brand-new savings account at exactly 0.00 must be allowed to join a
        savings goal, so zero sits with the positives.
        """
        values = [Decimal(str(s)) for s in snapshots]
        return any(v < 0 for v in values) and any(v >= 0 for v in values)

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
        # B12: the linked set, when there is one. `or 0` because a balance is
        # nullable and one None would make the whole sum raise -- a goal spanning
        # three cards is not uncomputable because one of them has never synced.
        if goal.links:
            return sum((link.account.balance or 0) for link in goal.links)
        # *** THE SINGLE-ACCOUNT PATH IS KEPT AND IS NOT DEAD CODE. *** Between
        # `create_all()` building `goal_accounts` at boot and the backfill filling
        # it, every existing goal has an `account_id` and no link, and this branch
        # is what stops that window reading them as manual goals stuck at 0%.
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
            # B12: an achieved goal RELEASES its accounts, which is the same rule
            # archiving has always followed -- and it is now expressed by writing
            # NULL into every link's `active_direction`. Forgetting this call is
            # not a cosmetic miss: the goal would keep holding every one of its
            # accounts against a new goal in the same direction, forever.
            self.sync_links(goal)
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

        *** B12: OVER EVERY LINKED ACCOUNT, AND THE SPEC SAID TO VERIFY THIS RATHER
        THAN ASSUME IT WIDENED FOR FREE. *** It does not widen for free: the filter
        names `account_id` and `destination_account_id` explicitly, so a two-account
        goal left as it was would show who contributed to ONE account underneath a
        total covering BOTH. That is not a rounding error in a report -- it is one
        partner's money going unreported beside a figure that counts it, which is
        the same harm `imported` exists to prevent, reached from the other side.
        """
        from src.models.transaction import Expense
        from src.models.user import User
        from src.utils.household import display_name

        account_ids = self.linked_account_ids(goal)
        if not account_ids:
            return []

        incoming = db.or_(
            db.and_(Expense.account_id.in_(account_ids),
                    Expense.transaction_type == 'income'),
            db.and_(Expense.destination_account_id.in_(account_ids),
                    Expense.transaction_type == 'transfer'),
        )
        rows = db.session.execute(
            db.select(Expense.paid_by,
                      db.func.sum(Expense.amount),
                      db.func.max(db.case((Expense.import_source.isnot(None), 1),
                                          else_=0)),
                      # OUTER, because `paid_by` is only validated against visible
                      # members at write time -- a user deleted afterwards leaves
                      # rows behind, and an inner join would silently drop that
                      # person's contribution rather than show it unnamed.
                      db.func.max(User.name))
              .select_from(Expense)
              .outerjoin(User, User.id == Expense.paid_by)
              .where(incoming)
              .group_by(Expense.paid_by)).all()
        # `display_name` does NOT look the user up -- it takes a name and falls back
        # to the id's local part -- so the name has to be joined in. Calling it with
        # the id alone renders every contributor as an email prefix even when they
        # have a name, which is a defect no status code shows.
        return [{'user_id': uid,
                 # Never None: `User.name` is nullable and nothing backfills it, and
                 # one nameless row once stopped the whole household's report
                 # rendering (D-154).
                 'display_name': display_name(uid, name),
                 'amount': total,
                 'imported': bool(flag)} for uid, total, flag, name in rows]

    def as_payload(self, goal):
        """The computed fields a client must not derive for itself."""
        return {
            'current_amount': float(self.current_amount(goal)),
            'direction': self.direction(goal),
            'progress': float(self.progress(goal)),
        }
