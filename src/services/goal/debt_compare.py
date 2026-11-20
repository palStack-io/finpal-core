"""Compare the two debt payoff methods (core's own engine, 2026-11-20).

*** ONE COMPUTATION OF EACH METHOD'S FIGURES (D-101). *** `compare_methods` is the only place core works out how long
each method takes and what it costs; the debt-order short lesson reads it and nothing re-derives a figure (the web
chart draws what it is sent).

*** IT RECOMMENDS NEITHER METHOD. *** It states, for each one, the month the last debt clears, the interest paid on the
way and where the method starts. The person chooses.

The simulation, month by month in Decimal: interest on every open balance (rounded half-up to cents), each debt's
minimum, then everything left of the monthly amount to the method's current target, overflowing to the next. A debt
that clears frees its minimum for the next target. Capped at `CAP_MONTHS`: an amount that has not cleared everything
by then does not get ahead of the interest, and that is reported as `never`, never as a made-up total.
"""
from dataclasses import dataclass
from decimal import ROUND_HALF_UP, Decimal
from types import SimpleNamespace
from typing import Optional

from src.services.goal.projection import AVALANCHE, SNOWBALL, order_debts

CAP_MONTHS = 600
_CENT = Decimal('0.01')


@dataclass(frozen=True)
class OwedDebt:
    """One balance owed, as a positive amount in one currency, with its rate (percent a year) and minimum."""
    id: int
    owed: Decimal
    apr: Decimal
    minimum: Optional[Decimal] = None


def _cent(x):
    return x.quantize(_CENT, rounding=ROUND_HALF_UP)


def method_order(debts, method):
    """The ids in the order `method` clears them, by `order_debts` (core's one ordering rule). Sorted by id first, so
    ties (equal balances or rates) start on the same debt every time."""
    stand_ins = [SimpleNamespace(id=d.id, balance=-d.owed, apr=d.apr) for d in sorted(debts, key=lambda d: d.id)]
    return [a.id for a in order_debts(stand_ins, method)]


def _run(debts, budget, order):
    """(months until the last debt clears, total interest), or (None, None) when it has not cleared by the cap."""
    by_id = {d.id: d for d in debts}
    left_owed = {d.id: _cent(d.owed) for d in debts}
    paid_interest = Decimal('0')
    for month in range(1, CAP_MONTHS + 1):
        still = [i for i in order if left_owed[i] > 0]
        if not still:
            return month - 1, paid_interest
        for i in still:
            charge = _cent(left_owed[i] * by_id[i].apr / Decimal('1200'))
            left_owed[i] += charge
            paid_interest += charge
        spare = budget
        for i in still:                      # every minimum first
            part = min(by_id[i].minimum or Decimal('0'), left_owed[i], spare)
            left_owed[i] -= part
            spare -= part
        for i in still:                      # the rest to the target, then the next
            if spare <= 0:
                break
            part = min(left_owed[i], spare)
            left_owed[i] -= part
            spare -= part
    if any(v > 0 for v in left_owed.values()):
        return None, None
    return CAP_MONTHS, paid_interest


def compare_methods(debts, monthly_budget):
    """Highest rate first and smallest balance first, on these debts with this much a month in total.

    Returns `{'avalanche': {...}, 'snowball': {...}}`, each `{'months', 'interest_total', 'first', 'never'}`:
    `months` the month the last debt clears, `interest_total` a Decimal to the cent, `first` the id the method starts
    with. `never=True` (with `months` and `interest_total` None) when the amount does not clear them within the cap.
    """
    budget = Decimal(str(monthly_budget))
    result = {}
    for method in (AVALANCHE, SNOWBALL):
        order = method_order(debts, method)
        months, interest = _run(debts, budget, order)
        result[method] = {'months': months, 'interest_total': None if months is None else _cent(interest),
                          'first': order[0] if order else None, 'never': months is None}
    return result


@dataclass
class DebtComparison:
    """`debt_comparison`'s answer. `methods` is None when there is no monthly amount to run them on."""
    currency: str
    debts: list
    names: dict
    first: dict
    budget: Optional[Decimal]
    basis: Optional[str]
    methods: Optional[dict]


def debt_comparison(user_id):
    """`compare_methods` on the person's own debts and their own monthly amount.

    Debts: every account they hold with a balance owed and a recorded rate (0% included), converted to the base
    currency so smallest-first compares like with like (D-156). A debt without a rate is never simulated. The amount:
    their debt plan's monthly amount (`basis` 'plan'), else the sum of the minimums when every balance owed has one
    ('minimums'), else none.
    """
    from src.models.account import Account
    from src.models.debt_plan import DebtPlan
    from src.utils.currency_converter import RateTable

    rates = RateTable()
    code = rates.base_code
    owed = []
    for a in Account.query.filter(Account.user_id == user_id).all():
        amount = Decimal(str(rates.convert(a.balance, rates.code_of(a), code) or 0))
        if amount < 0:
            owed.append((a, -amount))

    plan = DebtPlan.query.filter_by(user_id=user_id).first()
    minimums = [Decimal(str(a.min_payment)) for a, _ in owed if a.min_payment is not None]
    if plan is not None and plan.monthly_amount is not None:
        budget, basis = Decimal(str(plan.monthly_amount)), 'plan'
    elif owed and len(minimums) == len(owed):
        budget, basis = sum(minimums), 'minimums'
    else:
        budget, basis = None, None

    debts = [OwedDebt(a.id, magnitude, Decimal(str(a.apr)),
                      Decimal(str(a.min_payment)) if a.min_payment is not None else None)
             for a, magnitude in owed if a.apr is not None]
    names = {a.id: a.name for a, _ in owed}
    first = {m: next(iter(method_order(debts, m)), None) for m in (AVALANCHE, SNOWBALL)}
    methods = compare_methods(debts, budget) if budget is not None and debts else None
    return DebtComparison(currency=code, debts=debts, names=names, first=first, budget=budget, basis=basis,
                          methods=methods)
