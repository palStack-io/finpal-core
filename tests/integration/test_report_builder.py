"""What the report email actually says (stream A, item A4).

*** EVERY ASSERTION HERE IS ON A VALUE, NOT A KEY. *** The spec says so and the
reason is D-107: a capture fixture once sent three keys the API never sends, the
page rendered `$NaN` eight times, and both gates called it clean because NaN
text has a contrast ratio and a NaN does not overflow. A test that asserts
`'tiles' in report` would have passed then too.

The builder returns a plain dict and touches no template. `render.py` (A5) is
fed THIS function's real output, which is the whole point of the split.
"""
from datetime import date, datetime
from decimal import Decimal

import pytest

from src.extensions import db as _db
from src.models.group import Settlement
from src.services.report.builder import build_report
from src.services.report.period import Period
from tests.factories import (
    AccountFactory, CategoryFactory, ExpenseFactory, UserFactory)

# A fixed window, so nothing here depends on the day it runs — D-153 was a test
# that passed only during the month it was written in.
WEEK = Period(start=date(2026, 8, 31), end=date(2026, 9, 6),
              label='Week of Aug 31 – Sep 6, 2026')
INSIDE = datetime(2026, 9, 2, 12, 0)
LAST_INSTANT = datetime(2026, 9, 6, 23, 47)     # the last day, after midnight
BEFORE = datetime(2026, 8, 30, 12, 0)
AFTER = datetime(2026, 9, 7, 0, 30)

MONTH = Period(start=date(2026, 8, 1), end=date(2026, 8, 31), label='August 2026')
PREV_MONTH_DAY = datetime(2026, 7, 15, 12, 0)
AUGUST_DAY = datetime(2026, 8, 15, 12, 0)


def _spend(user, amount, when=INSIDE, category=None, **kwargs):
    account = kwargs.pop('account', None) or AccountFactory(user_id=user.id)
    return ExpenseFactory(
        user_id=user.id, account_id=account.id, amount=Decimal(str(amount)),
        date=when, paid_by=user.id, transaction_type='expense',
        category_id=category.id if category else None, **kwargs)


def _income(user, amount, when=INSIDE, **kwargs):
    account = kwargs.pop('account', None) or AccountFactory(user_id=user.id)
    return ExpenseFactory(
        user_id=user.id, account_id=account.id, amount=Decimal(str(amount)),
        date=when, paid_by=user.id, transaction_type='income', **kwargs)


def _tile(report, label):
    return next(t for t in report['tiles'] if t['label'] == label)


# --- the period and the household ----------------------------------------

def test_the_period_block_is_the_resolvers_own_output(db):
    user = UserFactory()

    report = build_report(user.id, WEEK, 'weekly')

    assert report['period'] == {
        'start': date(2026, 8, 31),
        'end': date(2026, 9, 6),
        'label': 'Week of Aug 31 – Sep 6, 2026',
    }
    assert report['cadence'] == 'weekly'


def test_the_household_block_names_the_members(db):
    me = UserFactory(name='Harun')
    them = UserFactory(name='Rachel')

    report = build_report(me.id, WEEK, 'weekly')

    assert sorted(report['household']['names']) == ['Harun', 'Rachel']
    assert sorted(report['household']['member_ids']) == sorted([me.id, them.id])


def test_the_currency_block_follows_the_users_preference(db):
    user = UserFactory(default_currency_code='EUR', number_locale='de-DE')

    report = build_report(user.id, WEEK, 'weekly')

    assert report['currency'] == {'code': 'EUR', 'locale': 'de-DE'}


def test_a_user_with_no_locale_preference_reports_none_not_a_guess(db):
    user = UserFactory(number_locale=None)

    report = build_report(user.id, WEEK, 'weekly')

    assert report['currency']['locale'] is None


# --- spend ----------------------------------------------------------------

def test_spend_rows_carry_each_categorys_total_and_share(db):
    user = UserFactory()
    food = CategoryFactory(name='Groceries', user_id=user.id)
    travel = CategoryFactory(name='Travel', user_id=user.id)
    _spend(user, 75, category=food)
    _spend(user, 25, category=travel)

    report = build_report(user.id, WEEK, 'weekly')

    assert report['spend']['total'] == Decimal('100.00')
    assert [(r['name'], r['amount'], r['pct']) for r in report['spend']['rows']] == [
        ('Groceries', Decimal('75.00'), 75.0),
        ('Travel', Decimal('25.00'), 25.0),
    ]


