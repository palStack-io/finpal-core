"""D-156 — every figure is restated in the currency whose symbol labels it.

*** THE INVARIANT IS NOT "THE NUMBER IS 136.36". IT IS THAT ALL THE NUMBERS ON ONE
CARD OBEY THE SAME RULE. ***

Before this, `calculate_asset_debt_trends` converted account balances into the
reader's currency while every transaction figure was summed straight off
`Expense.amount`. Both halves looked defensible on their own; the defect was only
visible when they were printed side by side under one symbol. So the sharpest test
here is the ratio one: the euro reader's net worth and the euro reader's spend must
stand in the same relation to the dollar reader's as each other. A test that only
pinned `136.36` would pass a future change that converted spend and stopped
converting net worth.

*** AND NONE OF IT MEANS ANYTHING WITHOUT SEEDED CURRENCIES. *** See D-166 and the
`db` fixture: `drop_all()` used to leave the table empty after the first test, and
both converters return their input unchanged when there is no base currency — so
this whole file would have passed against the unfixed code.
"""
from decimal import Decimal
from datetime import datetime

import pytest

from src.models.currency import Currency
from src.services.analytics.service import AnalyticsService
from tests.factories import (UserFactory, AccountFactory, CategoryFactory,
                             ExpenseFactory)

# The 1st at midday, NOT a fixed day-of-month: `_get_category_spending` defaults its
# window to "this calendar month up to now", so a date later in the month than today
# is silently outside it and the breakdown comes back empty — which is a fixture bug
# that reads exactly like a conversion bug.
WHEN = datetime(datetime.now().year, datetime.now().month, 1, 12, 0)


@pytest.fixture
def household(db):
    """Two members of one household, same money, different preferred currency."""
    made = {}
    for name, code in (('Dollar', 'USD'), ('Euro', 'EUR')):
        user = UserFactory(name=name, default_currency_code=code)
        account = AccountFactory(user_id=user.id, name=f'{name} Current',
                                 type='checking', balance=Decimal('2450.00'),
                                 currency_code='USD')
        category = CategoryFactory(name=f'Groceries {name}', user_id=user.id)
        ExpenseFactory(user_id=user.id, account_id=account.id,
                       amount=Decimal('75.00'), date=WHEN, paid_by=user.id,
                       category_id=category.id, currency_code='USD',
                       transaction_type='expense')
        ExpenseFactory(user_id=user.id, account_id=account.id,
                       amount=Decimal('500.00'), date=WHEN, paid_by=user.id,
                       category_id=category.id, currency_code='USD',
                       transaction_type='income')
        made[code] = user
    db.session.commit()
    return made


def test_the_currencies_are_actually_seeded(db):
    """The guard for every other test in this file. D-166.

    `convert_currency` and `RateTable` both return their input unchanged when no
    base currency exists — deliberately, so a misconfigured instance does not turn
    real figures into zeroes. That safety valve means an empty `currencies` table
    produces a suite that passes by doing nothing.
    """
    assert Currency.query.count() > 0, 'no currencies: every conversion below is the identity'
    base = Currency.query.filter_by(is_base=True).one()
    eur = Currency.query.filter_by(code='EUR').one()
    assert base.code == 'USD'
    assert eur.rate_to_base != base.rate_to_base, (
        'EUR and the base currency have the same rate, so converting proves nothing')


def test_spend_is_converted_into_the_readers_currency(household):
    """150.00 USD of household spend, read by a euro member, at rate 1.1."""
    usd = AnalyticsService().get_dashboard_data(household['USD'].id)
    eur = AnalyticsService().get_dashboard_data(household['EUR'].id)

    assert round(Decimal(str(usd['total_expenses_only'])), 2) == Decimal('150.00')
    assert round(Decimal(str(eur['total_expenses_only'])), 2) == Decimal('136.36')


def test_income_is_converted_too(household):
    """Income and spend feed `net_cash_flow` and the savings rate.

    Converting one and not the other would leave the derived figures wrong in a way
    that no single card displays directly — which is how this class of defect
    survives.
    """
    usd = AnalyticsService().get_dashboard_data(household['USD'].id)
    eur = AnalyticsService().get_dashboard_data(household['EUR'].id)

    assert round(Decimal(str(usd['total_income'])), 2) == Decimal('1000.00')
    assert round(Decimal(str(eur['total_income'])), 2) == Decimal('909.09')


