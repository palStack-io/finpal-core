"""Editing a transaction must honour the same fields creating one does.

`AddTransactionForm.onSubmit` builds **one** payload object and sends it to either
`transactionsApi.update(transaction.id, payload)` or `.create(payload)`
(`AddTransactionForm.tsx:145-148`). So every field the create path accepts is also
sent on an edit — but `TransactionDetail.put` reads `data` directly rather than
through `TransactionInput`, so it honours only the keys it names explicitly. When
`destination_account_id`, `split_value` and `category_splits` were wired into create
(#51), only the first got a branch in `put`. The other two were accepted with a
**200** and discarded: the same D-05 failure, now in the edit path of its own fix.

`KNOWN_DROPPED` in `test_transaction_create_payload.py` cannot see this, because it
inspects `transaction_input.fields` and `put` never goes through the schema. That is
why it fired three times on create and stayed silent here, and why
`test_the_update_path_honours_the_same_fields_as_create` below checks the handler
source instead.

The dangerous case is editing a split transaction to remove its splits: without a
branch the rows go nowhere, `has_category_splits` stays `True`, and
`src/models/budget.py:92` then skips the expense while finding no rows to attribute —
so the spending disappears from every budget. That is exactly what the derived-flag
rule prevents on create.
"""
from src.extensions import db
from src.models.account import Account
from src.models.category import Category
from src.models.transaction import CategorySplit, Expense
from tests.factories import UserFactory


def _categories(user, n=2):
    made = []
    for i in range(n):
        c = Category(name='Cat %d' % i, user_id=user.id)
        db.session.add(c)
        made.append(c)
    db.session.commit()
    return made


def _create(client, user, auth_headers, **fields):
    payload = dict(description='T', amount=100.0, date='2026-08-05',
                   transaction_type='expense', currency_code='USD')
    payload.update(fields)
    resp = client.post('/api/v1/transactions', headers=auth_headers(user),
                       json=payload)
    assert resp.status_code == 201, resp.get_data(as_text=True)[:300]
    return resp.get_json()['transaction']['id']


def _row(tid):
    db.session.expire_all()
    return Expense.query.get(tid)


def test_split_value_can_be_changed(client, db, auth_headers):
    user = UserFactory()
    tid = _create(client, user, auth_headers, split_method='percentage',
                  split_value=40.0, split_with='someone@else.com')

    resp = client.put('/api/v1/transactions/%d' % tid,
                      headers=auth_headers(user), json={'split_value': 60.0})

    assert resp.status_code == 200, resp.get_data(as_text=True)[:300]
    assert _row(tid).split_value == 60.0, (
        'the edit was accepted with a 200 and the payer share never changed')


def test_an_invalid_split_value_is_refused_on_update_too(
        client, db, auth_headers):
    user = UserFactory()
    tid = _create(client, user, auth_headers, split_method='percentage',
                  split_value=40.0, split_with='someone@else.com')

    resp = client.put('/api/v1/transactions/%d' % tid,
                      headers=auth_headers(user), json={'split_value': 150.0})

    assert resp.status_code == 400, (
        'accepted a 150%% payer share on update; got %s' % resp.status_code)
    assert _row(tid).split_value == 40.0, 'the bad value was persisted anyway'


def test_category_splits_can_be_changed(client, db, auth_headers):
    user = UserFactory()
    food, home = _categories(user)
    tid = _create(client, user, auth_headers, category_splits={
        str(food.id): 60.0, str(home.id): 40.0})

    resp = client.put('/api/v1/transactions/%d' % tid,
                      headers=auth_headers(user),
                      json={'category_splits': {str(food.id): 25.0,
                                                str(home.id): 75.0}})

    assert resp.status_code == 200, resp.get_data(as_text=True)[:300]
    splits = CategorySplit.query.filter_by(expense_id=tid).all()
    assert {s.category_id: s.amount for s in splits} == {
        food.id: 25.0, home.id: 75.0}, (
        'the new split amounts were discarded with a 200')


def test_removing_the_splits_clears_the_flag(client, db, auth_headers):
    """The failure that hides spending from every budget.

    A flagged expense with no rows is skipped by `budget.py:92` and attributed
    nowhere, so the flag has to be re-derived on update exactly as it is on create.
    """
    user = UserFactory()
    food, home = _categories(user)
    tid = _create(client, user, auth_headers, category_splits={
        str(food.id): 60.0, str(home.id): 40.0})
    assert _row(tid).has_category_splits is True

    resp = client.put('/api/v1/transactions/%d' % tid,
                      headers=auth_headers(user),
                      json={'category_splits': {}, 'category_id': food.id})

    assert resp.status_code == 200, resp.get_data(as_text=True)[:300]
    row = _row(tid)
    assert row.has_category_splits is False, (
        'the splits were removed but the flag stayed set, so this expense is now '
        'skipped by every budget and counted nowhere')
    assert CategorySplit.query.filter_by(expense_id=tid).count() == 0
    assert row.category_id == food.id, (
        'with no splits the transaction needs its own category back')


