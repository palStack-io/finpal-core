"""What an emergency fund needs to be, in the user's own figures.

*** IT STATES THE ARITHMETIC AND REFUSES TO PICK THE NUMBER OF MONTHS. ***
Three months and six months are conventions, not facts; which is right depends
on job security, dependants and health, none of which finPal knows. So this
returns what EACH would cost and what it would take to get there, and the user
chooses. That is the same line `avalanche-vs-snowball` walks and the reason
`peakSubline` states a figure rather than a recommendation.

*** EVERY FIGURE HERE IS ALREADY COMPUTED SOMEWHERE ELSE, AND THAT IS
DELIBERATE. *** `_essential_monthly_spend` and `_liquid_assets` belong to
`AnalyticsService` and are reused, not reimplemented — the health tab and this
calculator must not be able to disagree about how many months of buffer
somebody has. That is D-101, which this project hit four times in three days.
"""
from decimal import Decimal


# The conventional options, offered as options. finPal does not choose.
MONTH_OPTIONS = (3, 6)


def buffer_picture(user_id, scope_ids=None, analytics=None):
    """`None` when finPal cannot say, else the figures a lesson can quote.

    *** `None` IS A REAL ANSWER AND MUST NOT BE A ZERO. *** A user with no
    spending recorded has no essential monthly cost, and "you need $0.00" is a
    sentence finPal cannot justify — the bluffing shape four payoffs were
    caught doing on 2026-09-14.
    """
    from src.services.analytics.service import AnalyticsService

    service = analytics or AnalyticsService()
    monthly = service._essential_monthly_spend(user_id, scope_ids)
    if not monthly or monthly <= 0:
        return None

    held = service._liquid_assets(user_id, scope_ids)
    months_covered = round(float(held / monthly), 1)

    targets = []
    for months in MONTH_OPTIONS:
        target = monthly * Decimal(months)
        short_by = target - held
        targets.append({
            'months': months,
            'target': float(round(target, 2)),
            # Negative means already there. NOT clamped: "you are 1,200 past
            # three months" is worth knowing, and a 0 would read as "exactly
            # enough", which is a different fact.
            'short_by': float(round(short_by, 2)),
        })

    return {
        'essential_monthly': float(round(monthly, 2)),
        'held': float(round(held, 2)),
        'months_covered': months_covered,
        'targets': targets,
    }


def monthly_contribution(short_by, months_to_save):
    """What reaching a target costs a month. `None` when it cannot be divided.

    Rounded UP, never down: a contribution rounded down reaches the target a
    month late, and a plan that quietly misses is worse than one that asks for
    a little more.
    """
    if short_by is None or months_to_save is None or months_to_save <= 0:
        return None
    if short_by <= 0:
        return Decimal('0')
    from decimal import ROUND_CEILING
    return (Decimal(str(short_by)) / Decimal(months_to_save)).quantize(
        Decimal('0.01'), rounding=ROUND_CEILING)