def test_net_worth_and_spend_obey_the_same_rule(household):
    """*** THIS IS THE ACTUAL DEFECT, AND THE ONLY TEST THAT STATES IT. ***

    D-156 was not "spend is wrong". Both figures were individually explicable; what
    was wrong is that one was converted and the other was not, under one symbol. So
    this asserts the RELATION rather than either number: whatever the two readers
    see, the ratio between them must be the same for net worth as for spend.

    It fails if a future change converts one and not the other, in either direction
    — including if somebody "fixes" this by removing the account conversion.
    """
    usd = AnalyticsService().get_dashboard_data(household['USD'].id)
    eur = AnalyticsService().get_dashboard_data(household['EUR'].id)

    spend_ratio = Decimal(str(eur['total_expenses_only'])) / Decimal(str(usd['total_expenses_only']))
    worth_ratio = Decimal(str(eur['net_worth'])) / Decimal(str(usd['net_worth']))

    assert usd['net_worth'] != 0, 'no net worth to compare — the fixture built nothing'
    assert abs(spend_ratio - worth_ratio) < Decimal('0.0001'), (
        f'spend converted at {spend_ratio} but net worth at {worth_ratio} — '
        'the figure and the symbol beside it are being chosen by two different rules')


def test_the_category_breakdown_sums_to_the_converted_total(household):
    """The pie's slices must add up to the number printed above it."""
    eur = AnalyticsService().get_dashboard_data(household['EUR'].id)
    slices = sum((Decimal(str(row['amount'])) for row in eur['top_categories']),
                 Decimal('0'))
    assert round(slices, 2) == Decimal('136.36')


def test_the_transaction_rows_agree_with_the_totals(household, client, auth_headers):
    """The recent-transactions list is rendered under the same symbol as the totals.

    Asserted through the SERIALIZED payload, not the service dict: `_serialize_expense`
    read `exp.amount` straight off the ORM row, so the list could disagree with the
    header while every service-level test passed.
    """
    resp = client.get('/api/v1/analytics/dashboard',
                      headers=auth_headers(household['EUR']))
    assert resp.status_code == 200
    body = resp.get_json()
    payload = body.get('data', body)

    rows = [r for r in payload['expenses'] if r['transaction_type'] == 'expense']
    assert rows, 'no expense rows in the payload — this test proves nothing'
    for row in rows:
        assert round(Decimal(str(row['amount'])), 2) == Decimal('68.18'), (
            'a raw stored amount in the list under the reader currency symbol')


def test_a_single_currency_instance_is_completely_unaffected(household):
    """The bound that let this survive: nothing changes when everyone shares a currency.

    Recorded as a test rather than a comment because the owner's decision (B1) was
    taken on exactly this basis — convert, accepting that multi-currency dashboards
    change — and the cost of being wrong about "nobody else is affected" is every
    number on every instance.
    """
    usd = AnalyticsService().get_dashboard_data(household['USD'].id)
    assert round(Decimal(str(usd['total_expenses_only'])), 2) == Decimal('150.00')
    assert round(Decimal(str(usd['total_income'])), 2) == Decimal('1000.00')
    assert round(Decimal(str(usd['net_worth'])), 2) == Decimal('4900.00')


def test_a_null_currency_code_means_the_base_currency_on_every_row_type(db):
    """*** ONE NULL, ONE MEANING — AND THE FIRST VERSION OF THE D-156 FIX BROKE THIS. ***

    `currency_code` is nullable on both `accounts` and `expenses`, and the write paths
    always fill it, so the only rows holding NULL predate the column. They are
    denominated in whatever the instance used at the time, which is the base currency.

    Converting transactions (owner decision B1) while leaving
    `calculate_asset_debt_trends` reading NULL as "already in the reader's currency"
    put two rules for one NULL on the same dashboard card. Measured before it was
    fixed: a NULL-currency account of **1100 read as 1100** for a euro member while a
    NULL-currency expense of **110 read as 100**. That is D-156's own shape,
    reintroduced by D-156's own fix.

    The numbers are chosen so the two must agree: 1100 and 110 are both exactly 10x
    and 1x of EUR's seeded rate, so a correct reading gives 1000.00 and 100.00 and a
    wrong one gives the input back unchanged.
    """
    user = UserFactory(name='Legacy', default_currency_code='EUR')
    account = AccountFactory(user_id=user.id, name='Legacy Current', type='checking',
                             balance=Decimal('1100.00'), currency_code=None)
    category = CategoryFactory(name='Legacy', user_id=user.id)
    ExpenseFactory(user_id=user.id, account_id=account.id, amount=Decimal('110.00'),
                   date=WHEN, paid_by=user.id, category_id=category.id,
                   currency_code=None, transaction_type='expense')
    db.session.commit()

    data = AnalyticsService().get_dashboard_data(user.id)

    assert round(Decimal(str(data['total_expenses_only'])), 2) == Decimal('100.00'), (
        'a NULL-currency expense was not read as base currency')
    assert round(Decimal(str(data['net_worth'])), 2) == Decimal('1000.00'), (
        'a NULL-currency account balance was not read as base currency — one NULL, two meanings')
