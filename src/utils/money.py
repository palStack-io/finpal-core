"""Turning numbers that arrive from outside into money.

**AUDIT D-58.** Money columns are `Numeric` — exact decimal — because
`Account.balance` is mutated in place and nothing ever re-derives it from the
transactions that produced it, so a binary-float error accumulates and never
self-corrects. Observed on the deploy: 1104.55 became 1104.5500000000002 after a
single add-and-delete.

The columns being `Numeric` is only half of it. A value read back from the
database is a `Decimal`, but a value that has just arrived from a JSON payload is
a `float`, and in Python **`Decimal + float` raises `TypeError`** rather than
quietly converting. So there has to be exactly one place where the outside world's
numbers become money, and this is it.

Coercing through `str()` is deliberate and is the whole point: `Decimal(0.1)` is
0.1000000000000000055511151231257827021181583404541015625 — the binary float's
true value, faithfully preserved — whereas `Decimal(str(0.1))` is `0.1`. Going via
the repr is what discards the error that floating point already introduced,
instead of carrying it into a type that will then hold onto it forever.
"""
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP

#: Currency amounts. Two places, matching `Numeric(18, 2)` in the models.
CENTS = Decimal('0.01')

#: Share counts and exchange rates, which legitimately need more than two places.
PRECISE = Decimal('0.00000001')


def to_money(value, quantum=CENTS):
    """A `Decimal` rounded to `quantum`, or `None` if there is no value.

    `None` passes through rather than becoming zero: `Expense.original_amount`
    and `TransactionRule.amount_min` are nullable, and "not set" is not "0.00".

    `ROUND_HALF_UP` rather than Python's default banker's rounding, because this
    is money a person reads: 0.125 becoming 0.12 is correct for statistics and
    surprising on a receipt.
    """
    if value is None or value == '':
        return None
    if isinstance(value, Decimal):
        return value.quantize(quantum, rounding=ROUND_HALF_UP)
    try:
        return Decimal(str(value)).quantize(quantum, rounding=ROUND_HALF_UP)
    except (InvalidOperation, ValueError, TypeError):
        return None


def money_or_zero(value, quantum=CENTS):
    """`to_money`, with `None` collapsed to zero.

    For arithmetic that must produce a number — a balance move, a running total —
    where an absent amount means "moves nothing" rather than "unknown".
    """
    return to_money(value, quantum) or Decimal('0')
