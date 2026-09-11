"""Which mountain a goal is, and the figure that decides it.

*** THIS IS CORE, NOT learnPal. *** Mountains are a goals feature (owner decision
2026-09-11); learnPal reads them to hang lessons off. So the arithmetic lives
beside `GoalService`, which already owns every other derived goal figure.

*** `peak_magnitude` IS THE SERVER'S COPY OF `mountainGeometry.ts` AND THE TWO
MUST AGREE. *** The clients compute a HEIGHT for drawing; the server computes the
same magnitude to decide a BAND, because the band is stored
(`Goal.hardest_band`) and a stored value cannot be derived on a client. Change
one, check the other.
"""

from decimal import Decimal

from src.extensions import db
from src.models.mountain import Mountain, MountainBand


# The order is the band index, and the index is what `Goal.hardest_band` stores.
BAND_ORDER = ['table-mountain', 'ben-nevis', 'mount-fuji',
              'mount-rainier', 'aconcagua', 'everest']


def band_index(mountain_slug):
    """0..5, or None for a slug that is not in the World set."""
    try:
        return BAND_ORDER.index(mountain_slug)
    except ValueError:
        return None


def mountain_for(scale, magnitude):
    """The mountain a figure lands on, or `None` when it cannot be measured.

    *** `None` IS NOT BAND ZERO. *** A paydown peak with no APR has no figure at
    all (§4), and answering "Table Mountain" for it would draw a molehill where
    the honest answer is *we do not know* — parent-spec trap 3, and D-77/D-108
    are what that looks like when it ships.
    """
    if magnitude is None:
        return None
    value = Decimal(str(magnitude))
    row = MountainBand.query.filter(
        MountainBand.scale == scale,
        MountainBand.min_amount <= value,
    ).filter(
        db.or_(MountainBand.max_amount.is_(None), MountainBand.max_amount > value)
    ).first()
    if row is None:
        return None
    return Mountain.query.filter_by(slug=row.mountain_slug).first()


def peak_accounts(goal):
    """The accounts behind a goal, honouring B12's link set.

    Mirrors `GoalService.current_amount`'s resolution exactly, including the
    single-account fallback that exists for the window between `goal_accounts`
    being created and the backfill filling it.
    """
    if goal.links:
        return [link.account for link in goal.links if link.account is not None]
    if goal.account_id is not None and goal.account is not None:
        return [goal.account]
    return []


def peak_magnitude(goal):
    """The figure this peak is measured by, on its own scale.

    Returns `(scale, magnitude)`; magnitude is `None` when it cannot be
    measured. *** THIS IS THE SERVER'S COPY OF `mountainGeometry.ts`'s
    ARITHMETIC AND THE TWO MUST AGREE. *** The clients compute height for
    drawing; the server computes the same magnitude to decide the BAND, because
    the band is stored (`Goal.hardest_band`) and a stored value cannot be
    derived on a client.
    """
    from src.services.goal.service import GoalService
    service = GoalService()
    scale = 'cost' if service.direction(goal) == 'paydown' else 'build'

    if scale == 'build':
        # *** NEVER UNMEASURED. *** `target_amount` is NOT NULL, so distance
        # remaining is always computable, and it is clamped at zero because an
        # achieved goal is flat rather than inverted.
        remaining = goal.target_amount - service.current_amount(goal)
        return scale, max(Decimal('0'), Decimal(str(remaining)))

    # *** CARD DEBT IS A NEGATIVE BALANCE. *** `balances.py::_move` applies one
    # rule for every account type, so the amount accruing interest is
    # `-balance`. `abs()` would charge interest on an OVERPAID card — money the
    # bank owes the user — which is D-176's arithmetic one table over.
    total = Decimal('0')
    any_rate = False
    for account in peak_accounts(goal):
        if account.apr is None:
            continue          # not stated. NOT zero.
        any_rate = True
        owed = max(Decimal('0'), -Decimal(str(account.balance or 0)))
        total += owed * Decimal(str(account.apr)) / Decimal('100') / Decimal('12')
    # No rate anywhere -> unmeasured, and a missing APR must never draw a
    # molehill (parent-spec trap 3). A rate of 0% IS stated and measures at 0.
    return scale, (total if any_rate else None)


# Monthly equivalents for `RecurringExpense.frequency`, whose comment documents
# exactly four values: 'daily', 'weekly', 'monthly', 'yearly'.
#
# *** 52/12 AND 365/12, NOT 4 AND 30. *** "Four weeks" is a month only eight
# times a year; a weekly £60 is £260 a month, not £240, and the ground is a
# figure the user will check against their own bank.
_MONTHLY_FACTOR = {
    'daily': Decimal('365') / Decimal('12'),
    'weekly': Decimal('52') / Decimal('12'),
    'monthly': Decimal('1'),
    'yearly': Decimal('1') / Decimal('12'),
}


def ground_for(user_id):
    """What recurs each month, before any climbing. Base currency.

    *** A MORTGAGE PAYMENT IS NOT A MOUNTAIN; IT IS THE GROUND THE MOUNTAINS
    STAND ON. *** The range shows GOALS — things you climb toward, that finish.
    Rent never finishes and is not optional, and ranking it against "pay off the
    Visa" compares a floor to a summit. (A mortgage PAYOFF goal is still a peak.
    It is the monthly PAYMENT that is ground.)

    *** IT IS "WHAT RECURS", NOT "WHAT IS ESSENTIAL". *** finPal genuinely knows
    the first and does not know the second, which varies enormously between
    households — a car is discretionary until it is how somebody gets to work.
    There is no needs/wants flag and this does not invent one. **Do not infer
    need from a category name**; the seeded `Housing → Rent/Mortgage` label is a
    string a user can rename, not a fact.

    This is what makes voice rule 11 structural instead of a paragraph: the
    layout says you stand on the ground before you climb, so a month with
    nothing spare reads as *the ground being expensive* rather than as a failure
    to climb.

    Returns `(total, recurring_total, minimums_total)` so a caller can show the
    split without recomputing it.
    """
    from src.models.account import Account
    from src.models.recurring import RecurringExpense

    recurring = Decimal('0')
    rows = RecurringExpense.query.filter(
        RecurringExpense.user_id == user_id,
        RecurringExpense.active.is_(True),
    ).all()
    for row in rows:
        # An unknown frequency contributes NOTHING rather than a guess. A wrong
        # ground figure is worse than a low one: the user checks this against
        # their own bank statement.
        factor = _MONTHLY_FACTOR.get((row.frequency or '').lower())
        if factor is None:
            continue
        # `or 0` because amount is nullable and one None must not make the whole
        # sum raise -- the ground is not uncomputable because one row is blank.
        recurring += Decimal(str(row.amount or 0)) * factor

    minimums = Decimal('0')
    for account in Account.query.filter(
        Account.user_id == user_id,
        Account.min_payment.isnot(None),
    ).all():
        # Clamped at zero: a negative minimum is not a credit to the user.
        minimums += max(Decimal('0'), Decimal(str(account.min_payment)))

    return recurring + minimums, recurring, minimums
