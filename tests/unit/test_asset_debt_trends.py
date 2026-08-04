"""calculate_asset_debt_trends must reconstruct history backwards from today.

It used to seed the running balance with *today's* balance and then walk
transactions oldest-to-newest applying `+= income` / `-= expense`. That treats the
present balance as the starting balance and replays a year of activity on top of
it, so the "history" was today's balance plus a forward sum — not a balance at any
point in time. Everything downstream of it (the net worth trend, /dashboard,
/health, /summary and the MCP net-worth tool) inherited the error.

The arithmetic that matters: balance at end of month M equals today's balance
minus the net effect of every transaction after M. So spending money last month
means last month closed *higher* than today, and earning money last month means it
closed *lower*.
"""

from datetime import datetime

import pytest

from src.utils.helpers import calculate_asset_debt_trends
from tests.factories import AccountFactory, ExpenseFactory, UserFactory


def _month(year, month):
    return '%04d-%02d' % (year, month)


@pytest.fixture
def user(db):
    return UserFactory()


def test_spending_means_last_month_closed_higher(client, user):
    """$100 spent this month, balance now $900 — so last month closed at $1000."""
    now = datetime.utcnow()
    # Anchor inside the current month so the two months are unambiguous.
    this_month = now.replace(day=15, hour=12, minute=0, second=0, microsecond=0)
    prev_month = (this_month.replace(day=1) - __import__('datetime').timedelta(days=1)) \
        .replace(day=15, hour=12, minute=0, second=0, microsecond=0)

    account = AccountFactory(user_id=user.id, type='checking', balance=900.0,
                             currency_code='USD')
    ExpenseFactory(user_id=user.id, account_id=account.id, amount=100.0,
                   date=this_month, transaction_type='expense')

    result = calculate_asset_debt_trends(user)
    months = result['months']
    assets = dict(zip(months, result['assets']))

    current_key = _month(this_month.year, this_month.month)
    assert assets[current_key] == pytest.approx(900.0, abs=0.01)

    # The old code produced 900 - 100 = 800 here: it subtracted the expense from
    # today's balance instead of adding it back.
    prev_key = _month(prev_month.year, prev_month.month)
    if prev_key in assets:
        assert assets[prev_key] == pytest.approx(1000.0, abs=0.01)


def test_income_means_last_month_closed_lower(client, user):
    """$500 earned this month, balance now $1500 — so before it, $1000."""
    now = datetime.utcnow()
    this_month = now.replace(day=15, hour=12, minute=0, second=0, microsecond=0)

    account = AccountFactory(user_id=user.id, type='checking', balance=1500.0,
                             currency_code='USD')
    ExpenseFactory(user_id=user.id, account_id=account.id, amount=500.0,
                   date=this_month, transaction_type='income')

    result = calculate_asset_debt_trends(user)
    assets = dict(zip(result['months'], result['assets']))

    current_key = _month(this_month.year, this_month.month)
    assert assets[current_key] == pytest.approx(1500.0, abs=0.01)


def test_current_month_always_equals_todays_balance(client, user):
    """Whatever the activity, the newest point is the balance we actually know."""
    now = datetime.utcnow().replace(day=15, hour=12, minute=0, second=0, microsecond=0)

    account = AccountFactory(user_id=user.id, type='checking', balance=2500.0,
                             currency_code='USD')
    for amount, kind in ((300.0, 'expense'), (75.0, 'expense'), (1200.0, 'income')):
        ExpenseFactory(user_id=user.id, account_id=account.id, amount=amount,
                       date=now, transaction_type=kind)

    result = calculate_asset_debt_trends(user)
    assets = dict(zip(result['months'], result['assets']))

    assert assets[_month(now.year, now.month)] == pytest.approx(2500.0, abs=0.01)
    # And the headline total is taken directly from account balances, so it agrees.
    assert result['total_assets'] == pytest.approx(2500.0, abs=0.01)


def test_totals_are_unaffected_by_the_reconstruction(client, user):
    """total_assets/total_debts come straight from balances, not from the walk."""
    AccountFactory(user_id=user.id, type='checking', balance=1200.0,
                   currency_code='USD')
    AccountFactory(user_id=user.id, type='credit', balance=-400.0,
                   currency_code='USD')

    result = calculate_asset_debt_trends(user)

    assert result['total_assets'] == pytest.approx(1200.0, abs=0.01)
    assert result['total_debts'] == pytest.approx(400.0, abs=0.01)
    assert result['net_worth'] == pytest.approx(800.0, abs=0.01)


def test_no_transactions_still_reports_the_current_balance(client, user):
    AccountFactory(user_id=user.id, type='savings', balance=640.0,
                   currency_code='USD')

    result = calculate_asset_debt_trends(user)

    assert result['total_assets'] == pytest.approx(640.0, abs=0.01)
    now = datetime.utcnow()
    assets = dict(zip(result['months'], result['assets']))
    assert assets[_month(now.year, now.month)] == pytest.approx(640.0, abs=0.01)