def test_spending_outside_the_window_is_not_counted(db):
    user = UserFactory()
    food = CategoryFactory(name='Groceries', user_id=user.id)
    _spend(user, 40, when=INSIDE, category=food)
    _spend(user, 900, when=BEFORE, category=food)
    _spend(user, 800, when=AFTER, category=food)

    report = build_report(user.id, WEEK, 'weekly')

    assert report['spend']['total'] == Decimal('40.00')


def test_spending_late_on_the_last_day_of_the_window_is_counted(db):
    """*** THE TRAP A1 WAS BUILT TO CLOSE, ASSERTED END TO END. ***

    `Expense.date` is a DateTime column. A builder that passed the period's
    bare `end` date to the analytics query would compare against MIDNIGHT and
    drop this, silently losing the last day of every report — a seventh of a
    weekly one.
    """
    user = UserFactory()
    food = CategoryFactory(name='Groceries', user_id=user.id)
    _spend(user, 60, when=LAST_INSTANT, category=food)

    report = build_report(user.id, WEEK, 'weekly')

    assert report['spend']['total'] == Decimal('60.00')


def test_income_late_on_the_last_day_of_the_window_is_counted(db):
    """The same DateTime trap as spending, on the other query.

    Added because sabotaging the income query's bounds to the bare dates left
    all 21 tests green: every income fixture happened to sit mid-window.
    """
    user = UserFactory()
    _income(user, 900, when=LAST_INSTANT)

    report = build_report(user.id, WEEK, 'weekly')

    assert _tile(report, 'Income')['value'] == Decimal('900.00')


def test_income_outside_the_window_is_not_counted(db):
    user = UserFactory()
    _income(user, 40, when=INSIDE)
    _income(user, 7000, when=AFTER)

    report = build_report(user.id, WEEK, 'weekly')

    assert _tile(report, 'Income')['value'] == Decimal('40.00')


def test_income_is_not_counted_as_spending(db):
    user = UserFactory()
    food = CategoryFactory(name='Groceries', user_id=user.id)
    _spend(user, 30, category=food)
    _income(user, 5000)

    report = build_report(user.id, WEEK, 'weekly')

    assert report['spend']['total'] == Decimal('30.00')


# --- tiles ----------------------------------------------------------------

def test_the_four_tiles_carry_the_figures_they_claim(db):
    user = UserFactory()
    food = CategoryFactory(name='Groceries', user_id=user.id)
    current = AccountFactory(user_id=user.id, type='checking',
                             balance=Decimal('2000.00'))
    AccountFactory(user_id=user.id, type='credit', balance=Decimal('450.00'))
    _spend(user, 120, category=food, account=current)
    _income(user, 3000, account=current)

    report = build_report(user.id, WEEK, 'weekly')

    assert _tile(report, 'Total spend')['value'] == Decimal('120.00')
    assert _tile(report, 'Income')['value'] == Decimal('3000.00')
    assert _tile(report, 'Credit card debt')['value'] == Decimal('450.00')
    # Net worth is as-of, not period-scoped: 2000 of cash less 450 of card.
    assert _tile(report, 'Net worth')['value'] == Decimal('1550.00')


def test_a_weekly_report_carries_no_deltas(db):
    """The spec: the weekly report carries neither the trend nor the deltas."""
    user = UserFactory()
    _spend(user, 10)

    report = build_report(user.id, WEEK, 'weekly')

    assert all(t['delta'] is None for t in report['tiles'])
    assert all(t['delta_direction'] is None for t in report['tiles'])
    assert report['trend'] is None


def test_a_monthly_report_compares_spend_against_the_month_before(db):
    user = UserFactory()
    food = CategoryFactory(name='Groceries', user_id=user.id)
    _spend(user, 200, when=AUGUST_DAY, category=food)
    _spend(user, 150, when=PREV_MONTH_DAY, category=food)

    report = build_report(user.id, MONTH, 'monthly')

    spend = _tile(report, 'Total spend')
    assert spend['value'] == Decimal('200.00')
    assert spend['delta'] == Decimal('50.00')
    assert spend['delta_direction'] == 'up'


