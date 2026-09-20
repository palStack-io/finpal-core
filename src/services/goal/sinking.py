"""What a sinking fund needs to be, in the user's own figures.

*** A SINKING FUND IS THE ONE CALCULATION WHERE THE DIVISOR IS NOT A MONTH. ***
An emergency fund asks "how many months of essentials", a convention finPal
refuses to pick (`buffer.py`). This asks something answerable: what arrives
once or twice a YEAR, divided by twelve. There is no judgement call in it, so
this one does name a figure — the twelfth — rather than offering options.

*** IT COUNTS OBSERVED SPENDING, NOT PLANNED SPENDING, AND SAYS SO. *** The
source is expenses in categories the user has classified `non_monthly`, over
the last twelve complete months. `has_non_monthly_spending` also accepts a
YEARLY RECURRING ROW as evidence that such spending exists, and this function
deliberately does NOT add those in: a recurring row usually GENERATES the
expenses below, so summing both would double-count the same car tax. The
predicate answers "is this person the sort who needs one"; this answers "how
much", and they are allowed different sources.

*** SO AN UNSORTED USER GETS `None`, NOT A ZERO. *** Same fail-closed rule as
`buffer_picture`: "set aside $0.00 a month" is a sentence finPal cannot
justify, and the caller renders nothing rather than a target it invented.
"""
from datetime import datetime
from decimal import Decimal, ROUND_CEILING

# Twelve complete months. Long enough to catch a thing that happens once a
# year, bounded so the scan stays cheap — the same reasoning
# `STREAK_LOOKBACK_MONTHS` records.
LOOKBACK_MONTHS = 12


def _window(now=None):
    """The last `LOOKBACK_MONTHS` COMPLETE months, as `(start, end)`.

    Complete, because a part-month understates an annual total and this figure
    is divided by twelve — a September that is nine days old would quietly
    shrink everything.
    """
    now = now or datetime.utcnow()
    end = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    year, month = end.year, end.month
    for _ in range(LOOKBACK_MONTHS):
        month -= 1
        if month == 0:
            month, year = 12, year - 1
    return datetime(year, month, 1), end


def sinking_picture(user_id, scope_ids=None, now=None, to_code=None):
    """`None` when finPal cannot say, else the annual total and its twelfth.

    Returned in `to_code`, defaulting to the instance's base currency — D-156,
    and the defect D-278 was: a total summed across currencies is a number in
    no currency at all.
    """
    from src.models.category import Category
    from src.models.transaction import Expense
    from src.utils.currency_converter import RateTable
    from src.utils.household import read_scope

    household_ids = scope_ids or read_scope(user_id)
    non_monthly = {c.id for c in Category.query.filter(
        Category.user_id.in_(household_ids),
        Category.spending_type == 'non_monthly').all()}
    if not non_monthly:
        return None

    start, end = _window(now)
    rows = (Expense.query
            .filter(Expense.user_id.in_(household_ids),
                    Expense.date >= start, Expense.date < end,
                    Expense.transaction_type == 'expense',
                    Expense.category_id.in_(non_monthly))
            .all())
    if not rows:
        return None

    rates = RateTable()
    display = to_code or rates.base_code
    annual = Decimal('0')
    for row in rows:
        annual += Decimal(str(rates.amount_of(row, display) or 0))
    if annual <= 0:
        return None

    return {
        'annual': float(round(annual, 2)),
        # *** ROUNDED UP, NEVER DOWN. *** Same rule as `monthly_contribution`:
        # a twelfth rounded down is short by the end of the year, and a plan
        # that quietly misses is worse than one that asks for a little more.
        'monthly': float((annual / Decimal(12)).quantize(
            Decimal('0.01'), rounding=ROUND_CEILING)),
        'months_counted': LOOKBACK_MONTHS,
        'currency_code': display,
    }
