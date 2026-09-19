"""Both terms of net_cash_flow must cover the same period.

The dashboard query starts on January 1st MINUS 31 DAYS, because the monthly
trend chart wants the extra month. The year-to-date TOTALS must not.

The expense loop had always skipped rows outside `current_year`; the income
loop had not. So `total_income` counted last December's pay while
`total_expenses_only` excluded last December's spending, and
`net_cash_flow = total_income - total_expenses_only` subtracted a 8½-month
figure from a 9½-month one. `savings_rate` is derived from the same pair and
inherited it. The error was always in the flattering direction and was worst in
January, when year-to-date is nearly empty and one December salary is most of
the numerator.

Measured on the broken code, with the fixture below: total_income 10,999,
total_expenses 400, net_cash_flow 10,599 — against a true 1,000 / 400 / 600.

*** THE DISCRIMINATING ROW IS THE ONE DATED LAST DECEMBER. *** A fixture whose
transactions are all in the current year passes either way, which is why 1,191
backend tests were green over this.
"""

from datetime import datetime

import pytest

from tests.factories import ExpenseFactory, UserFactory

ENDPOINT = '/api/v1/analytics/dashboard'


@pytest.fixture
def user(db):
    return UserFactory(password_plain='secret')


@pytest.fixture
def this_year_and_last_december(user):
    """Money in and out on both sides of the year boundary, inside the window.

    Last December is deliberately the 15th: `dashboard_start` is Jan 1 minus 31
    days, so the 15th is comfortably inside the query and comfortably outside
    the year. A row the query never loaded would prove nothing about the loop.
    """
    now = datetime.utcnow().replace(day=15, hour=12, minute=0, second=0, microsecond=0)
    last_dec = datetime(now.year - 1, 12, 15, 12, 0, 0)

    ExpenseFactory(user_id=user.id, amount=1000.0, date=now, transaction_type='income')
    ExpenseFactory(user_id=user.id, amount=400.0, date=now, transaction_type='expense')
    ExpenseFactory(user_id=user.id, amount=9999.0, date=last_dec, transaction_type='income')
    ExpenseFactory(user_id=user.id, amount=8888.0, date=last_dec, transaction_type='expense')
    # Transfers are summed in the same loop as income, so they moved with it.
    # Asserted below rather than left implied — see the transfers test.
    ExpenseFactory(user_id=user.id, amount=250.0, date=now, transaction_type='transfer')
    ExpenseFactory(user_id=user.id, amount=7777.0, date=last_dec, transaction_type='transfer')
    return now, last_dec


def _dashboard(client, auth_headers, user):
    return client.get(ENDPOINT, headers=auth_headers(user, password='secret')).get_json()['data']


def test_total_income_excludes_last_december(client, auth_headers, user,
                                             this_year_and_last_december):
    data = _dashboard(client, auth_headers, user)
    assert data['total_income'] == pytest.approx(1000.0, abs=0.01)


def test_total_expenses_excludes_last_december(client, auth_headers, user,
                                               this_year_and_last_december):
    # The half that was already correct. Asserted anyway: if a later change
    # "fixes" the asymmetry by widening the EXPENSE window instead of narrowing
    # the income one, this file must still fail.
    data = _dashboard(client, auth_headers, user)
    assert data['total_expenses'] == pytest.approx(400.0, abs=0.01)


def test_net_cash_flow_subtracts_like_from_like(client, auth_headers, user,
                                                this_year_and_last_december):
    data = _dashboard(client, auth_headers, user)
    assert data['net_cash_flow'] == pytest.approx(600.0, abs=0.01)
    # And it is the difference of the two figures printed beside it, which is
    # the property a reader checks by eye.
    assert data['net_cash_flow'] == pytest.approx(
        data['total_income'] - data['total_expenses'], abs=0.01)


def test_savings_rate_is_derived_from_the_corrected_pair(client, auth_headers, user,
                                                         this_year_and_last_december):
    # 600 / 1000. On the broken code this was 10,599 / 10,999 = 96.4%, a
    # congratulation the user had not earned.
    data = _dashboard(client, auth_headers, user)
    assert data['savings_rate'] == pytest.approx(60.0, abs=0.1)


def test_total_transfers_moved_with_income(app, user, this_year_and_last_december):
    """The third figure in the same loop, pinned rather than left implied.

    The year guard sits above the whole `transaction_type` branch, so it bounds
    transfers as well as income. That is intended: `total_transfers` is a
    year-to-date total computed beside two others, and one of three figures
    covering a different period is the defect this file is about.

    *** ASSERTED AGAINST THE SERVICE, NOT THE ROUTE, BECAUSE THE ROUTE DROPS
    IT. *** `get_dashboard_data` returns `total_transfers`; the handler's
    hand-written field list does not forward it, and no client reads it —
    grepped across `web-ui/src` and `mobile/src`, 2026-09-18. So nothing
    visible changed here, and that is precisely the reason to pin it: an
    unrendered field is the one a later reader "restores" to the old
    behaviour, having no symptom to tell them otherwise. The first version of
    this test asserted on the HTTP payload and died on a `KeyError`, which is
    how the route's filtering was found.
    """
    from src.services.analytics.service import AnalyticsService

    data = AnalyticsService().get_dashboard_data(user.id)

    # 250.00 this year; last December's 7,777.00 is inside the query window and
    # outside the year, exactly like the income and expense rows above.
    assert data['total_transfers'] == pytest.approx(250.0, abs=0.01)
