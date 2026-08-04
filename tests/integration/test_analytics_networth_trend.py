"""/analytics/networth must not invent history.

get_networth_trend used to fall back to a synthetic 12-month series whenever it
had fewer than `months` real months — which was nearly always, because the
underlying trend only emits months that contain transactions. The synthetic
branch was also inverted: growth_factor = (months - i - 1) * 0.02 gave the oldest
month a factor of 0 and the newest 0.22, so assets were divided by 1.22 at the
present day. The chart showed net worth declining steadily towards today, and its
final point did not equal the total_assets the same payload reported.

The discriminating assertion is the last one: the newest datapoint must agree
with the account totals shown beside the chart.
"""

from datetime import datetime, timedelta

import pytest

from tests.factories import AccountFactory, ExpenseFactory, UserFactory

ENDPOINT = '/api/v1/analytics/networth'


@pytest.fixture
def user(db):
    return UserFactory(password_plain='secret')


def _trend(client, headers, query=''):
    resp = client.get('%s%s' % (ENDPOINT, query), headers=headers)
    assert resp.status_code == 200, resp.get_json()
    body = resp.get_json()
    assert body['success'] is True
    return body['networth']


def test_newest_point_matches_the_reported_totals(client, auth_headers, user):
    """The chart and the cards beside it must not contradict each other."""
    account = AccountFactory(user_id=user.id, type='checking', balance=1500.0,
                             currency_code='USD')
    now = datetime.utcnow()
    for months_back in (0, 1, 2):
        ExpenseFactory(user_id=user.id, account_id=account.id, amount=40.0,
                       date=now - timedelta(days=30 * months_back))

    headers = auth_headers(user, password='secret')
    trend = _trend(client, headers)

    dashboard = client.get('/api/v1/analytics/dashboard', headers=headers).get_json()
    totals = dashboard['data']

    assert trend, 'expected at least one month of history'
    assert trend[-1]['assets'] == pytest.approx(totals['total_assets'], abs=0.01)
    assert trend[-1]['liabilities'] == pytest.approx(totals['total_debts'], abs=0.01)
    assert trend[-1]['netWorth'] == pytest.approx(
        totals['total_assets'] - totals['total_debts'], abs=0.01)


def test_no_synthetic_twelve_month_series(client, auth_headers, user):
    """Three months of activity must not become twelve months of chart."""
    account = AccountFactory(user_id=user.id, type='checking', balance=900.0,
                             currency_code='USD')
    now = datetime.utcnow()
    for months_back in (0, 1, 2):
        ExpenseFactory(user_id=user.id, account_id=account.id, amount=25.0,
                       date=now - timedelta(days=30 * months_back))

    trend = _trend(client, auth_headers(user, password='secret'), '?months=12')

    # The old code returned exactly 12 fabricated points here.
    assert len(trend) < 12, 'trend was padded with invented months'
    assert len(trend) >= 1


def test_empty_when_there_is_no_history(client, auth_headers, user):
    """No accounts, no transactions — an empty list, not a manufactured curve."""
    trend = _trend(client, auth_headers(user, password='secret'))
    assert trend == []


def test_months_caps_the_series_length(client, auth_headers, user):
    """?months= was accepted by the service and never read from the request."""
    account = AccountFactory(user_id=user.id, type='checking', balance=800.0,
                             currency_code='USD')
    now = datetime.utcnow()
    for months_back in range(5):
        ExpenseFactory(user_id=user.id, account_id=account.id, amount=15.0,
                       date=now - timedelta(days=30 * months_back))

    headers = auth_headers(user, password='secret')
    assert len(_trend(client, headers, '?months=2')) <= 2


def test_bad_months_is_rejected(client, auth_headers, user):
    headers = auth_headers(user, password='secret')
    for bad in ('?months=abc', '?months=0', '?months=500'):
        resp = client.get('%s%s' % (ENDPOINT, bad), headers=headers)
        assert resp.status_code == 400, bad
        assert resp.get_json()['success'] is False
