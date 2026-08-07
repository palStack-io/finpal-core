"""`GET /api/v1/transactions/` — pagination, filters, summary, group scoping.

Every assertion here is on the returned payload rather than the status code.
The bugs this file covers all returned `200` and rendered a plausible list:

- the handler that actually served web-ui read **zero** query parameters, so
  `page` / `per_page` / `start_date` / `search` were built by the client and
  silently discarded, and every render loaded the whole history;
- `group_id` was read by nobody, so a group's page showed the user's entire
  history as if it were that group's;
- there was no `summary`, while the MSW mock for the URL returned a `pagination`
  key the winning handler never sent.
"""
from datetime import datetime

import pytest

from tests.factories import (
    AccountFactory,
    CategoryFactory,
    ExpenseFactory,
    UserFactory,
)
from src.models.group import Group
from src.extensions import db


PER_PAGE_DEFAULT = 50


@pytest.fixture
def ledger(db):
    """A user with 60 expenses, 3 income rows, two categories, and one group.

    60 is deliberately above the 50 default page size: a handler that ignores
    pagination and one that honours it both return `200`, and only the row count
    tells them apart.
    """
    user = UserFactory(password_plain='secret')
    account = AccountFactory(user_id=user.id)
    other_account = AccountFactory(user_id=user.id)
    groceries = CategoryFactory(user_id=user.id)
    travel = CategoryFactory(user_id=user.id)

    group = Group(name='Flat', created_by=user.id)
    db.session.add(group)
    db.session.commit()

    # 40 in March, 20 in April, all expenses of 10.00
    for i in range(40):
        ExpenseFactory(
            user_id=user.id,
            account_id=account.id,
            category_id=groceries.id,
            amount=10.0,
            date=datetime(2026, 3, 1 + (i % 28)),
            description=f'March item {i}',
        )
    for i in range(20):
        ExpenseFactory(
            user_id=user.id,
            account_id=other_account.id,
            category_id=travel.id,
            amount=10.0,
            date=datetime(2026, 4, 1 + (i % 28)),
            description=f'April item {i}',
        )

    # 3 income rows of 100.00, and 5 of the March expenses moved into the group
    for i in range(3):
        ExpenseFactory(
            user_id=user.id,
            account_id=account.id,
            amount=100.0,
            date=datetime(2026, 3, 5),
            transaction_type='income',
            description=f'Salary {i}',
        )
    for i in range(5):
        ExpenseFactory(
            user_id=user.id,
            account_id=account.id,
            amount=20.0,
            date=datetime(2026, 3, 10),
            group_id=group.id,
            description=f'Flat item {i}',
        )

    return {
        'user': user,
        'account': account,
        'other_account': other_account,
        'groceries': groceries,
        'travel': travel,
        'group': group,
    }


@pytest.fixture
def headers(ledger, auth_headers):
    return auth_headers(ledger['user'], password='secret')


def get(client, headers, query=''):
    resp = client.get(f'/api/v1/transactions/{query}', headers=headers)
    assert resp.status_code == 200, resp.get_json()
    return resp.get_json()


def test_first_page_is_bounded_to_per_page(client, headers):
    """68 rows exist; the page holds 50 and says so."""
    body = get(client, headers)

    assert len(body['transactions']) == PER_PAGE_DEFAULT
    assert body['pagination']['total'] == 68
    assert body['pagination']['pages'] == 2
    assert body['pagination']['has_next'] is True
    assert body['pagination']['has_prev'] is False


def test_second_page_holds_the_remainder(client, headers):
    body = get(client, headers, '?page=2')

    assert len(body['transactions']) == 18
    assert body['pagination']['page'] == 2
    assert body['pagination']['has_next'] is False
    assert body['pagination']['has_prev'] is True


def test_per_page_is_honoured(client, headers):
    body = get(client, headers, '?per_page=5')

    assert len(body['transactions']) == 5
    assert body['pagination']['pages'] == 14


def test_rows_are_newest_first_across_the_page_boundary(client, headers):
    first = get(client, headers, '?per_page=10')['transactions']
    second = get(client, headers, '?per_page=10&page=2')['transactions']

    dates = [row['date'] for row in first + second]
    assert dates == sorted(dates, reverse=True)


def test_summary_covers_the_whole_query_not_the_page(client, headers):
    """The cards above the list must describe every matching row.

    Summing `pagination.items` would report the 50 rows on screen and label the
    result "Total Income" — a figure the app never computed.
    """
    body = get(client, headers, '?per_page=5')

    assert len(body['transactions']) == 5
    # 60 expenses at 10.00 + 5 group expenses at 20.00 = 700.00
    assert body['summary']['total_expense'] == 700.0
    assert body['summary']['total_income'] == 300.0
    assert body['summary']['net_balance'] == -400.0


