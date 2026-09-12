"""Where you should be by now, if you were spending evenly.

*** THIS IS THE ONE MISSING CAPABILITY ON THE BUDGET PAGE. *** Everything else
on the Monarch gap list -- three columns, inline editing, group rollups, "show N
unbudgeted" -- is layout over figures finPal already has. finPal has **no pace
indicator at all**, and pace is what a budget is FOR: the question is not "how
much have I spent" but "am I burning this too fast".

*** COMPUTED ON THE SERVER AND SENT ONCE, NOT PER BUDGET. *** Every row shares
one figure -- today's position in the month -- so sending it per row would
repeat the same number N times and invite a client to derive its own. Two
clients each working out "today" independently is D-101's rule, and worse here
than for money: a phone in a different timezone would draw the mark in a
different place from the browser beside it.
"""

import calendar
from datetime import datetime


def pace_for(now=None):
    """`{fraction, day, days_in_month, as_of}` for the month `now` is in.

    `fraction` is 0..1 -- the proportion of the month gone, INCLUSIVE of today,
    so day 1 of 30 is 1/30 and not 0. A budget on the 1st has had a day to be
    spent, and drawing the mark at zero would say a single coffee put you ahead.
    """
    now = now or datetime.now()
    days_in_month = calendar.monthrange(now.year, now.month)[1]
    return {
        'fraction': round(now.day / days_in_month, 4),
        'day': now.day,
        'days_in_month': days_in_month,
        'as_of': now.date().isoformat(),
    }


def pace_applies(period, spending_type):
    """Whether a pace mark means anything for this row.

    *** A MARK THAT CANNOT BE READ IS WORSE THAN NO MARK, AND THERE ARE TWO
    CASES. ***

    * A **weekly or yearly** budget has no day-of-MONTH position. Drawing one
      would measure a yearly premium against a calendar it does not follow.
    * A **non-monthly** group is *resupply that is not monthly* by definition.
      An annual insurance premium is not "behind" in March, it is simply not due
      yet -- and colouring it as behind would invent an urgency the data does
      not support.

    Returned as a BOOLEAN with the caller saying WHY in words, rather than as a
    silently absent mark: a blank column reads as a bug, and "no pace -- not a
    monthly thing" reads as a decision.
    """
    if (period or '').lower() != 'monthly':
        return False
    if spending_type == 'non_monthly':
        return False
    return True
