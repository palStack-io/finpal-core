"""`GET /analytics/stats` must return data instead of recursing to death.

The handler built its response with a local `convert_to_dict` that recursed into
`obj.__dict__` for anything that had one. `get_stats_data` returns
`get_dashboard_data`'s dict, which holds live SQLAlchemy `Expense` instances, so
the walk reached `_sa_instance_state` and the relationship back-references and
raised `RecursionError` — every call, 500, with the traceback swallowed into a
generic error body.

It went unnoticed because nothing calls the endpoint. These tests exist so that
if something starts to, it works.
"""
from datetime import datetime

import pytest

from tests.factories import (
    AccountFactory,
    CategoryFactory,
    ExpenseFactory,
    UserFactory,
)


@pytest.fixture
def user_with_history(db):
    user = UserFactory(password_plain='secret')
    account = AccountFactory(user_id=user.id)
    category = CategoryFactory(user_id=user.id)

    for i in range(3):
        ExpenseFactory(
            user_id=user.id,
            account_id=account.id,
            category_id=category.id,
            amount=25.0,
            date=datetime(2026, 3, 5 + i),
            description=f'Groceries {i}',
        )
    ExpenseFactory(
        user_id=user.id,
        account_id=account.id,
        amount=500.0,
        date=datetime(2026, 3, 1),
        transaction_type='income',
        description='Salary',
    )
    return user


def test_stats_returns_a_payload_rather_than_500(client, auth_headers, user_with_history):
    headers = auth_headers(user_with_history, password='secret')

    resp = client.get('/api/v1/analytics/stats', headers=headers)

    assert resp.status_code == 200, resp.get_json()
    body = resp.get_json()
    assert body['success'] is True
    assert isinstance(body['data'], dict)


def test_stats_payload_is_json_safe_and_carries_real_figures(
    client, auth_headers, user_with_history
):
    """Guards the specific failure: no ORM internals anywhere in the response.

    `_sa_instance_state` appearing in the body would mean something is walking
    `__dict__` again — the exact shape that recursed.
    """
    headers = auth_headers(user_with_history, password='secret')

    resp = client.get('/api/v1/analytics/stats', headers=headers)
    data = resp.get_json()['data']

    assert '_sa_instance_state' not in resp.get_data(as_text=True)

    # Expenses arrive as plain dicts, not nested model graphs.
    assert isinstance(data['expenses'], list)
    for row in data['expenses']:
        assert set(row) >= {'id', 'description', 'amount', 'date', 'transaction_type'}
        assert isinstance(row['amount'], (int, float))

    # And the figures are the seeded ones, not zeros from a swallowed failure.
    assert data['total_expenses_only'] == 75.0
    assert data['total_income'] == 500.0


def test_stats_includes_the_fields_it_adds_on_top_of_dashboard(
    client, auth_headers, user_with_history
):
    headers = auth_headers(user_with_history, password='secret')

    data = client.get('/api/v1/analytics/stats', headers=headers).get_json()['data']

    for key in (
        'monthly_income',
        'category_names',
        'category_totals',
        'liquidity_ratio',
        'account_growth',
        'spending_trend',
        'net_balance',
    ):
        assert key in data, f'{key} missing from /analytics/stats'


def test_stats_is_empty_but_valid_for_a_new_account(client, auth_headers, db):
    """A fresh account must get zeros, not a 500 and not an absent key."""
    user = UserFactory(password_plain='secret')
    headers = auth_headers(user, password='secret')

    resp = client.get('/api/v1/analytics/stats', headers=headers)

    assert resp.status_code == 200, resp.get_json()
    data = resp.get_json()['data']
    assert data['total_income'] == 0
    assert data['total_expenses_only'] == 0
    assert data['expenses'] == []