def test_a_monthly_delta_reports_a_fall_as_a_fall(db):
    user = UserFactory()
    food = CategoryFactory(name='Groceries', user_id=user.id)
    _spend(user, 60, when=AUGUST_DAY, category=food)
    _spend(user, 100, when=PREV_MONTH_DAY, category=food)

    report = build_report(user.id, MONTH, 'monthly')
    spend = _tile(report, 'Total spend')

    assert spend['delta'] == Decimal('-40.00')
    assert spend['delta_direction'] == 'down'


def test_an_unchanged_figure_is_flat_rather_than_a_direction(db):
    user = UserFactory()
    food = CategoryFactory(name='Groceries', user_id=user.id)
    _spend(user, 50, when=AUGUST_DAY, category=food)
    _spend(user, 50, when=PREV_MONTH_DAY, category=food)

    report = build_report(user.id, MONTH, 'monthly')

    assert _tile(report, 'Total spend')['delta_direction'] == 'flat'


# --- balances -------------------------------------------------------------

def test_credit_accounts_are_separated_from_cash(db):
    user = UserFactory()
    AccountFactory(user_id=user.id, name='Amex', type='credit',
                   balance=Decimal('300.00'))
    AccountFactory(user_id=user.id, name='Current', type='checking',
                   balance=Decimal('1200.00'))
    AccountFactory(user_id=user.id, name='Rainy day', type='savings',
                   balance=Decimal('5000.00'))

    report = build_report(user.id, WEEK, 'weekly')

    assert report['balances']['credit'] == [
        {'name': 'Amex', 'balance': Decimal('300.00')}]
    assert sorted(report['balances']['cash'], key=lambda a: a['name']) == [
        {'name': 'Current', 'balance': Decimal('1200.00')},
        {'name': 'Rainy day', 'balance': Decimal('5000.00')},
    ]


# --- the repayment tracker ------------------------------------------------

def test_the_repayment_tracker_names_the_debtor_and_the_creditor(db):
    me = UserFactory(name='Harun')
    them = UserFactory(name='Rachel')
    account = AccountFactory(user_id=me.id)
    ExpenseFactory(user_id=me.id, account_id=account.id,
                   amount=Decimal('100.00'), date=INSIDE, paid_by=me.id,
                   split_method='equal', split_with=them.id)

    report = build_report(me.id, WEEK, 'weekly')

    assert report['iou']['rows'] == [
        {'who': 'Rachel', 'owes_whom': 'Harun', 'amount': Decimal('50.00')}]
    assert report['iou']['net'] == Decimal('50.00')


def test_the_repayment_tracker_counts_repayments(db):
    """D-152: it must be the settled figure, not the gross one."""
    me = UserFactory(name='Harun')
    them = UserFactory(name='Rachel')
    account = AccountFactory(user_id=me.id)
    ExpenseFactory(user_id=me.id, account_id=account.id,
                   amount=Decimal('100.00'), date=INSIDE, paid_by=me.id,
                   split_method='equal', split_with=them.id)
    _db.session.add(Settlement(payer_id=them.id, receiver_id=me.id,
                               amount=Decimal('50.00'), date=INSIDE))
    _db.session.commit()

    report = build_report(me.id, WEEK, 'weekly')

    assert report['iou']['rows'] == []
    assert report['iou']['net'] == Decimal('0')


# --- the empty case -------------------------------------------------------

def test_a_user_with_no_data_is_empty_rather_than_four_zeroes(db):
    """Trap 8. A brand-new account must not be sent `$0.00` four times.

    That is D-108's shape: range-scoped totals told a user with $9,000 of
    income to "add income transactions". `is_empty` is how `delivery.py` knows
    to send nothing at all.
    """
    user = UserFactory()

    report = build_report(user.id, WEEK, 'weekly')

    assert report['is_empty'] is True


