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


def test_a_housemates_spending_DOES_appear_now_that_the_scope_matches_the_list(
        client, db, auth_headers):
    """This test used to assert the opposite, and the opposite was the bug.

    It was `test_another_users_spending_never_appears`, and it passed only
    because this endpoint filtered `Expense.user_id == user_id` while the
    TRANSACTIONS LIST has been household-scoped since D-18. The same money
    answered two different totals depending on which screen asked. Its
    "stranger" is a plain `UserFactory()`, and `household_user_ids()` is
    everyone-on-the-instance-except-demo — so that stranger was never a
    stranger. It was a housemate, and their spending belongs here.

    Rewritten rather than deleted: the negative it protected is real and is kept
    below, in the two tests that follow. Deleting a guard because the behaviour
    it pins has changed is how a scope silently widens further next time.
    """
    user, _, _ = _seed(db)
    housemate = UserFactory()
    db.session.add(_expense(housemate, 'Their groceries', 500.0,
                            datetime(2026, 3, 9)))
    db.session.commit()

    resp = client.get(URL, query_string={
        'start_date': '2026-03-01', 'end_date': '2026-03-31',
        'group_by': 'merchant'}, headers=auth_headers(user))

    body = resp.get_json()
    assert body['total'] == 600.0
    assert 'Their groceries' in resp.get_data(as_text=True)


def test_a_demo_accounts_spending_never_appears(client, db, auth_headers):
    """The negative the rewritten test above used to carry, aimed correctly.

    Demo accounts ship with a PUBLISHED PASSWORD, so a household-scoped read
    would put the real household's money behind credentials that are in the
    repository. That is D-42, and `read_scope` is where it is enforced — this
    asserts the widening did not walk around it.
    """
    user, _, _ = _seed(db)
    demo = UserFactory(is_demo_user=True)
    db.session.add(_expense(demo, 'Demo groceries', 700.0, datetime(2026, 3, 9)))
    db.session.commit()

    resp = client.get(URL, query_string={
        'start_date': '2026-03-01', 'end_date': '2026-03-31',
        'group_by': 'merchant'}, headers=auth_headers(user))

    body = resp.get_json()
    assert body['total'] == 100.0
    assert 'Demo groceries' not in resp.get_data(as_text=True)

    # And symmetrically: the demo login does not see the household either.
    resp = client.get(URL, query_string={
        'start_date': '2026-03-01', 'end_date': '2026-03-31',
        'group_by': 'merchant'}, headers=auth_headers(demo))
    assert resp.get_json()['total'] == 700.0


def test_a_personal_access_token_still_reads_only_its_own_data(client, db):
    """*** D-50, and the reason the helper is `read_scope` and not
    `visible_user_ids`. ***

    Both the implementation plan and the design doc said to widen this scope
    with `visible_user_ids`, which has NO personal-access-token clause. This is
    the endpoint an MCP client relies on, so that would have handed every token
    the whole household's spending — silently, at 200 — against the promise
    `AgentAccess.tsx:386` makes to the user in as many words: "A token reads
    only your own data."

    A session and a token must therefore answer DIFFERENT totals here, and that
    asymmetry is the point rather than an inconsistency.
    """
    user, _, _ = _seed(db)
    housemate = UserFactory()
    db.session.add(_expense(housemate, 'Their groceries', 500.0,
                            datetime(2026, 3, 9)))
    db.session.commit()

    resp = client.get(URL, query_string={
        'start_date': '2026-03-01', 'end_date': '2026-03-31'},
        headers={'X-API-Key': _token(user)})

    assert resp.status_code == 200
    assert resp.get_json()['total'] == 100.0
    assert 'Their groceries' not in resp.get_data(as_text=True)


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


def test_narrowing_to_one_category_is_what_the_flow_drilldown_asks(
        client, db, auth_headers):
    """Clicking a category in the flow diagram asks this endpoint who was paid.

    *** THE TOTAL OF THE PANEL MUST EQUAL THE SLICE THAT WAS CLICKED. *** A
    drill-down whose rows add up to less than the node it came from is the
    caption-and-figure mismatch this project keeps finding, and it renders
    perfectly.
    """
    user, food, _ = _seed(db)

    resp = client.get(URL, query_string={
        'start_date': '2026-03-01', 'end_date': '2026-03-31',
        'group_by': 'merchant', 'category_id': food.id},
        headers=auth_headers(user))

    assert resp.status_code == 200
    groups = {g['label']: g['total'] for g in resp.get_json()['groups']}
    assert groups == {'Tesco': 50.0}          # Train belongs to Travel
    assert resp.get_json()['total'] == 50.0


def test_one_slice_can_be_SEVERAL_categories(client, db, auth_headers):
    """*** A FLOW SLICE IS KEYED BY NAME, SO IT CAN MERGE TWO CATEGORIES. ***

    Two housemates each with a "Groceries" category are one slice of one
    household's spending. Sending a single id would answer for one of them and
    the panel would sum to less than the slice that was clicked.
    """
    user, food, travel = _seed(db)
    resp = client.get(URL, query_string=[
        ('start_date', '2026-03-01'), ('end_date', '2026-03-31'),
        ('group_by', 'merchant'),
        ('category_id', food.id), ('category_id', travel.id)],
        headers=auth_headers(user))
    groups = {g['label']: g['total'] for g in resp.get_json()['groups']}
    assert groups == {'Tesco': 50.0, 'Train': 50.0}
    assert resp.get_json()['total'] == 100.0


