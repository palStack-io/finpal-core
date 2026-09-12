"""The pace mark: where you should be by now.

*** THE REFUSALS ARE THE DESIGN. *** A mark drawn on a yearly premium in March
says "you are behind" about something that is not due, which is the opposite of
what a budget is for -- and it is the kind of false alarm that teaches people to
ignore the indicator that matters.
"""

import calendar
from datetime import datetime

from src.services.budget.pace import pace_applies, pace_for


def test_the_fraction_is_INCLUSIVE_of_today(app):
    """*** DAY 1 IS 1/30, NOT 0. *** A budget on the 1st has had a day to be
    spent in; a mark at zero would say a single coffee puts you ahead."""
    p = pace_for(datetime(2026, 9, 1))
    assert p['fraction'] == round(1 / 30, 4)
    assert p['day'] == 1 and p['days_in_month'] == 30


def test_the_last_day_of_the_month_is_exactly_one(app):
    assert pace_for(datetime(2026, 9, 30))['fraction'] == 1.0
    assert pace_for(datetime(2026, 2, 28))['fraction'] == 1.0


def test_it_uses_the_REAL_length_of_each_month(app):
    """Not 30, and not 31. February is the month a hardcoded length gets wrong,
    and it gets it wrong by 7% — enough to move the mark visibly."""
    for year, month in ((2026, 2), (2024, 2), (2026, 4), (2026, 12)):
        assert pace_for(datetime(year, month, 1))['days_in_month'] == \
            calendar.monthrange(year, month)[1]


def test_a_LEAP_February_is_29_days(app):
    assert pace_for(datetime(2024, 2, 10))['days_in_month'] == 29
    assert pace_for(datetime(2026, 2, 10))['days_in_month'] == 28


def test_A_YEARLY_BUDGET_HAS_NO_PACE(app):
    """A day-of-MONTH position means nothing to a yearly budget."""
    assert pace_applies('yearly', 'flexible') is False
    assert pace_applies('weekly', 'flexible') is False
    assert pace_applies('monthly', 'flexible') is True


def test_THE_NON_MONTHLY_GROUP_HAS_NO_PACE_EVEN_WHEN_THE_PERIOD_IS_MONTHLY(app):
    """*** THE CASE THE PERIOD CHECK ALONE WOULD MISS. *** `non_monthly` means
    *resupply that is not monthly*. An annual premium sitting in a monthly-period
    budget is not 'behind' in March — it is not due — and colouring it as behind
    invents an urgency the data does not support."""
    assert pace_applies('monthly', 'non_monthly') is False
    assert pace_applies('monthly', 'fixed') is True
    assert pace_applies('monthly', None) is True