def test_summary_follows_the_filter(client, headers, ledger):
    """Filtering the list must move the totals with it."""
    body = get(client, headers, f"?category_id={ledger['travel'].id}")

    assert len(body['transactions']) == 20
    assert body['summary']['total_expense'] == 200.0
    assert body['summary']['total_income'] == 0.0


def test_date_range_filter(client, headers):
    body = get(client, headers, '?start_date=2026-04-01&end_date=2026-04-30')

    assert body['pagination']['total'] == 20
    assert all(row['date'].startswith('2026-04') for row in body['transactions'])


def test_account_filter(client, headers, ledger):
    body = get(client, headers, f"?account_id={ledger['other_account'].id}")

    assert body['pagination']['total'] == 20
    assert {row['account_id'] for row in body['transactions']} == {
        ledger['other_account'].id
    }


def test_type_filter(client, headers):
    body = get(client, headers, '?type=income')

    assert body['pagination']['total'] == 3
    assert {row['transaction_type'] for row in body['transactions']} == {'income'}
    assert body['summary']['total_income'] == 300.0
    assert body['summary']['total_expense'] == 0.0


def test_search_filter(client, headers):
    body = get(client, headers, '?search=Salary')

    assert body['pagination']['total'] == 3
    assert all('Salary' in row['description'] for row in body['transactions'])


def test_group_id_returns_only_that_groups_rows(client, headers, ledger):
    """The bug: `group_id` was read by nobody.

    GroupDetail.tsx has always passed it, so a group's page rendered all 68 of
    the user's transactions as if they belonged to the group.
    """
    body = get(client, headers, f"?group_id={ledger['group'].id}")

    assert body['pagination']['total'] == 5
    assert len(body['transactions']) == 5
    assert body['summary']['total_expense'] == 100.0
    assert all(row['description'].startswith('Flat item') for row in body['transactions'])


def test_group_filter_excludes_ungrouped_rows(client, headers, ledger):
    """Guards the shape of the fix: a truthy check must not become a no-op."""
    body = get(client, headers, f"?group_id={ledger['group'].id}")
    ids = {row['id'] for row in body['transactions']}

    ungrouped = get(client, headers, '?search=March item')['transactions']
    assert ids.isdisjoint({row['id'] for row in ungrouped})


def test_a_demo_account_is_returned_no_household_rows(client, auth_headers, ledger):
    """**Rewritten deliberately for D-18 items B+D — this test's premise inverted.**

    It used to be `test_another_users_rows_are_never_returned`, and its docstring
    read "Transactions stay user-scoped even though accounts are household-scoped".
    That mismatch *was* the bug: one payload, four scopings (D-18). Transactions now
    follow accounts, so another user on the instance is a housemate and their rows
    are supposed to come back — see `test_transaction_scope_contract.py`.

    What has NOT changed is the boundary around a demo account, which is on the
    instance but is not a household member and signs in with a published password.
    Re-keying the assertion to that boundary keeps a real leak test here instead of
    leaving one that passes because the household happens to be empty.
    """
    demo = UserFactory(id='demo-list@finpal.demo', is_demo_user=True,
                       password_plain='secret')
    demo_headers = auth_headers(demo, password='secret')

    body = get(client, demo_headers)

    assert body['transactions'] == []
    assert body['pagination']['total'] == 0
    assert body['summary'] == {
        'total_income': 0.0,
        'total_expense': 0.0,
        'net_balance': 0.0,
    }


def test_a_housemates_rows_are_returned(client, auth_headers, ledger):
    """The other half of the inversion, asserted rather than assumed.

    Without this, the rewrite above would have removed the only test in this file
    that says anything about whose rows the list contains.
    """
    housemate = UserFactory(password_plain='secret')
    housemate_headers = auth_headers(housemate, password='secret')

    body = get(client, housemate_headers)

    assert body['pagination']['total'] > 0
    assert body['summary']['total_expense'] > 0


def test_slashless_path_is_served_by_the_paginating_handler(client, headers):
    """`/api/v1/transactions` (no slash) is what web-ui has always called.

    It used to match an exact rule on the legacy blueprint, which read no query
    parameters and returned every row with no `pagination` key. With that rule
    retired and `url_map.strict_slashes = False`, the restx rule matches both
    spellings, so the slash-less path now gets pagination and a summary without
    any client change.
    """
    resp = client.get('/api/v1/transactions', headers=headers)
    assert resp.status_code == 200, resp.get_json()
    body = resp.get_json()

    assert len(body['transactions']) == PER_PAGE_DEFAULT
    assert body['pagination']['total'] == 68
    assert body['summary']['total_expense'] == 700.0


def test_slashless_path_honours_query_params(client, headers, ledger):
    """The legacy handler discarded these; both spellings must now respect them."""
    body = client.get(
        f"/api/v1/transactions?per_page=5&group_id={ledger['group'].id}",
        headers=headers,
    ).get_json()

    assert len(body['transactions']) == 5
    assert body['pagination']['total'] == 5
    assert body['summary']['total_expense'] == 100.0