def test_adding_splits_on_update_clears_the_own_category(
        client, db, auth_headers):
    user = UserFactory()
    food, home = _categories(user)
    tid = _create(client, user, auth_headers, category_id=food.id)
    assert _row(tid).category_id == food.id

    client.put('/api/v1/transactions/%d' % tid, headers=auth_headers(user),
               json={'category_splits': {str(food.id): 60.0,
                                         str(home.id): 40.0}})

    row = _row(tid)
    assert row.has_category_splits is True
    assert row.category_id is None, (
        'the expense kept its own category alongside new splits, so it is '
        'attributed twice')


def test_splits_that_stop_matching_the_amount_are_refused(
        client, db, auth_headers):
    """Changing the amount alone would leave 60/40 against a 200.00 total, and
    `budget.py` would attribute from those stale rows regardless."""
    user = UserFactory()
    food, home = _categories(user)
    tid = _create(client, user, auth_headers, amount=100.0, category_splits={
        str(food.id): 60.0, str(home.id): 40.0})

    resp = client.put('/api/v1/transactions/%d' % tid,
                      headers=auth_headers(user), json={'amount': 200.0})

    assert resp.status_code == 400, (
        "changing a split transaction's amount without restating the splits was "
        'accepted; got %s' % resp.status_code)
    assert _row(tid).amount == 100.0, 'the amount changed anyway'
    splits = CategorySplit.query.filter_by(expense_id=tid).all()
    assert sum(s.amount for s in splits) == 100.0


def test_the_amount_and_splits_can_be_changed_together(client, db, auth_headers):
    """The legitimate version of the edit above."""
    user = UserFactory()
    food, home = _categories(user)
    tid = _create(client, user, auth_headers, amount=100.0, category_splits={
        str(food.id): 60.0, str(home.id): 40.0})

    resp = client.put('/api/v1/transactions/%d' % tid,
                      headers=auth_headers(user),
                      json={'amount': 200.0,
                            'category_splits': {str(food.id): 120.0,
                                                str(home.id): 80.0}})

    assert resp.status_code == 200, resp.get_data(as_text=True)[:300]
    assert _row(tid).amount == 200.0
    splits = CategorySplit.query.filter_by(expense_id=tid).all()
    assert sum(s.amount for s in splits) == 200.0


def test_splits_on_update_cannot_name_a_foreign_category(
        client, db, auth_headers):
    caller = UserFactory()
    stranger = UserFactory()
    mine, = _categories(caller, 1)
    theirs = Category(name='Not yours', user_id=stranger.id)
    db.session.add(theirs)
    db.session.commit()
    tid = _create(client, caller, auth_headers, amount=100.0,
                  category_splits={str(mine.id): 100.0})

    resp = client.put('/api/v1/transactions/%d' % tid,
                      headers=auth_headers(caller),
                      json={'category_splits': {str(mine.id): 50.0,
                                                str(theirs.id): 50.0}})

    assert resp.status_code == 400
    splits = CategorySplit.query.filter_by(expense_id=tid).all()
    assert {s.category_id for s in splits} == {mine.id}, (
        'a stranger-owned category was attached on update')


def test_a_rejected_update_leaves_nothing_behind(client, db, auth_headers):
    """The handler mutates the ORM object before validating, so a 400 has to roll
    the session back or the rejected change commits with whatever comes next."""
    user = UserFactory()
    acct = Account(name='Chk', type='checking', balance=1000.0,
                   user_id=user.id, currency_code='USD')
    db.session.add(acct)
    db.session.commit()
    tid = _create(client, user, auth_headers, amount=100.0, account_id=acct.id)

    client.put('/api/v1/transactions/%d' % tid, headers=auth_headers(user),
               json={'amount': 500.0, 'split_method': 'percentage',
                     'split_value': 900.0})

    db.session.expire_all()
    assert _row(tid).amount == 100.0, 'the rejected amount was persisted'
    assert Account.query.get(acct.id).balance == 900.0, (
        'the balance moved for an update that was refused: %s'
        % Account.query.get(acct.id).balance)


def test_the_update_path_honours_the_same_fields_as_create(client, db):
    """The invariant `KNOWN_DROPPED` cannot express.

    That gate reads `transaction_input.fields`, and `put` never goes through the
    schema — which is why it caught three fields on create and none here. This
    reads the handler source instead, so a field wired into create but forgotten in
    `put` fails rather than being silently discarded with a 200.
    """
    import inspect

    from api.v1 import transactions as module

    source = inspect.getsource(module.TransactionDetail.put)
    for field in ('destination_account_id', 'split_value', 'category_splits'):
        assert "'%s' in data" % field in source, (
            '`put` has no branch for %r, so an edit sending it gets a 200 and '
            'loses it' % field)
