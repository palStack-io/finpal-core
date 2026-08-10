"""The demo's recurring series must be detectable on ANY day of the month.

*** THIS IS THE BUG THIS FILE EXISTS FOR. *** `_get_transactions_for_persona('Personal
budgeter')` seeded rent as:

    (today - timedelta(days=30))     # slides with today
    (today.replace(day=1))           # PINNED to the 1st of this month

One offset is relative and the other is absolute, so the interval between the two
rent rows is `today.day - 1` days off a month — anywhere from 0 to ~30 depending on
**what day of the month the demo happens to be seeded**. `determine_frequency`
(integrations/recurring/detector.py) recognises 25-35 days as monthly and 13-16 as
biweekly, and returns None in between. Seeded on the 10th the gap is 21 days, which
falls in that dead zone, so "Rent Payment" was invisible to `/recurring/detect`
while "Salary Deposit" (-45 / -15, always exactly 30) was always found.

A fixture that seeds on one date cannot see this. These tests sweep every day of the
month, which is the only way the pinned date shows up.
"""
from datetime import date, timedelta

import pytest

from integrations.recurring.detector import determine_frequency
from src.services.demo.service import DemoService


ALL_DAYS = [date(2026, 8, d) for d in range(1, 29)] + [date(2026, 2, 28), date(2026, 1, 31)]


def _series(txns, description):
    return sorted(t['date'] for t in txns if t['description'] == description)


def _intervals(dates):
    ds = [date.fromisoformat(d) for d in dates]
    return [(b - a).days for a, b in zip(ds, ds[1:])]


@pytest.mark.parametrize('today', ALL_DAYS, ids=lambda d: d.isoformat())
def test_every_repeated_demo_series_has_a_recognisable_frequency(today):
    """No demo series may sit in `determine_frequency`'s dead zone, on any date."""
    txns = DemoService._get_transactions_for_persona('Personal budgeter', today=today)

    seen = {}
    for t in txns:
        seen.setdefault(t['description'], []).append(t['date'])

    for desc, dates in seen.items():
        if len(dates) < 2:
            continue                       # not a series; nothing to detect
        gaps = _intervals(sorted(dates))
        avg = sum(gaps) / len(gaps)
        assert determine_frequency(avg) is not None, (
            f"seeded on {today}, '{desc}' repeats with avg interval {avg}d, which "
            f"determine_frequency() cannot name -- it will never be detected"
        )


@pytest.mark.parametrize('today', ALL_DAYS, ids=lambda d: d.isoformat())
def test_rent_is_monthly_whatever_day_the_demo_is_seeded(today):
    """Rent is the row the bug was in; pin it by name as well as by the sweep."""
    txns = DemoService._get_transactions_for_persona('Personal budgeter', today=today)
    gaps = _intervals(_series(txns, 'Rent Payment'))

    assert gaps, 'the demo no longer seeds a repeating Rent Payment'
    for g in gaps:
        assert determine_frequency(g) == 'monthly', (
            f'seeded on {today}, rent gap of {g}d is not monthly'
        )


# ── The interval being right is NOT enough ───────────────────────────────────
#
# `detect_recurring_transactions(lookback_days=60, min_occurrences=2)` only looks
# at the last 60 days. A perfectly monthly series is still INVISIBLE unless at
# least two of its rows fall inside that window — which is how a first attempt at
# -90/-60/-30 rent produced a textbook monthly cadence that was never detected.
# The frequency test above passed on it, so this one exists to close that gap.

from integrations.recurring.detector import detect_recurring_transactions  # noqa: E402

LOOKBACK = detect_recurring_transactions.__defaults__[0]   # read it, don't hardcode 60
MIN_OCCURRENCES = detect_recurring_transactions.__defaults__[1]


@pytest.mark.parametrize('today', ALL_DAYS, ids=lambda d: d.isoformat())
def test_the_showcase_series_land_inside_the_detectors_lookback_window(today):
    """Rent and the gym are the demo's two recurring showcases; both must be seen."""
    txns = DemoService._get_transactions_for_persona('Personal budgeter', today=today)
    cutoff = today - timedelta(days=LOOKBACK)

    for desc in ('Rent Payment', 'Gym Membership'):
        inside = [d for d in _series(txns, desc) if date.fromisoformat(d) >= cutoff]
        assert len(inside) >= MIN_OCCURRENCES, (
            f"seeded on {today}, '{desc}' has only {len(inside)} row(s) within the "
            f"detector's {LOOKBACK}-day window (needs {MIN_OCCURRENCES}) -- the cadence "
            f"is monthly but the pattern will never be detected"
        )
