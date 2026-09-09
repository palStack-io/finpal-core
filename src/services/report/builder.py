"""What a periodic report says, as a plain dict.

No template, no HTML, no email. `render.py` is fed **this function's real
output** rather than a hand-written fixture, which is the entire reason the two
are separate files: D-107 was a capture fixture that sent three keys the API
never sends, so a page rendered `$NaN` eight times while both gates called it
clean — NaN text has a contrast ratio and a NaN does not overflow.

Everything here is a figure with a source. The reference report's editorial
sections ("The Big One", "Good Moves", the prose alerts) have no source in
finPal and were dropped by owner decision rather than placeholdered, because
this project has already shipped ~10 sites of invented numbers presented as
real data once.
"""
from datetime import datetime, time
from decimal import Decimal

from src.models.account import Account
from src.models.transaction import Expense
from src.models.user import User
from src.services.report.period import MONTHLY, WEEKLY, resolve_period

#: `calculate_asset_debt_trends` treats these as debt and takes `abs()` of the
#: balance, because a card is conventionally stored NEGATIVE here — the demo
#: seeds write `{'type': 'credit', 'balance': -450.00}`. The tile and the
#: table follow that same predicate so the report cannot disagree with the
#: net-worth figure printed beside it.
DEBT_TYPES = ('credit',)

SPEND_CATEGORY_LIMIT = 8
TREND_MONTHS = 6


def _members(scope_ids):
    return User.query.filter(User.id.in_(scope_ids)).all()


def _period_figures(user_id, scope_ids, period):
    """Spend by category, the spend total and income, for one window.

    Separate so the monthly report can compute the same figures for the
    previous period without re-entering `build_report` — a recursive call
    would either compute deltas of deltas or need a flag to stop itself.

    *** THE WINDOW IS `period.start_dt`/`end_dt`, NEVER `start`/`end`. ***
    `Expense.date` is a DateTime column, so a bare end date compares against
    midnight and drops the report's whole last day.
    """
    from src.services.analytics.service import AnalyticsService
    from src.utils.household import scope_query

    # *** ONE CODE FOR THE FIGURES AND THE LABEL, RESOLVED ONCE. ***
    # `build_report` labels this card with `default_currency_for(user_id)`; passing
    # anything else to the analytics call would let the number and the symbol be
    # chosen by two rules again, which is D-156 in one sentence.
    from src.utils.currency_converter import RateTable
    from src.utils.household import default_currency_for
    display_code = default_currency_for(user_id)

    rows = AnalyticsService().get_top_categories(
        user_id, limit=SPEND_CATEGORY_LIMIT, start=period.start_dt,
        end=period.end_dt, transaction_type='expense', scope_ids=scope_ids,
        display_code=display_code)

    total = sum((Decimal(str(row['amount'])) for row in rows), Decimal('0'))

    spend_rows = [{
        'name': row['name'],
        'amount': Decimal(str(row['amount'])),
        # For the bar width only. A share of nothing is nothing, not a
        # ZeroDivisionError in the middle of a cron run.
        'pct': (round(float(row['amount']) / float(total) * 100, 1)
                if total else 0.0),
    } for row in rows]

    # D-156. `get_top_categories` above already restates its rows in that same
    # currency; summing income raw here would put a converted spend total beside an
    # unconverted income total in the same card — the defect this report is what
    # finally exposed, reintroduced two lines from its own fix.
    rates = RateTable()
    income = sum(
        (rates.amount_of(expense, display_code)
         for expense in scope_query(scope_ids).filter(
            Expense.transaction_type == 'income',
            Expense.date >= period.start_dt,
            Expense.date <= period.end_dt).all()),
        Decimal('0'))

    return spend_rows, total, income


def _delta(current, previous):
    """`(delta, direction)`, or `(None, None)` when there is nothing to compare.

    Factual only — 'up' means the number rose, not that it is bad news. Whether
    more spending is worse is exactly the editorial judgement this report does
    not make.
    """
    if previous is None:
        return None, None
    change = current - previous
    if change > 0:
        return change, 'up'
    if change < 0:
        return change, 'down'
    return change, 'flat'


def _tile(label, value, previous=None):
    delta, direction = _delta(value, previous)
    return {'label': label, 'value': value, 'delta': delta,
            'delta_direction': direction}


