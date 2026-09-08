"""Which dates a report covers.

Pure: reads no clock and no database, so the caller supplies `as_of`.

The cron fires once, at one fixed hour, for everybody — but each user's week
and month boundaries are their own, so the window is resolved in the user's
timezone from that single instant (design spec trap 10).
"""
import logging
from datetime import date, datetime, time, timedelta, timezone
from typing import NamedTuple, Optional
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

logger = logging.getLogger(__name__)

WEEKLY = 'weekly'
MONTHLY = 'monthly'

# strftime('%b'/'%B') follows LC_TIME, which nothing in this app sets and any
# dependency could. The label is an asserted contract, so it is spelled out.
_MONTH_ABBR = ('', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
               'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec')
_MONTH_NAME = ('', 'January', 'February', 'March', 'April', 'May', 'June',
               'July', 'August', 'September', 'October', 'November', 'December')


class Period(NamedTuple):
    """One reporting window. `_asdict()` is the payload's `period` block."""

    start: date
    end: date
    label: str

    @property
    def start_dt(self) -> datetime:
        """Midnight on the first day — the bound to filter with, not `start`."""
        return datetime.combine(self.start, time.min)

    @property
    def end_dt(self) -> datetime:
        """The last instant of the last day, which is NOT `end`.

        `Expense.date` is a DateTime column (src/models/transaction.py:15) and
        every analytics filter is inclusive on both sides — `Expense.date >=
        start` and `<= end` in `get_top_categories`. So a bare `end` date
        compares against MIDNIGHT and silently drops everything spent on the
        report's last day. `api/v1/analytics.py:298` already widens its own end
        to 23:59:59 for exactly this reason; this does the same to microsecond
        resolution, which is what Postgres stores.

        `start` and `end` are for display. Queries use these two.
        """
        return datetime.combine(self.end, time.max)


def _local_date(as_of: datetime, tz: Optional[str]) -> date:
    if not isinstance(as_of, datetime):
        # datetime is a subclass of date, so a bare date reaches here only by
        # being a bare date — and it names no instant to convert.
        raise TypeError(
            f'as_of must be a datetime, got {type(as_of).__name__}')

    zone = timezone.utc
    if tz:
        try:
            zone = ZoneInfo(tz)
        except (ZoneInfoNotFoundError, ValueError):
            logger.warning(
                'Unusable timezone %r; resolving the report period in UTC', tz)

    if as_of.tzinfo is None:
        as_of = as_of.replace(tzinfo=timezone.utc)

    return as_of.astimezone(zone).date()


def _weekly(today: date, periods_back: int) -> tuple:
    # isoweekday() is Mon=1..Sun=7, so subtracting it lands on the Sunday that
    # ended the last COMPLETE week — today itself is never included, because
    # today is not over.
    end = today - timedelta(days=today.isoweekday() + 7 * periods_back)
    return end - timedelta(days=6), end


def _monthly(today: date, periods_back: int) -> tuple:
    months = today.year * 12 + (today.month - 1) - 1 - periods_back
    year, month = divmod(months, 12)
    start = date(year, month + 1, 1)
    next_start = (date(year + 1, 1, 1) if month == 11
                  else date(year, month + 2, 1))
    return start, next_start - timedelta(days=1)


def _label(cadence: str, start: date, end: date) -> str:
    if cadence == MONTHLY:
        return f'{_MONTH_NAME[start.month]} {start.year}'
    if start.year != end.year:
        return (f'Week of {_MONTH_ABBR[start.month]} {start.day}, {start.year}'
                f' – {_MONTH_ABBR[end.month]} {end.day}, {end.year}')
    return (f'Week of {_MONTH_ABBR[start.month]} {start.day}'
            f' – {_MONTH_ABBR[end.month]} {end.day}, {end.year}')


def resolve_period(cadence: str, as_of: datetime, tz: Optional[str],
                   periods_back: int = 0) -> Period:
    """The window a report covers, as inclusive local dates plus a label.

    cadence      'weekly' — the last complete Monday-Sunday week ending before
                 `as_of`'s local date. 'monthly' — the calendar month before
                 the month containing it.
    as_of        an instant; aware in any zone, or naive meaning UTC. A bare
                 `date` is refused.
    tz           the user's `timezone` column. Missing or unusable means UTC.
    periods_back 0 is the period being reported on; 1 is the one before it,
                 which is what the monthly vs-previous deltas compare against.
    """
    if cadence not in (WEEKLY, MONTHLY):
        raise ValueError(f'Unknown report cadence: {cadence!r}')
    if periods_back < 0:
        raise ValueError(f'periods_back must not be negative: {periods_back}')

    today = _local_date(as_of, tz)
    start, end = (_weekly(today, periods_back) if cadence == WEEKLY
                  else _monthly(today, periods_back))
    return Period(start=start, end=end, label=_label(cadence, start, end))