def test_a_quiet_week_for_a_user_who_has_accounts_is_not_empty(db):
    """Nothing spent is a fact about the week; nothing at all is not.

    A user with money in an account has something true to be told, so the
    report is sent and its spend section says zero honestly.
    """
    user = UserFactory()
    AccountFactory(user_id=user.id, type='checking', balance=Decimal('800.00'))

    report = build_report(user.id, WEEK, 'weekly')

    assert report['is_empty'] is False
    assert report['spend']['total'] == Decimal('0')


def test_spending_in_the_window_makes_a_report_non_empty(db):
    user = UserFactory()
    _spend(user, 12)

    assert build_report(user.id, WEEK, 'weekly')['is_empty'] is False


# --- the net-worth trend --------------------------------------------------

def test_the_monthly_trend_carries_net_worth_per_month(db):
    """Values and key spelling, because the source disagrees with the payload.

    `get_networth_trend` answers `netWorth`; the payload declares `net_worth`.
    Sabotaging that mapping to `None` left every other test green, which is
    why this asserts the figures rather than the shape.

    The series runs to the present month rather than stopping at the reported
    one — net worth is as-of, and a 6-month trend that ended in August would be
    a different, staler claim than the one the tile beside it makes.
    """
    user = UserFactory()
    account = AccountFactory(user_id=user.id, type='checking',
                             balance=Decimal('2500.00'))
    food = CategoryFactory(name='Groceries', user_id=user.id)
    for month in (6, 7, 8):
        ExpenseFactory(user_id=user.id, account_id=account.id,
                       amount=Decimal('100.00'), date=datetime(2026, month, 10),
                       paid_by=user.id, category_id=food.id)

    report = build_report(user.id, MONTH, 'monthly')

    assert report['trend'] == [
        {'month': '2026-06', 'net_worth': Decimal('2700.00')},
        {'month': '2026-07', 'net_worth': Decimal('2600.00')},
        {'month': '2026-08', 'net_worth': Decimal('2500.00')},
        {'month': '2026-09', 'net_worth': Decimal('2500.00')},
    ]


def test_a_household_with_no_history_gets_an_empty_trend_not_a_flat_line(db):
    """An empty list is a valid answer and renders as an empty state.

    There used to be a synthetic fallback in `get_networth_trend` that
    manufactured a 12-month series out of current balances, and it was
    inverted; a report that padded this would be reinventing it.
    """
    user = UserFactory()

    assert build_report(user.id, MONTH, 'monthly')['trend'] == []


# --- the D-107 guard ------------------------------------------------------

def test_no_figure_in_the_payload_is_none(db):
    """A None reaching the renderer becomes `$0.00` or the string 'None'.

    `format_money` refuses None deliberately (A2), so this is the builder's
    half of that contract: every numeric slot is filled or absent, never null.
    """
    user = UserFactory()
    food = CategoryFactory(name='Groceries', user_id=user.id)
    AccountFactory(user_id=user.id, type='credit', balance=Decimal('75.00'))
    _spend(user, 30, category=food)
    _income(user, 100)

    report = build_report(user.id, MONTH, 'monthly')

    for tile in report['tiles']:
        assert tile['value'] is not None, tile['label']
    assert report['spend']['total'] is not None
    for row in report['spend']['rows']:
        assert row['amount'] is not None and row['pct'] is not None
    assert report['iou']['net'] is not None
    for point in report['trend']:
        assert point['net_worth'] is not None, point['month']
        assert point['month'] is not None


def test_a_card_stored_the_negative_way_still_reads_as_debt_owed(db):
    """*** THE APP STORES CARD BALANCES NEGATIVE, AND THE SEEDS PROVE IT. ***

    `src/data/demo_users.py:177` writes `{'type': 'credit', 'balance': -450.00}`
    and `helpers.py:285` takes `abs()` of it when totalling debts. So the tile
    must too, or a household with a normally-stored card is told its debt is
    `−$450.00` — or worse, that the card is an asset.
    """
    user = UserFactory()
    AccountFactory(user_id=user.id, name='Visa', type='credit',
                   balance=Decimal('-450.00'))
    AccountFactory(user_id=user.id, name='Current', type='checking',
                   balance=Decimal('1000.00'))

    report = build_report(user.id, WEEK, 'weekly')

    assert _tile(report, 'Credit card debt')['value'] == Decimal('450.00')
    assert _tile(report, 'Net worth')['value'] == Decimal('550.00')
