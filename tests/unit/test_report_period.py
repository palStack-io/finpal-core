"""Unit tests for the report period resolver (stream A, item A1).

`resolve_period` is pure: it reads no clock and touches no database. Every case
below is a calendar fact that was checked against the 2026 calendar before the
test was written, not a value copied out of an implementation.

The semantics under test, which the design spec left to the implementation:

  weekly  - the last COMPLETE Monday-Sunday week ending strictly before
            `as_of`'s date *in the user's own timezone*.
  monthly - the calendar month before the month containing that local date.

`periods_back` steps further into the past by whole periods, which is what the
monthly report's vs-previous deltas need (spec section 3). It exists here so
that `builder.py` never hand-rolls `as_of - timedelta(days=30)`, which from
March 1st lands in January.
"""
from datetime import date, datetime, time, timedelta, timezone

import pytest

from src.services.report.period import resolve_period


def utc(iso):
    """An aware UTC instant, which is the contract for `as_of`."""
    return datetime.fromisoformat(iso).replace(tzinfo=timezone.utc)


# --- weekly ---------------------------------------------------------------

def test_weekly_from_a_monday_covers_the_week_that_just_ended():
    # 2026-07-06 is a Monday; the week that just closed is Mon 6/29 - Sun 7/5.
    start, end, _ = resolve_period('weekly', utc('2026-07-06T12:00:00'), 'UTC')

    assert (start, end) == (date(2026, 6, 29), date(2026, 7, 5))


def test_weekly_from_midweek_still_covers_the_last_complete_week():
    # 2026-09-08 is a Tuesday. The current part-week is NOT reported on.
    start, end, _ = resolve_period('weekly', utc('2026-09-08T12:00:00'), 'UTC')

    assert (start, end) == (date(2026, 8, 31), date(2026, 9, 6))


def test_weekly_from_a_sunday_excludes_the_week_that_ends_that_day():
    # Sunday 2026-07-05 is not over, so the last complete week is 6/22 - 6/28.
    start, end, _ = resolve_period('weekly', utc('2026-07-05T12:00:00'), 'UTC')

    assert (start, end) == (date(2026, 6, 22), date(2026, 6, 28))


def test_weekly_periods_back_steps_a_whole_week_across_a_year_boundary():
    # Monday 2026-01-05: the closed week is Mon 12/29/2025 - Sun 1/4/2026.
    current = resolve_period('weekly', utc('2026-01-05T12:00:00'), 'UTC')
    previous = resolve_period(
        'weekly', utc('2026-01-05T12:00:00'), 'UTC', periods_back=1)

    assert (current.start, current.end) == (date(2025, 12, 29), date(2026, 1, 4))
    assert (previous.start, previous.end) == (date(2025, 12, 22), date(2025, 12, 28))


# --- monthly --------------------------------------------------------------

def test_monthly_covers_the_calendar_month_that_just_ended():
    start, end, _ = resolve_period('monthly', utc('2026-07-06T12:00:00'), 'UTC')

    assert (start, end) == (date(2026, 6, 1), date(2026, 6, 30))


def test_monthly_fired_on_the_first_reports_the_month_before():
    start, end, _ = resolve_period('monthly', utc('2026-07-01T09:00:00'), 'UTC')

    assert (start, end) == (date(2026, 6, 1), date(2026, 6, 30))


def test_monthly_periods_back_steps_a_calendar_month_not_thirty_days():
    # `as_of` is deliberately the 31st: 30 days before it is the 1st of the
    # SAME month, so an implementation that stepped back 30 days would answer
    # February here. An as_of mid-month would let that mistake pass.
    previous = resolve_period(
        'monthly', utc('2026-03-31T09:00:00'), 'UTC', periods_back=1)

    assert (previous.start, previous.end) == (date(2026, 1, 1), date(2026, 1, 31))


def test_monthly_periods_back_crosses_the_year_boundary():
    # Same shape: Jan 31 minus 30 days is Jan 1, so the 30-day mistake answers
    # December 2025 while the right answer is November.
    previous = resolve_period(
        'monthly', utc('2026-01-31T09:00:00'), 'UTC', periods_back=1)

    assert (previous.start, previous.end) == (date(2025, 11, 1), date(2025, 11, 30))


def test_monthly_end_is_the_last_day_of_a_short_month():
    start, end, _ = resolve_period('monthly', utc('2026-03-15T09:00:00'), 'UTC')

    assert (start, end) == (date(2026, 2, 1), date(2026, 2, 28))


def test_monthly_end_follows_the_leap_year():
    start, end, _ = resolve_period('monthly', utc('2028-03-15T09:00:00'), 'UTC')

    assert (start, end) == (date(2028, 2, 1), date(2028, 2, 29))


# --- timezone -------------------------------------------------------------
# The mistake these guard against is taking the offset as fixed rather than
# resolving it for the instant — which the codebase already contains once:
# `scheduler.timezone = pytz.timezone('EST')` in src/extensions.py is a
# permanent -5 that never shifts.
#
# Each case only catches a fixed offset in ONE direction, and both are needed:
# a fixed -5 is genuinely correct for the January instant (EST) and wrong for
# the July one (EDT), so the July case catches -5 and the January case
# catches -4. Verified by running both sabotages.

def test_weekly_uses_the_offset_in_force_at_that_instant_not_a_fixed_one():
    # 04:30Z on 2026-07-06 is 00:30 EDT (-4) on Monday the 6th, so the closed
    # week is 6/29 - 7/5. A fixed -5 makes it Sunday the 5th and yields
    # 6/22 - 6/28 instead.
    start, end, _ = resolve_period(
        'weekly', utc('2026-07-06T04:30:00'), 'America/New_York')

    assert (start, end) == (date(2026, 6, 29), date(2026, 7, 5))


