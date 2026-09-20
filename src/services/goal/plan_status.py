"""How a debt plan is going — derived, never stored.

*** COMPUTED ON READ, WITH NO WEEKLY JOB AND NO STORED SNAPSHOT. *** The ask
was "every week we tell them how they are doing", and the obvious build is a
cron writing a status row. Two facts make that the wrong shape here:

1. *** finPal HAS NO PUSH NOTIFICATIONS AT ALL. *** (`notification.md` is the
   inventory.) Nothing can reach the user between visits, so "weekly" can only
   ever mean "what it says when they next look" — and a stored status is then
   just a figure that can go stale between the job and the visit.
2. A stored status is a second copy of an arithmetic that already has one
   home. That is D-101, which this project hit four times in three days.

*** WHAT IS MEASURED IS PAYMENTS, NOT BALANCES. *** No balance history is
stored anywhere, so "were you on plan in March" cannot be answered from
balances. It can be answered from TRANSACTIONS, which are kept: money moving
toward a debt account in a month is a payment, and that is the thing the user
actually controls. It is also the honest measure — a balance can rise because
interest posted, which is not a missed payment.
"""
from datetime import datetime
from decimal import Decimal

# How far back a streak will look. Matches `badges.STREAK_LOOKBACK_MONTHS`'s
# intent: long enough to be an achievement, bounded so the scan stays cheap.
STREAK_LOOKBACK_MONTHS = 24


def _month_bounds(year, month):
    start = datetime(year, month, 1)
    end = (datetime(year + 1, 1, 1) if month == 12
           else datetime(year, month + 1, 1))
    return start, end


def _previous_months(count, now=None):
    """`(year, month)` for the last `count` COMPLETE months, newest first."""
    now = now or datetime.utcnow()
    year, month = now.year, now.month
    out = []
    for _ in range(count):
        month -= 1
        if month == 0:
            month, year = 12, year - 1
        out.append((year, month))
    return out


def paid_toward_debt(user_id, year, month, scope_ids=None, to_code=None):
    """What moved toward this user's debt accounts in a month.

    Returned in `to_code`, defaulting to the instance's base currency.

    *** A PAYMENT IS MONEY LEAVING A NON-DEBT ACCOUNT FOR A DEBT ONE, AND
    finPal CANNOT ALWAYS SEE THAT. *** Where a transfer is recorded against the
    card it is countable; where somebody paid from an account finPal does not
    hold, it is not. So this measures what it can see and the caller must treat
    a zero as "nothing observed", never as "they paid nothing".
    """
    from src.models.account import Account
    from src.models.transaction import Expense
    from src.utils.household import read_scope

    household_ids = scope_ids or read_scope(user_id)
    debt_ids = [a.id for a in Account.query.filter(
        Account.user_id.in_(household_ids),
        Account.type.in_(('credit', 'loan'))).all()]
    if not debt_ids:
        return None

    start, end = _month_bounds(year, month)
    rows = (Expense.query
            .filter(Expense.user_id.in_(household_ids),
                    Expense.date >= start, Expense.date < end,
                    Expense.account_id.in_(debt_ids),
                    Expense.transaction_type == 'transfer')
            .all())
    # *** EVERY ROW IS RESTATED IN ONE CURRENCY BEFORE IT IS SUMMED. D-156. ***
    # A household can hold a euro card and a dollar loan, and adding their
    # payments as bare numbers produces a total in no currency at all — which
    # would then be compared against a `monthly_amount` that IS in one. The
    # dashboard was doing exactly this until B1 (owner, 2026-09-08) and the
    # decision there was to convert.
    #
    # *** AND `RateTable.convert` RETURNS THE AMOUNT UNCHANGED WHEN IT CANNOT
    # CONVERT *** — no base currency, or a code missing from the table. That is
    # its documented behaviour and it is the right one here: a missing rate
    # must not turn a real payment into a zero, which would read as "you paid
    # nothing" on a screen whose whole subject is whether you paid.
    from src.utils.currency_converter import RateTable

    rates = RateTable()
    display = to_code or rates.base_code
    total = Decimal('0')
    for r in rows:
        amount = rates.amount_of(r, display)
        total += Decimal(str(amount or 0))
    return total


def plan_status(user_id, scope_ids=None, now=None, to_code=None):
    """`None`, or how this month is going against the plan.

    *** "BEHIND" IS STATED AND NOTHING IS OFFERED. *** Owner decision,
    2026-09-19. The person who is behind is usually behind because they could
    not pay, not because they forgot, and a prompt they cannot act on is a
    reminder that they are failing. The figure is the message.
    """
    from src.models.debt_plan import DebtPlan

    plan = DebtPlan.query.filter_by(user_id=user_id).first()
    if plan is None or plan.monthly_amount is None:
        return None

    now = now or datetime.utcnow()
    paid = paid_toward_debt(user_id, now.year, now.month, scope_ids, to_code)
    if paid is None:
        return None

    planned = Decimal(str(plan.monthly_amount))
    difference = paid - planned
    return {
        'method': plan.method,
        'planned': float(planned),
        'paid': float(paid),
        # Positive is ahead, negative behind. NOT clamped, and not rounded to
        # a verdict: the number is what the reader acts on.
        'difference': float(difference),
        'state': 'ahead' if difference > 0 else ('on' if difference == 0 else 'behind'),
    }


def best_on_plan_run(user_id, scope_ids=None, to_code=None):
    """The longest run of complete months that met the plan.

    *** THE BEST, NEVER THE CURRENT — the same rule `best_on_budget_run`
    follows. *** A hard month cannot erase a run from the spring, because
    decision 1 says nothing earned is ever taken away.

    *** A MONTH finPal COULD NOT SEE ENDS A RUN WITHOUT COUNTING AGAINST IT.
    *** `None` from `paid_toward_debt` means no debt accounts existed then, not
    that nothing was paid — so it breaks the run and never shortens `best`.
    """
    from src.models.debt_plan import DebtPlan

    plan = DebtPlan.query.filter_by(user_id=user_id).first()
    if plan is None or plan.monthly_amount is None:
        return 0

    planned = Decimal(str(plan.monthly_amount))
    best = run = 0
    for (year, month) in _previous_months(STREAK_LOOKBACK_MONTHS):
        paid = paid_toward_debt(user_id, year, month, scope_ids, to_code)
        if paid is not None and paid >= planned:
            run += 1
            best = max(best, run)
        else:
            run = 0
    return best
