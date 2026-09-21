"""How long a debt takes to clear, as arithmetic rather than as a sentence.

*** THIS WAS ALREADY IMPLEMENTED, INSIDE THE COINS ENGINE, AS PROSE. ***
`literacy/payoff.py::debt_minimums` has computed months-to-clear since the
coins work, and prints it as *"Paying $35.00 a month, this card takes 1 year
and 9 months to clear"*. The goal page needed the same figure, and writing it
a second time is D-101 — two computations of one number, which this project
has now hit three times in two days. So the arithmetic moved here and both
callers use it.

*** "NEVER" IS A RESULT, NOT AN ERROR. *** If the payment does not exceed the
monthly interest the balance never falls. Returning `None` for that would make
it indistinguishable from "we do not know", and those are the two states this
codebase keeps insisting must not be collapsed.
"""
import math
from decimal import Decimal

from src.models.debt_plan import AVALANCHE, SNOWBALL  # noqa: F401


class Projection:
    """`months` to clear, or `never` when the payment cannot outrun interest.

    `monthly_interest` is carried because the caller that says "never" has to
    say what the interest IS — a bare refusal explains nothing.
    """

    __slots__ = ('months', 'never', 'monthly_interest', 'payment')

    def __init__(self, months=None, never=False, monthly_interest=None, payment=None):
        self.months = months
        self.never = never
        self.monthly_interest = monthly_interest
        self.payment = payment


def months_to_clear(owed, apr, payment):
    """Standard amortisation. `None` when the inputs cannot answer.

    *** IT REFUSES RATHER THAN ASSUMING A RATE. *** A missing APR is the whole
    `unmeasured` peak; guessing one here would put a confident number under a
    figure finPal does not know, which is the bluffing shape four payoffs were
    caught doing on 2026-09-14.
    """
    if owed is None or payment is None or apr is None:
        return None
    owed = Decimal(str(owed))
    payment = Decimal(str(payment))
    if owed <= 0 or payment <= 0:
        return None

    rate = Decimal(str(apr)) / Decimal('100') / Decimal('12')
    interest = owed * rate
    if payment <= interest:
        return Projection(never=True, monthly_interest=interest, payment=payment)

    # A 0% card is a real thing and `rate == 0` would divide by zero.
    if rate == 0:
        months = int(math.ceil(float(owed / payment)))
    else:
        months = int(math.ceil(
            -math.log(1 - float(owed * rate / payment)) / math.log(1 + float(rate))))
    return Projection(months=months, monthly_interest=interest, payment=payment)


def span_words(months):
    """`1 year and 9 months`. Grouped, because 21 months reads as nothing."""
    years, rem = divmod(months, 12)
    if years and rem:
        return f'{years} year{"s" if years > 1 else ""} and {rem} month{"s" if rem > 1 else ""}'
    if years:
        return f'{years} year{"s" if years > 1 else ""}'
    return f'{months} month{"s" if months > 1 else ""}'


def order_debts(accounts, method, balances=None):
    """The debts in the order a method says to clear them.

    *** `balances` IS `{account_id: amount}` IN ONE CURRENCY, AND SNOWBALL IS
    WRONG WITHOUT IT ON A MULTI-CURRENCY HOUSEHOLD. *** "Smallest balance
    first" compares magnitudes, and comparing €600 with $800 as bare numbers
    ranks them by whichever currency happens to be weaker. That is D-156's
    shape — a figure summed across currencies as though they were one — and the
    caller owns the conversion because it also owns which currency labels the
    answer. Omitted means "they are already comparable", which is the truth on
    a single-currency instance and the identity conversion everywhere else.

    Avalanche does NOT need it: an APR is a rate, and a rate is unitless.

    *** THIS IS THE ONLY THING THE METHOD ACTUALLY DECIDES. *** Avalanche is
    highest rate first — it costs least in total. Snowball is smallest balance
    first — it clears an account soonest, which is the thing people report
    keeps them going. finPal states both effects and orders by the one chosen;
    it does not rank them.

    *** AN ACCOUNT WITH NO RATE SORTS LAST UNDER AVALANCHE, NOT FIRST. ***
    A missing APR is not 0%. Treating it as zero would quietly send it to the
    back for the wrong reason, and treating it as huge would send it to the
    front on a number nobody gave — both are the unmeasured-versus-zero
    collapse this codebase keeps refusing.
    """
    from decimal import Decimal

    owed = [a for a in accounts if float(a.balance or 0) < 0]

    def magnitude(account):
        if balances is not None and account.id in balances:
            return abs(float(balances[account.id] or 0))
        return abs(float(account.balance or 0))

    if method == SNOWBALL:
        return sorted(owed, key=magnitude)
    # Avalanche. `apr is None` sorts last via the first key.
    return sorted(
        owed,
        key=lambda a: (a.apr is None, -float(a.apr or 0), magnitude(a)))
