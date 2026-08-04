"""Date-scoped spending aggregation.

finpal_core has nine analytics endpoints and none of them accepts a date range —
every one computes a fixed period internally. So "what did I spend on groceries
last March" was unanswerable, which makes an LLM page through raw rows and get
the arithmetic wrong. This endpoint exists so aggregation happens in SQL.
"""
from datetime import datetime, timedelta

from src.extensions import db
from src.models.category import Category
from src.models.personal_access_token import SCOPE_READ, PersonalAccessToken
from src.models.transaction import Expense
from tests.factories import UserFactory

URL = '/api/v1/analytics/spending-summary'


def _expense(user, description, amount, when, category_id=None, kind='expense'):
    return Expense(
        description=description, amount=amount, date=when, user_id=user.id,
        paid_by=user.id, card_used='', split_method='equal',
        category_id=category_id, transaction_type=kind)


def _seed(db):
    user = UserFactory()
    food = Category(name='Food', user_id=user.id)
    travel = Category(name='Travel', user_id=user.id)
    db.session.add_all([food, travel])
    db.session.flush()
    db.session.add_all([
        _expense(user, 'Tesco', 30.0, datetime(2026, 3, 5), food.id),
        _expense(user, 'Tesco', 20.0, datetime(2026, 3, 20), food.id),
        _expense(user, 'Train', 50.0, datetime(2026, 3, 10), travel.id),
        # Outside the window on both sides.
        _expense(user, 'Tesco', 999.0, datetime(2026, 2, 27), food.id),
        _expense(user, 'Tesco', 888.0, datetime(2026, 4, 2), food.id),
        # Income must not be counted as spending.
        _expense(user, 'Salary', 2000.0, datetime(2026, 3, 15), None, 'income'),
    ])
    db.session.commit()
    return user, food, travel


def _token(user):
    _, plaintext = PersonalAccessToken.generate(
        user_id=user.id, name='mcp', scopes=SCOPE_READ,
        expires_at=datetime.utcnow() + timedelta(days=1))
    db.session.commit()
    return plaintext


def test_groups_by_category_within_the_date_range(client, db, auth_headers):
    user, food, travel = _seed(db)

    resp = client.get(URL, query_string={
        'start_date': '2026-03-01', 'end_date': '2026-03-31',
        'group_by': 'category'}, headers=auth_headers(user))

    assert resp.status_code == 200, resp.get_json()
    body = resp.get_json()
    assert body['total'] == 100.0, 'expected 30+20+50, excluding out-of-range and income'
    assert body['count'] == 3
    groups = {g['label']: g for g in body['groups']}
    assert groups['Food']['total'] == 50.0
    assert groups['Food']['count'] == 2
    assert groups['Travel']['total'] == 50.0
    # Ordered by amount descending.
    assert body['groups'][0]['total'] >= body['groups'][-1]['total']


def test_groups_by_merchant_which_is_really_the_description(client, db, auth_headers):
    user, _, _ = _seed(db)

    resp = client.get(URL, query_string={
        'start_date': '2026-03-01', 'end_date': '2026-03-31',
        'group_by': 'merchant'}, headers=auth_headers(user))

    assert resp.status_code == 200
    groups = {g['label']: g['total'] for g in resp.get_json()['groups']}
    assert groups['Tesco'] == 50.0
    assert groups['Train'] == 50.0


def test_groups_by_month(client, db, auth_headers):
    user, _, _ = _seed(db)

    resp = client.get(URL, query_string={
        'start_date': '2026-02-01', 'end_date': '2026-04-30',
        'group_by': 'month'}, headers=auth_headers(user))

    assert resp.status_code == 200
    groups = {g['label']: g['total'] for g in resp.get_json()['groups']}
    assert groups['2026-02'] == 999.0
    assert groups['2026-03'] == 100.0
    assert groups['2026-04'] == 888.0


def test_an_empty_range_returns_zeros_rather_than_erroring(client, db, auth_headers):
    user, _, _ = _seed(db)

    resp = client.get(URL, query_string={
        'start_date': '2020-01-01', 'end_date': '2020-01-31'},
        headers=auth_headers(user))

    assert resp.status_code == 200
    body = resp.get_json()
    assert body['groups'] == []
    assert body['total'] == 0
    assert body['count'] == 0


