"""Every query against the coin ledger, in one place.

The repository pattern is established for `Account` (`CLAUDE.md`): services
import the repository, and route handlers never touch the ORM. These are new
models, so they get one from the start.

*** THE RATCHET LIVES HERE, NOT IN THE CALLER. *** A caller that computed the
delta itself could get it wrong in one place and be right in four others. One
writer, one rule.
"""

import logging
from decimal import Decimal

from sqlalchemy import func

from src.extensions import db
from src.models.coins import CoinAward, CoinPurchase

logger = logging.getLogger(__name__)


class CoinRepository:
    """Reads and writes for `coin_awards` and `coin_purchases`.

    Nothing here commits. The caller owns the transaction, so a night's awards
    land together or not at all -- the same convention `raise_watermark` follows.
    """

    # ------------------------------------------------------------------
    # Reads
    # ------------------------------------------------------------------

    def earned(self, user_id) -> int:
        """The lifetime total. *** READS ONLY `coin_awards`, SO IT CANNOT FALL. ***"""
        return int(db.session.query(
            func.coalesce(func.sum(CoinAward.coins), 0)
        ).filter(CoinAward.user_id == user_id).scalar() or 0)

    def spent(self, user_id) -> int:
        return int(db.session.query(
            func.coalesce(func.sum(CoinPurchase.price), 0)
        ).filter(CoinPurchase.user_id == user_id).scalar() or 0)

    def balance(self, user_id) -> int:
        """What is left to spend. Derived, never stored -- a stored balance is a
        third copy of a figure two tables already determine."""
        return self.earned(user_id) - self.spent(user_id)

    def award_row(self, user_id, act_slug):
        return CoinAward.query.filter_by(
            user_id=user_id, act_slug=act_slug).first()

    def owned_gear(self, user_id) -> set:
        return {row.gear_slug for row in
                CoinPurchase.query.filter_by(user_id=user_id).all()}

    def awards(self, user_id) -> list:
        return CoinAward.query.filter_by(user_id=user_id).all()

    # ------------------------------------------------------------------
    # Writes
    # ------------------------------------------------------------------

    def upsert_award(self, user_id, act_slug, coverage, coins) -> int:
        """Raise a user's award for one act. Returns the coins newly earned.

        *** A LOWER COVERAGE IS REFUSED, NOT APPLIED. *** Coverage genuinely
        falls: pay a card off and open a new one, and the share of your debt
        carrying a recorded rate drops overnight through no fault of yours.
        Read against a watermark that only rises, that costs nothing; read
        against live coverage, it would take coins back for tidying up.

        Returns 0 rather than a negative number, so a caller can add the result
        to a running total without checking its sign.
        """
        coverage = Decimal(str(coverage))
        row = self.award_row(user_id, act_slug)
        if row is None:
            # *** AN ACT WORTH NOTHING YET WRITES NO ROW AT ALL. *** A user who
            # has not named a goal is at coverage 0, and a row saying so is a
            # zero nobody asked for: it makes the wallet look populated while it
            # is empty, and it is one query away from being rendered as a score
            # the user is failing at. The row appears when they earn something.
            if int(coins) <= 0:
                return 0
            db.session.add(CoinAward(
                user_id=user_id, act_slug=act_slug,
                coverage=coverage, coins=int(coins)))
            return int(coins)

        if coverage <= row.coverage:
            return 0

        delta = int(coins) - int(row.coins)
        if delta <= 0:
            # Coverage rose but the ceiling was retuned downward. Keep the
            # coverage watermark honest and the coins where they are.
            row.coverage = coverage
            return 0
        row.coverage = coverage
        row.coins = int(coins)
        return delta

    def purchase(self, user_id, gear_slug, price) -> bool:
        """Buy one piece of gear. False when unaffordable or already owned.

        *** REFUSES RATHER THAN RAISING, AND WRITES NOTHING ON A REFUSAL. *** A
        half-applied purchase is the one way this ledger could lose a user
        coins, so the balance check and the insert are the same decision.
        """
        price = int(price)
        if CoinPurchase.query.filter_by(
                user_id=user_id, gear_slug=gear_slug).first() is not None:
            return False
        if self.balance(user_id) < price:
            return False
        db.session.add(CoinPurchase(
            user_id=user_id, gear_slug=gear_slug, price=price))
        return True