def test_the_drilldown_does_NOT_invent_a_parent_rollup(client, db, auth_headers):
    """*** THE SLICE IS A LEAF, SO THE PANEL MUST BE ONE TOO. ***

    `_get_category_spending` — which draws the flow diagram — buckets each
    expense under its OWN category's name and performs no parent rollup. So a
    drill-down that added a parent's children would show more than the slice
    it was opened from. This asserts the absence, because the first version of
    this endpoint did exactly that and the tests passed: the rollup was
    correct arithmetic answering the wrong question.
    """
    user, food, _ = _seed(db)
    coffee = Category(name='Coffee', user_id=user.id, parent_id=food.id)
    db.session.add(coffee)
    db.session.flush()
    db.session.add(_expense(user, 'Blue Bottle', 12.0, datetime(2026, 3, 8), coffee.id))
    db.session.commit()

    resp = client.get(URL, query_string={
        'start_date': '2026-03-01', 'end_date': '2026-03-31',
        'group_by': 'merchant', 'category_id': food.id},
        headers=auth_headers(user))

    groups = {g['label']: g['total'] for g in resp.get_json()['groups']}
    assert groups == {'Tesco': 50.0}
    assert 'Blue Bottle' not in groups


def test_uncategorised_is_openable_too(client, db, auth_headers):
    """`category_id=0` is how the UNCATEGORISED node asks.

    It is a real slice of the diagram and would otherwise be the one node a
    user cannot open — which is worse than not having the feature, because it
    is the slice they most want explained.
    """
    user, _, _ = _seed(db)
    db.session.add(_expense(user, 'Cash withdrawal', 40.0, datetime(2026, 3, 9), None))
    db.session.commit()

    resp = client.get(URL, query_string={
        'start_date': '2026-03-01', 'end_date': '2026-03-31',
        'group_by': 'merchant', 'category_id': 0}, headers=auth_headers(user))

    groups = {g['label']: g['total'] for g in resp.get_json()['groups']}
    assert groups == {'Cash withdrawal': 40.0}


def test_a_nonsense_category_id_is_a_400_not_a_500(client, db, auth_headers):
    user, _, _ = _seed(db)
    resp = client.get(URL, query_string={
        'start_date': '2026-03-01', 'end_date': '2026-03-31',
        'category_id': 'Food'}, headers=auth_headers(user))
    assert resp.status_code == 400
    assert 'category_id' in resp.get_json()['error']


def test_a_SPLIT_row_is_attributed_to_its_splits_not_to_its_own_category(
        client, db, auth_headers):
    """D-272. *** THE DEMO CANNOT SEE THIS: 0 OF 108 EXPENSES CARRY A SPLIT. ***

    `_get_category_spending` — the dashboard pie and the flow diagram —
    apportions an expense across `category_splits`. This endpoint grouped raw
    `Expense.amount` by `Expense.category_id` and never looked at the split
    table, so the two disagreed about what a category cost for anybody who had
    ever split a row. D-101's shape, and invisible to every screenshot.
    """
    from src.models.transaction import CategorySplit

    user, food, travel = _seed(db)
    row = _expense(user, 'Airport lunch', 100.0, datetime(2026, 3, 12), food.id)
    db.session.add(row)
    db.session.flush()
    db.session.add_all([
        CategorySplit(expense_id=row.id, category_id=food.id, amount=40.0),
        CategorySplit(expense_id=row.id, category_id=travel.id, amount=60.0),
    ])
    row.has_category_splits = True
    db.session.commit()

    resp = client.get(URL, query_string={
        'start_date': '2026-03-01', 'end_date': '2026-03-31'},
        headers=auth_headers(user))
    groups = {g['label']: g['total'] for g in resp.get_json()['groups']}

    # Food: 50 of Tesco + its 40 of the split. Travel: 50 Train + 60.
    assert groups['Food'] == 90.0
    assert groups['Travel'] == 110.0
    # *** AND THE ROW IS NOT COUNTED TWICE. *** 50 + 50 + 100 = 200.
    assert resp.get_json()['total'] == 200.0


def test_the_drilldown_shows_only_the_SPLIT_share_of_a_split_row(
        client, db, auth_headers):
    """Opening Food on a row split half Food, half Travel shows the Food half.

    Counting the whole row would make the panel add up to more than the slice
    it was opened from -- a figure and a caption describing different things,
    on the one screen built to explain the other.
    """
    from src.models.transaction import CategorySplit

    user, food, travel = _seed(db)
    row = _expense(user, 'Airport lunch', 100.0, datetime(2026, 3, 12), food.id)
    db.session.add(row)
    db.session.flush()
    db.session.add_all([
        CategorySplit(expense_id=row.id, category_id=food.id, amount=40.0),
        CategorySplit(expense_id=row.id, category_id=travel.id, amount=60.0),
    ])
    row.has_category_splits = True
    db.session.commit()

    resp = client.get(URL, query_string={
        'start_date': '2026-03-01', 'end_date': '2026-03-31',
        'group_by': 'merchant', 'category_id': food.id},
        headers=auth_headers(user))
    groups = {g['label']: g['total'] for g in resp.get_json()['groups']}

    assert groups == {'Tesco': 50.0, 'Airport lunch': 40.0}
    # The panel's own total equals the slice the user clicked.
    assert resp.get_json()['total'] == 90.0