def test_category_is_the_default_grouping(client, db, auth_headers):
    user, _, _ = _seed(db)
    resp = client.get(URL, query_string={
        'start_date': '2026-03-01', 'end_date': '2026-03-31'},
        headers=auth_headers(user))
    assert resp.status_code == 200
    assert resp.get_json()['group_by'] == 'category'


def test_uncategorised_transactions_are_grouped_not_dropped(client, db, auth_headers):
    user, _, _ = _seed(db)
    db.session.add(_expense(user, 'Mystery', 7.0, datetime(2026, 3, 8), None))
    db.session.commit()

    resp = client.get(URL, query_string={
        'start_date': '2026-03-01', 'end_date': '2026-03-31',
        'group_by': 'category'}, headers=auth_headers(user))

    body = resp.get_json()
    assert body['total'] == 107.0, 'an uncategorised expense was dropped'
    assert any(g['label'] == 'Uncategorised' for g in body['groups'])


def test_bad_dates_are_refused(client, db, auth_headers):
    user, _, _ = _seed(db)
    for params in (
            {'start_date': 'not-a-date', 'end_date': '2026-03-31'},
            {'start_date': '2026-03-31', 'end_date': '2026-03-01'},
            {'end_date': '2026-03-31'},
            {'start_date': '2026-03-01'},
    ):
        resp = client.get(URL, query_string=params, headers=auth_headers(user))
        assert resp.status_code == 400, '%r was accepted' % params


def test_an_unknown_group_by_is_refused(client, db, auth_headers):
    user, _, _ = _seed(db)
    resp = client.get(URL, query_string={
        'start_date': '2026-03-01', 'end_date': '2026-03-31',
        'group_by': 'merchant_normalised'}, headers=auth_headers(user))
    assert resp.status_code == 400


def test_another_users_spending_never_appears(client, db, auth_headers):
    user, _, _ = _seed(db)
    stranger = UserFactory()
    db.session.add(_expense(stranger, 'Not yours', 500.0, datetime(2026, 3, 9)))
    db.session.commit()

    resp = client.get(URL, query_string={
        'start_date': '2026-03-01', 'end_date': '2026-03-31',
        'group_by': 'merchant'}, headers=auth_headers(user))

    body = resp.get_json()
    assert body['total'] == 100.0
    assert 'Not yours' not in resp.get_data(as_text=True)


def test_a_read_token_can_call_it(client, db):
    """The whole point — an MCP client uses a token, not a session."""
    user, _, _ = _seed(db)
    resp = client.get(URL, query_string={
        'start_date': '2026-03-01', 'end_date': '2026-03-31'},
        headers={'X-API-Key': _token(user)})
    assert resp.status_code == 200
    assert resp.get_json()['total'] == 100.0


def test_it_aggregates_in_sql_not_in_python(client, db, auth_headers):
    """The existing analytics service loads rows and sums them in a loop, which is
    exactly what this endpoint exists to avoid. Assert on statement count so a
    future refactor cannot quietly reintroduce it."""
    from sqlalchemy import event

    user, _, _ = _seed(db)
    # 300 more rows: a Python implementation would have to fetch them all.
    db.session.add_all([
        _expense(user, 'Bulk %d' % i, 1.0, datetime(2026, 3, 12))
        for i in range(300)])
    db.session.commit()

    selects = []

    def _record(conn, cursor, statement, params, context, executemany):
        if statement.lstrip().upper().startswith('SELECT'):
            selects.append(statement)

    event.listen(db.engine, 'before_cursor_execute', _record)
    try:
        resp = client.get(URL, query_string={
            'start_date': '2026-03-01', 'end_date': '2026-03-31',
            'group_by': 'merchant'}, headers=auth_headers(user))
    finally:
        event.remove(db.engine, 'before_cursor_execute', _record)

    assert resp.status_code == 200
    expense_selects = [s for s in selects if 'expenses' in s.lower()]
    assert len(expense_selects) <= 2, (
        'expected one aggregate query over expenses, saw %d — is it summing in '
        'Python?\n%s' % (len(expense_selects), expense_selects))
