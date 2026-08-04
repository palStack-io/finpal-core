"""/analytics/categories/top — the date range and limit must be honoured.

The handler used to call get_dashboard_data(), whose category figures are pinned
to the current calendar month, and then discard the limit, start_date and
end_date the web UI had sent. The Analytics page's Week/Month/Year selector
therefore rendered identical numbers for all three ranges. These tests assert on
the returned totals, not on the status code — a 200 was exactly what the broken
version returned.
"""

from datetime import datetime, timedelta

import pytest

from tests.factories import CategoryFactory, ExpenseFactory, UserFactory

ENDPOINT = '/api/v1/analytics/categories/top'


def _iso(d):
    return d.strftime('%Y-%m-%d')


@pytest.fixture
def user(db):
    return UserFactory(password_plain='secret')


def _totals(resp):
    """{category name: amount} from a successful response."""
    body = resp.get_json()
    assert body['success'] is True, body
    return {c['name']: c['amount'] for c in body['categories']}


def test_date_range_excludes_spending_outside_the_window(client, auth_headers, user):
    """The window is what distinguishes the fix: an old expense must not appear."""
    groceries = CategoryFactory(name='Groceries', user_id=user.id)
    now = datetime.utcnow()

    ExpenseFactory(user_id=user.id, category_id=groceries.id,
                   amount=25.0, date=now - timedelta(days=2))
    # 200 days back — inside the old handler's full-year fetch, outside the
    # window the client asks for below.
    ExpenseFactory(user_id=user.id, category_id=groceries.id,
                   amount=900.0, date=now - timedelta(days=200))

    resp = client.get(
        '%s?start_date=%s&end_date=%s' % (
            ENDPOINT, _iso(now - timedelta(days=7)), _iso(now)),
        headers=auth_headers(user, password='secret'))

    assert resp.status_code == 200
    assert _totals(resp) == {'Groceries': 25.0}


def test_widening_the_range_changes_the_total(client, auth_headers, user):
    """Week and Year returned the same numbers before; they must now differ."""
    groceries = CategoryFactory(name='Groceries', user_id=user.id)
    now = datetime.utcnow()
    headers = auth_headers(user, password='secret')

    ExpenseFactory(user_id=user.id, category_id=groceries.id,
                   amount=25.0, date=now - timedelta(days=2))
    ExpenseFactory(user_id=user.id, category_id=groceries.id,
                   amount=60.0, date=now - timedelta(days=40))

    week = client.get('%s?start_date=%s&end_date=%s' % (
        ENDPOINT, _iso(now - timedelta(days=7)), _iso(now)), headers=headers)
    year = client.get('%s?start_date=%s&end_date=%s' % (
        ENDPOINT, _iso(now - timedelta(days=365)), _iso(now)), headers=headers)

    assert _totals(week) == {'Groceries': 25.0}
    assert _totals(year) == {'Groceries': 85.0}


def test_end_date_includes_the_whole_final_day(client, auth_headers, user):
    """A 14:30 expense on the end date is in range; a bare date parses to 00:00."""
    groceries = CategoryFactory(name='Groceries', user_id=user.id)
    today = datetime.utcnow().replace(hour=14, minute=30, second=0, microsecond=0)

    ExpenseFactory(user_id=user.id, category_id=groceries.id,
                   amount=12.5, date=today)

    resp = client.get('%s?start_date=%s&end_date=%s' % (
        ENDPOINT, _iso(today), _iso(today)),
        headers=auth_headers(user, password='secret'))

    assert _totals(resp) == {'Groceries': 12.5}


def test_limit_is_applied(client, auth_headers, user):
    now = datetime.utcnow()
    for i, amount in enumerate([10.0, 20.0, 30.0]):
        cat = CategoryFactory(name='Cat %d' % i, user_id=user.id)
        ExpenseFactory(user_id=user.id, category_id=cat.id,
                       amount=amount, date=now)

    resp = client.get('%s?limit=2&start_date=%s&end_date=%s' % (
        ENDPOINT, _iso(now - timedelta(days=1)), _iso(now)),
        headers=auth_headers(user, password='secret'))

    body = resp.get_json()
    assert len(body['categories']) == 2
    # Highest first, so the 10.0 category is the one dropped.
    assert [c['amount'] for c in body['categories']] == [30.0, 20.0]


def test_uncategorised_spending_is_reported(client, auth_headers, user):
    """It was silently dropped, so slices summed to less than the real total."""
    groceries = CategoryFactory(name='Groceries', user_id=user.id)
    now = datetime.utcnow()

    ExpenseFactory(user_id=user.id, category_id=groceries.id,
                   amount=30.0, date=now)
    ExpenseFactory(user_id=user.id, category_id=None, amount=70.0, date=now)

    resp = client.get('%s?start_date=%s&end_date=%s' % (
        ENDPOINT, _iso(now - timedelta(days=1)), _iso(now)),
        headers=auth_headers(user, password='secret'))

    assert _totals(resp) == {'Uncategorised': 70.0, 'Groceries': 30.0}


def test_income_direction_is_separate_from_expenses(client, auth_headers, user):
    """type=income backs the Income Sources breakdown."""
    salary = CategoryFactory(name='Salary', user_id=user.id)
    groceries = CategoryFactory(name='Groceries', user_id=user.id)
    now = datetime.utcnow()
    headers = auth_headers(user, password='secret')
    window = 'start_date=%s&end_date=%s' % (
        _iso(now - timedelta(days=1)), _iso(now))

    ExpenseFactory(user_id=user.id, category_id=salary.id, amount=3000.0,
                   date=now, transaction_type='income')
    ExpenseFactory(user_id=user.id, category_id=groceries.id, amount=40.0,
                   date=now, transaction_type='expense')

    income = client.get('%s?type=income&%s' % (ENDPOINT, window), headers=headers)
    expense = client.get('%s?%s' % (ENDPOINT, window), headers=headers)

    assert _totals(income) == {'Salary': 3000.0}
    assert _totals(expense) == {'Groceries': 40.0}


@pytest.mark.parametrize('query,expected_field', [
    ('limit=abc', 'limit'),
    ('start_date=not-a-date&end_date=2026-01-01', 'start_date'),
    ('start_date=2026-06-01&end_date=2026-01-01', 'end_date'),
    ('type=sideways', 'type'),
])
def test_bad_parameters_are_rejected(client, auth_headers, user, query,
                                     expected_field):
    resp = client.get('%s?%s' % (ENDPOINT, query),
                      headers=auth_headers(user, password='secret'))

    assert resp.status_code == 400
    body = resp.get_json()
    assert body['success'] is False
    assert expected_field in body['error']


def test_requires_authentication(client, db):
    assert client.get(ENDPOINT).status_code == 401
