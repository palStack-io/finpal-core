"""Non-Monthly budgets as a sinking fund, not a monthly one.

*** THE PROBLEM, IN ONE SENTENCE: a £600 car tax in March always reads as an
overspend against a monthly view. *** The budget design's §10 item 3 asked
whether `Non-Monthly` needs a longer period to mean anything, and noted that
Monarch shows `$0 planned / $278 actual` for the same case — so the monthly
framing is not a solved problem anywhere.

**Owner decision, 2026-09-13: a Non-Monthly budget is a SINKING-FUND TARGET.**
It carries the ANNUAL amount and the page shows the monthly set-aside.

*** AND THAT MAKES THE APP AGREE WITH THE LESSON IT ALREADY SHIPS. ***
`sinking-funds` is one of the nineteen seeded learnPal lessons and says exactly
this:

    "A sinking fund is the unglamorous fix: divide the yearly cost by twelve and
     set that aside each month, so the bill is already paid when it arrives.
     A 600 car-tax bill is 50 a month you barely notice instead of 600 you did
     not have in March."

Teaching one thing and computing another is worse than doing neither.

── WHAT THIS DELIBERATELY DOES NOT DO ──────────────────────────────────────────

*** IT DOES NOT REINTERPRET ANY EXISTING ROW. *** The obvious implementation is
"a Non-Monthly budget's `amount` now means annual" — and it is not safe. Every
Non-Monthly budget already in a database was typed by somebody who believed the
field meant what the form said at the time, and **nothing in the data
distinguishes an annual figure from a monthly one**. Silently multiplying or
dividing a user's own number by twelve would be D-178's failure with real money
attached: a change to a meaning, applied to rows the old meaning wrote.

So the annual case is expressed with a field the model ALREADY has: `period`.
A Non-Monthly budget with `period='yearly'` carries the yearly cost, and its
monthly set-aside is derived. One with `period='monthly'` keeps meaning exactly
what it always meant. Nobody's figure changes underneath them.
"""

#: Months in a year. Named because `/ 12` in three places is three places to
#: get it wrong, and because a quarterly period would want a different divisor.
MONTHS_IN_A_YEAR = 12


def monthly_set_aside(amount, period):
    """What to put by each month to meet `amount` by the time it falls due.

    A yearly amount divided by twelve; anything else is already per-period and
    is returned unchanged.

    *** RETURNS `None` FOR A MISSING AMOUNT RATHER THAN 0. *** "No target" and
    "a target of nothing" are different claims, and a 0 the user acts on is a
    lie — the same rule the group totals follow when they refuse to clamp a
    negative remainder.
    """
    if amount is None:
        return None
    try:
        value = float(amount)
    except (TypeError, ValueError):
        return None
    if (period or '').lower() == 'yearly':
        return round(value / MONTHS_IN_A_YEAR, 2)
    return round(value, 2)


def is_sinking_fund(spending_type, period):
    """True when a row should be read as a sinking fund rather than a month.

    *** BOTH CONDITIONS, NOT EITHER. *** A yearly budget on a FLEXIBLE category
    is still a yearly budget and not a fund you draw down; a monthly Non-Monthly
    budget is a user who told us their figure is already per-month. Only the
    intersection describes "a lump that arrives occasionally, saved for
    steadily".
    """
    return spending_type == 'non_monthly' and (period or '').lower() == 'yearly'


def describe(amount, period):
    """A sentence for the row, or `None` when there is nothing to say.

    `None` rather than an empty string, so a caller renders nothing rather than
    an empty element — the same shape `check_reason` uses when it cannot explain
    a predicate.
    """
    if (period or '').lower() != 'yearly':
        return None
    per_month = monthly_set_aside(amount, period)
    if per_month is None:
        return None
    return f'set aside {per_month:,.2f} a month'
