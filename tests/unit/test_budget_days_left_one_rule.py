"""Days left and the per-day figure: ONE server rule for the Budgets hero (Budgets C, 2026-11-20).

Today counts: on day 20 of 30 there are 11 days to spend in, and on the last day there is 1. The hero prints what
`days_left` / `per_day` return, so no client counts days its own way.
"""
from datetime import datetime

from src.services.budget.pace import days_left, pace_for, per_day


def test_today_counts():
    assert days_left(pace_for(datetime(2026, 11, 20))) == 11
    assert days_left(pace_for(datetime(2026, 11, 1))) == 30


def test_the_last_day_is_one_day_not_zero():
    assert days_left(pace_for(datetime(2026, 11, 30))) == 1


def test_per_day_is_the_left_over_those_days_to_the_cent():
    pace = pace_for(datetime(2026, 11, 20))
    assert per_day(769.74, pace) == 69.98


def test_nothing_left_is_no_per_day_figure():
    pace = pace_for(datetime(2026, 11, 20))
    assert per_day(0, pace) is None
    assert per_day(-12.5, pace) is None


def test_no_pace_is_no_figure():
    assert days_left(None) is None
    assert per_day(100, None) is None