def build_report(user_id, period, cadence):
    """The report for `user_id` over `period`.

    Takes a `Period` rather than the spec's `(start, end)` pair on purpose: a
    caller holding two loose dates is a caller that can pass the display end to
    a query and silently lose a day, and the label would have to be rebuilt
    from nothing. `period._asdict()` is the payload's `period` block verbatim.

    `cadence` decides the two things that are monthly-only by design: the
    net-worth trend, and the vs-previous deltas.
    """
    from src.utils.helpers import calculate_asset_debt_trends
    from src.utils.household import (default_currency_for, display_name,
                                     read_scope)

    if cadence not in (WEEKLY, MONTHLY):
        raise ValueError(f'Unknown report cadence: {cadence!r}')

    scope_ids = read_scope(user_id)
    user = User.query.filter_by(id=user_id).first()
    if user is None:
        raise ValueError(f'No such user: {user_id!r}')

    spend_rows, spend_total, income = _period_figures(user_id, scope_ids, period)

    previous_spend = previous_income = None
    if cadence == MONTHLY:
        # The previous window comes from the resolver rather than from date
        # arithmetic here, so there is one definition of "a month earlier" and
        # `as_of - timedelta(days=30)` cannot creep in. Midnight on the first
        # day of this period, read in UTC, is a moment inside it.
        previous = resolve_period(
            cadence, datetime.combine(period.start, time.min), 'UTC')
        _, previous_spend, previous_income = _period_figures(
            user_id, scope_ids, previous)

    accounts = Account.query.filter(Account.user_id.in_(scope_ids)).all()
    credit = [a for a in accounts if a.type in DEBT_TYPES]
    cash = [a for a in accounts if a.type not in DEBT_TYPES]

    card_debt = sum((abs(a.balance or Decimal('0')) for a in credit),
                    Decimal('0'))

    trends = calculate_asset_debt_trends(user, user_ids=scope_ids)
    net_worth = (Decimal(str(trends.get('total_assets') or 0))
                 - Decimal(str(trends.get('total_debts') or 0)))

    iou = _iou_block(user_id, user, scope_ids)

    trend = None
    if cadence == MONTHLY:
        from src.services.analytics.service import AnalyticsService
        # `netWorth`, not `net_worth` — the analytics helper answers camelCase
        # and the payload is snake_case. An empty list is a valid answer and
        # renders as an empty state; it is not padded into a flat line.
        trend = [{'month': point['month'],
                  'net_worth': Decimal(str(point['netWorth']))}
                 for point in AnalyticsService().get_networth_trend(
                     user_id, months=TREND_MONTHS, scope_ids=scope_ids)]

    return {
        'cadence': cadence,
        'period': period._asdict(),
        'household': {
            # `display_name`, not `.name`: `User.name` is nullable, and because this
            # block lists EVERY member one nameless row crashed the report for the
            # whole household. D-154.
            'names': [display_name(member.id, member.name)
                      for member in _members(scope_ids)],
            'member_ids': list(scope_ids),
        },
        'currency': {
            'code': default_currency_for(user_id),
            # None rather than a guess: `format_money` falls back to the
            # clients' own default and logs it, which is one decision in one
            # place instead of two.
            'locale': user.number_locale,
        },
        'tiles': [
            _tile('Total spend', spend_total, previous_spend),
            _tile('Income', income, previous_income),
            # As-of figures, so there is no previous value to compare with:
            # nothing stores a historical account balance. The monthly trend
            # is where net worth over time is shown, honestly or not at all.
            _tile('Net worth', net_worth),
            _tile('Credit card debt', card_debt),
        ],
        'spend': {'rows': spend_rows, 'total': spend_total},
        'balances': {
            'credit': [{'name': a.name, 'balance': a.balance} for a in credit],
            'cash': [{'name': a.name, 'balance': a.balance} for a in cash],
        },
        'iou': iou,
        'trend': trend,
        # *** NOT "every figure is zero" — "there is nothing to report". ***
        # Four `$0.00` tiles read as measured data to the person receiving
        # them, which is D-108's shape: range-scoped totals once told a user
        # with $9,000 of income to add some. `delivery.py` sends nothing when
        # this is True. An account whose balance is zero counts as nothing to
        # report, because it is.
        'is_empty': not (spend_rows or income or iou['rows']
                         or any(a.balance for a in accounts)),
    }


def _iou_block(user_id, user, scope_ids):
    """Who owes whom, as of now, with repayments applied (D-152).

    `get_iou_data` rather than the dashboard payload: the figure used to be
    reachable only by building twenty other fields, and until D-152 it ignored
    the `settlements` table entirely — so a debt that had been paid in full
    still read as outstanding. An email saying that is worse than a dashboard
    card nobody renders, which is why it was fixed before being exposed.
    """
    from src.services.analytics.service import AnalyticsService
    from src.utils.household import display_name

    data = AnalyticsService().get_iou_data(user_id, scope_ids=scope_ids)
    me = display_name(user.id, user.name)
    rows = []
    # The dict key is the counterparty's id, which is what makes a fallback
    # possible at all — `entry['name']` alone cannot distinguish "no name" from
    # "no such user". D-154; normalised here rather than in analytics, whose
    # payload the dashboard already consumes.
    for other_id, entry in data.owes_me.items():
        if entry['amount']:
            rows.append({'who': display_name(other_id, entry['name']),
                         'owes_whom': me, 'amount': entry['amount']})
    for other_id, entry in data.i_owe.items():
        if entry['amount']:
            rows.append({'who': me,
                         'owes_whom': display_name(other_id, entry['name']),
                         'amount': entry['amount']})
    return {'rows': rows, 'net': data.net_balance}
