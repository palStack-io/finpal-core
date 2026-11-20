"""Net worth is ONE figure: the Dashboard and the Accounts page must agree.

The UI audit of 2026-11-20 (finPal docs/ux-audit-2026-11-20, P1-5) measured the demo
persona Alex at -$3,521.80 on the Dashboard and -$7,650.00 on Accounts,
both labelled "net worth" (premium; core has the same code paths). The paths:

  * Dashboard (and the monthly report): `calculate_asset_debt_trends`, which counted
    unlinked investment portfolios but dropped a loan whose balance was stored positive;
  * Accounts: a client-side sum of `/accounts` balances, with no investments;
  * `AccountService.calculate_financial_summary` (no caller today): no investments.

They now all come from `src.services.account.net_worth.net_worth_summary`. This fixture
has each trap at once: an unlinked portfolio, a loan stored positive, and an account in
a second currency.
"""
from decimal import Decimal

import pytest

from src.extensions import db as _db
from src.models.investment import Investment, Portfolio
from tests.factories import AccountFactory, UserFactory


@pytest.fixture
def holder(db):
    user = UserFactory(password_plain='secret', default_currency_code='USD')
    AccountFactory(user_id=user.id, name='Checking', type='checking', balance=Decimal('5000'), currency_code='USD')
    AccountFactory(user_id=user.id, name='Euro savings', type='savings', balance=Decimal('1000'), currency_code='EUR')
    AccountFactory(user_id=user.id, name='Card', type='credit', balance=Decimal('-800'), currency_code='USD')
    # Stored positive: some imports write what is owed as a positive number.
    AccountFactory(user_id=user.id, name='Student loan', type='loan', balance=Decimal('2000'), currency_code='USD')
    portfolio = Portfolio(name='Index fund', user_id=user.id, account_id=None)
    _db.session.add(portfolio)
    _db.session.flush()
    _db.session.add(Investment(portfolio_id=portfolio.id, symbol='VTI', name='VTI', shares=Decimal('10'),
                               purchase_price=Decimal('200'), current_price=Decimal('250')))
    _db.session.commit()
    return user


def _expected(user):
    from src.utils.currency_converter import convert_currency
    euros = float(convert_currency(Decimal('1000'), 'EUR', 'USD'))
    assets = 5000 + euros + 2500  # checking, converted euros, the portfolio
    debts = 800 + 2000            # the card and the loan, whatever its sign
    return round(assets, 2), round(debts, 2), round(assets - debts, 2)


def test_the_shared_function_counts_investments_and_every_loan(holder):
    from src.services.account.net_worth import net_worth_summary
    assets, debts, net = _expected(holder)
    s = net_worth_summary(holder)
    assert round(float(s['total_assets']), 2) == assets
    assert round(float(s['total_debts']), 2) == debts
    assert round(float(s['net_worth']), 2) == net
    assert round(float(s['investment_total']), 2) == 2500.0


def test_dashboard_and_accounts_say_the_same_net_worth(holder, client, auth_headers):
    headers = auth_headers(holder, password='secret')
    dash = client.get('/api/v1/analytics/dashboard', headers=headers).get_json()['data']
    summary = client.get('/api/v1/accounts/summary', headers=headers).get_json()
    assert summary['success'] is True

    _, _, net = _expected(holder)
    assert round(float(dash['net_worth']), 2) == net
    assert round(float(summary['net_worth']), 2) == net
    assert round(float(summary['total_assets']), 2) == round(float(dash['total_assets']), 2)
    assert round(float(summary['total_debts']), 2) == round(float(dash['total_debts']), 2)
    assert round(float(summary['investment_total']), 2) == 2500.0


def test_financial_summary_is_the_same_figure(holder):
    from src.services.account.service import AccountService
    _, _, net = _expected(holder)
    assert round(float(AccountService().calculate_financial_summary(holder.id)[2]), 2) == net


def test_year_income_and_year_spending_cover_the_same_window(db, client, auth_headers):
    """`total_income` summed every row the dashboard loads (from December 1 of LAST year) while
    `total_expenses_only` counted this calendar year only, so `net_cash_flow` and `savings_rate`
    subtracted one window from another. Last December's pay must not count in this year's figures."""
    from datetime import datetime
    from tests.factories import ExpenseFactory
    user = UserFactory(password_plain='secret', default_currency_code='USD')
    now = datetime.utcnow()
    ExpenseFactory(user_id=user.id, amount=1000, transaction_type='income', date=datetime(now.year - 1, 12, 15, 12))
    ExpenseFactory(user_id=user.id, amount=500, transaction_type='expense', date=datetime(now.year - 1, 12, 16, 12))
    ExpenseFactory(user_id=user.id, amount=2000, transaction_type='income', date=datetime(now.year, 1, 15, 12))
    ExpenseFactory(user_id=user.id, amount=800, transaction_type='expense', date=datetime(now.year, 1, 16, 12))
    _db.session.commit()
    dash = client.get('/api/v1/analytics/dashboard', headers=auth_headers(user, password='secret')).get_json()['data']
    assert round(float(dash['total_income']), 2) == 2000.0
    assert round(float(dash['total_expenses_only']), 2) == 800.0
    assert round(float(dash['net_cash_flow']), 2) == 1200.0
