"""The Dashboard's "Monthly" cards must be fed monthly figures.

/analytics/dashboard returned total_income and total_expenses_only, both
year-to-date, and Dashboard.tsx displayed them under labels reading "Monthly
Income" and "Monthly Expenses". current_month_expenses_only already existed;
current_month_income did not, so there was no monthly income figure to use. In
December the "monthly" numbers were roughly twelve times the truth, and the savings
rate derived from them inherited the error.

The discriminating assertion is that income recorded in an earlier month counts
towards the year-to-date total but not the current-month one.
"""

from datetime import datetime

import pytest

from tests.factories import ExpenseFactory, UserFactory

ENDPOINT = '/api/v1/analytics/dashboard'


@pytest.fixture
def user(db):
    return UserFactory(password_plain='secret')


def _earlier_month_this_year(now):
    """A date in a previous month of the same year, or None in January.

    The dashboard query is bounded to this calendar year, so an earlier month has
    to stay inside it for the year-to-date comparison to mean anything.
    """
    if now.month == 1:
        return None
    return now.replace(month=now.month - 1, day=15, hour=12, minute=0,
                       second=0, microsecond=0)


def test_current_month_income_excludes_earlier_months(client, auth_headers, user):
    now = datetime.utcnow().replace(day=15, hour=12, minute=0, second=0, microsecond=0)
    earlier = _earlier_month_this_year(now)

    ExpenseFactory(user_id=user.id, amount=2000.0, date=now,
                   transaction_type='income')
    if earlier is not None:
        ExpenseFactory(user_id=user.id, amount=5000.0, date=earlier,
                       transaction_type='income')

    body = client.get(ENDPOINT, headers=auth_headers(user, password='secret')).get_json()
    data = body['data']

    assert data['current_month_income'] == pytest.approx(2000.0, abs=0.01)
    if earlier is not None:
        # The year-to-date figure keeps both, which is what made substituting one
        # for the other invisible.
        assert data['total_income'] == pytest.approx(7000.0, abs=0.01)
        assert data['current_month_income'] != pytest.approx(data['total_income'], abs=0.01)


def test_current_month_income_is_present_and_zero_by_default(client, auth_headers, user):
    """The field must exist even with no income, or the UI reads undefined."""
    body = client.get(ENDPOINT, headers=auth_headers(user, password='secret')).get_json()

    assert 'current_month_income' in body['data']
    assert body['data']['current_month_income'] == 0


def test_expenses_have_the_same_monthly_split(client, auth_headers, user):
    """Sanity: the pre-existing expense counterpart behaves the same way."""
    now = datetime.utcnow().replace(day=15, hour=12, minute=0, second=0, microsecond=0)
    earlier = _earlier_month_this_year(now)

    ExpenseFactory(user_id=user.id, amount=120.0, date=now,
                   transaction_type='expense')
    if earlier is not None:
        ExpenseFactory(user_id=user.id, amount=300.0, date=earlier,
                       transaction_type='expense')

    data = client.get(ENDPOINT, headers=auth_headers(user, password='secret')).get_json()['data']

    assert data['current_month_expenses_only'] == pytest.approx(120.0, abs=0.01)
    if earlier is not None:
        assert data['total_expenses_only'] == pytest.approx(420.0, abs=0.01)