def test_monthly_uses_the_offset_in_force_at_that_instant_not_a_fixed_one():
    # 04:30Z on 2026-01-01 is 23:30 EST (-5) on 2025-12-31, so the closed month
    # is November 2025. A fixed -4 makes it January 1st and yields December.
    start, end, _ = resolve_period(
        'monthly', utc('2026-01-01T04:30:00'), 'America/New_York')

    assert (start, end) == (date(2025, 11, 1), date(2025, 11, 30))


def test_a_user_with_no_timezone_is_resolved_in_utc():
    # 00:30Z Monday is still Sunday 20:30 in New York, so the two answers
    # differ and this asserts the fallback is UTC rather than a local guess.
    utc_answer = resolve_period('weekly', utc('2026-07-06T00:30:00'), None)
    ny_answer = resolve_period(
        'weekly', utc('2026-07-06T00:30:00'), 'America/New_York')

    assert (utc_answer.start, utc_answer.end) == (date(2026, 6, 29), date(2026, 7, 5))
    assert (ny_answer.start, ny_answer.end) == (date(2026, 6, 22), date(2026, 6, 28))


def test_an_unusable_timezone_falls_back_to_utc_and_says_so(caplog):
    # A typo in one user's column must not take the whole cron run down, but it
    # must not be silent either: a silently wrong window is a wrong report.
    with caplog.at_level('WARNING'):
        start, end, _ = resolve_period(
            'weekly', utc('2026-07-06T00:30:00'), 'Mars/Olympus_Mons')

    assert (start, end) == (date(2026, 6, 29), date(2026, 7, 5))
    assert 'Mars/Olympus_Mons' in caplog.text


def test_a_naive_as_of_is_read_as_utc():
    naive = resolve_period(
        'weekly', datetime(2026, 7, 6, 0, 30), 'America/New_York')
    aware = resolve_period(
        'weekly', utc('2026-07-06T00:30:00'), 'America/New_York')

    assert naive == aware


def test_a_bare_date_as_of_is_refused():
    # A date has no instant, so it cannot be converted into a timezone. Taking
    # one silently would resolve the period in the wrong day half the time.
    with pytest.raises(TypeError):
        resolve_period('weekly', date(2026, 7, 6), 'UTC')


def test_an_unknown_cadence_is_refused():
    with pytest.raises(ValueError):
        resolve_period('fortnightly', utc('2026-07-06T12:00:00'), 'UTC')


# --- the query boundary ---------------------------------------------------

def test_the_query_bounds_span_midnight_to_the_end_of_the_last_day():
    # Expense.date is a DateTime column (src/models/transaction.py:15), so a
    # bare `end` date compares against MIDNIGHT on the last day and drops
    # everything spent during it. Every analytics filter is `>= start` and
    # `<= end` (get_top_categories, service.py:447-449), and the one existing
    # caller widens the end itself (api/v1/analytics.py:298). These are the
    # bounds to pass; `start` and `end` are for display.
    period = resolve_period('weekly', utc('2026-09-08T12:00:00'), 'UTC')

    assert period.start_dt == datetime(2026, 8, 31, 0, 0, 0)
    assert period.end_dt == datetime(2026, 9, 6, 23, 59, 59, 999999)


def test_a_transaction_late_on_the_last_day_falls_inside_the_bounds():
    period = resolve_period('weekly', utc('2026-09-08T12:00:00'), 'UTC')
    late = datetime.combine(period.end, time(23, 59, 59))

    assert period.start_dt <= late <= period.end_dt


def test_midnight_on_the_day_after_the_period_falls_outside_the_bounds():
    # The off-by-one in the other direction: a bound of `end + 1 day` would
    # pull the next period's first instant into this report.
    period = resolve_period('weekly', utc('2026-09-08T12:00:00'), 'UTC')
    next_period_starts = datetime.combine(period.end + timedelta(days=1), time.min)

    assert not period.start_dt <= next_period_starts <= period.end_dt


def test_the_bounds_of_consecutive_periods_do_not_overlap_or_gap():
    # Two adjacent weekly reports must partition time: no transaction counted
    # twice, none missed. Asserted on the bounds, which is what queries use.
    this_week = resolve_period('weekly', utc('2026-09-08T12:00:00'), 'UTC')
    last_week = resolve_period(
        'weekly', utc('2026-09-08T12:00:00'), 'UTC', periods_back=1)

    assert last_week.end_dt < this_week.start_dt
    assert (this_week.start_dt - last_week.end_dt) == timedelta(microseconds=1)


# --- the label ------------------------------------------------------------

def test_weekly_label_names_both_ends_and_the_year_once():
    _, _, label = resolve_period('weekly', utc('2026-09-08T12:00:00'), 'UTC')

    assert label == 'Week of Aug 31 – Sep 6, 2026'


def test_weekly_label_names_both_years_when_the_week_spans_two():
    _, _, label = resolve_period('weekly', utc('2026-01-05T12:00:00'), 'UTC')

    assert label == 'Week of Dec 29, 2025 – Jan 4, 2026'


def test_monthly_label_is_the_month_and_year():
    _, _, label = resolve_period('monthly', utc('2026-07-06T12:00:00'), 'UTC')

    assert label == 'June 2026'


def test_the_period_carries_exactly_the_three_keys_the_payload_declares():
    period = resolve_period('monthly', utc('2026-07-06T12:00:00'), 'UTC')

    assert period._asdict() == {
        'start': date(2026, 6, 1),
        'end': date(2026, 6, 30),
        'label': 'June 2026',
    }
