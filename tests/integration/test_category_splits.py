"""One transaction split across several categories.

`CategorySplit` is a real table and `has_category_splits` a real column, and
`src/models/budget.py` is the consumer: at line 92 it **skips** any expense carrying
the flag, then at 110 sums that expense's `CategorySplit` rows for the budget's own
category instead. So the flag and the rows are two halves of one mechanism — the flag
without rows makes the spending vanish from every budget, and rows without the flag
count it twice.

`AddTransactionForm` has a splits UI and posts `category_splits` plus
`has_category_splits`, and both were dropped with a 201 because `TransactionInput`
had neither and `validate_request` loads with `unknown=EXCLUDE`.

**The contract, decided here.** Two shapes existed and neither was reachable:

  * what the web form sends — `category_splits` as an object, `{category_id: amount}`
  * what the legacy service parsed — `category_splits_data`, a JSON *string* holding
    a *list* of `{category_id, amount}` dicts, under a different key

The form's shape wins: it is what the only live client actually sends, a dict is the
simpler JSON contract, and `category_splits_data` has no sender anywhere in either
client. The legacy reader is left alone rather than deleted, since it is reachable
from nothing and removing it is not this change's job.

Three deliberate departures from the legacy behaviour, each because the legacy choice
produced wrong numbers rather than an error:

  * **`has_category_splits` is derived, never trusted.** A client could otherwise set
    the flag with no rows and the expense would disappear from every budget.
  * **A split total that misses the transaction amount is refused, not warned about.**
    The legacy code logged a warning and carried on, which is how a budget silently
    under- or over-counts.
  * **The transaction's own `category_id` is cleared** when splits are present. The
    legacy code did this too, and it is what stops the amount being counted once
    through its own category and again through the splits.
"""
from src.extensions import db
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
    payload = dict(description='Big shop', amount=100.0, date='2026-08-05',
                   transaction_type='expense', currency_code='USD')
    payload.update(fields)
    return client.post('/api/v1/transactions', headers=auth_headers(user),
                       json=payload)


def _splits_for(description):
    row = Expense.query.filter_by(description=description).first()
    assert row is not None, 'no transaction named %r' % description
    return row, CategorySplit.query.filter_by(expense_id=row.id).all()


def test_splits_are_stored_as_rows(client, db, auth_headers):
    user = UserFactory()
    food, home = _categories(user)

    resp = _create(client, user, auth_headers, category_splits={
        str(food.id): 60.0, str(home.id): 40.0})

    assert resp.status_code == 201, resp.get_data(as_text=True)[:300]
    _, splits = _splits_for('Big shop')
    assert len(splits) == 2, (
        'the splits were accepted with a 201 and stored nowhere, so the budget '
        'attribution has nothing to read')
    assert {s.category_id: s.amount for s in splits} == {
        food.id: 60.0, home.id: 40.0}


def test_the_flag_is_derived_from_the_rows_not_taken_from_the_client(
        client, db, auth_headers):
    """`budget.py:92` skips a flagged expense, so a flag with no rows deletes the
    spending from every budget. The client must not be able to say so."""
    user = UserFactory()

    resp = _create(client, user, auth_headers, description='Lying flag',
                   has_category_splits=True)

    assert resp.status_code == 201, resp.get_data(as_text=True)[:300]
    row = Expense.query.filter_by(description='Lying flag').first()
    assert row.has_category_splits is False, (
        'the client set has_category_splits with no splits, and it was believed — '
        'this expense is now skipped by every budget and counted nowhere')


def test_the_flag_is_set_when_splits_are_present(client, db, auth_headers):
    user = UserFactory()
    food, home = _categories(user)

    _create(client, user, auth_headers, category_splits={
        str(food.id): 60.0, str(home.id): 40.0})

    row, _ = _splits_for('Big shop')
    assert row.has_category_splits is True, (
        'rows were stored without the flag, so the amount is counted twice: once '
        'through its own category and again through the splits')


def test_the_transactions_own_category_is_cleared(client, db, auth_headers):
    """Carried over from the legacy service, and the other half of not
    double-counting."""
    user = UserFactory()
    food, home = _categories(user)

    _create(client, user, auth_headers, category_id=food.id,
            category_splits={str(food.id): 60.0, str(home.id): 40.0})

    row, _ = _splits_for('Big shop')
    assert row.category_id is None, (
        'the expense kept its own category alongside the splits, so it is '
        'attributed twice')


def test_splits_that_do_not_sum_to_the_amount_are_refused(
        client, db, auth_headers):
    """The legacy code logged a warning and stored it anyway, which is how a budget
    silently under-counts."""
    user = UserFactory()
    food, home = _categories(user)

    resp = _create(client, user, auth_headers, amount=100.0, category_splits={
        str(food.id): 60.0, str(home.id): 20.0})

    assert resp.status_code == 400, (
        'accepted splits totalling 80.00 against a 100.00 transaction; got %s'
        % resp.status_code)
    assert Expense.query.filter_by(description='Big shop').first() is None


def test_a_rounding_difference_is_tolerated(client, db, auth_headers):
    """Thirds do not divide cleanly, and the legacy code allowed 0.01. Keep that —
    refusing a one-cent rounding gap would make three-way splits impossible."""
    user = UserFactory()
    a, b = _categories(user)
    c = Category(name='Cat 2', user_id=user.id)
    db.session.add(c)
    db.session.commit()

    resp = _create(client, user, auth_headers, amount=100.0, category_splits={
        str(a.id): 33.33, str(b.id): 33.33, str(c.id): 33.34})

    assert resp.status_code == 201, resp.get_data(as_text=True)[:300]


def test_splits_cannot_name_a_category_the_caller_does_not_own(
        client, db, auth_headers):
    """A raw foreign key from the client, the same class as `group_id` and
    `destination_account_id`."""
    caller = UserFactory()
    stranger = UserFactory()
    mine, = _categories(caller, 1)
    theirs = Category(name='Not yours', user_id=stranger.id)
    db.session.add(theirs)
    db.session.commit()

    resp = _create(client, caller, auth_headers, amount=100.0, category_splits={
        str(mine.id): 50.0, str(theirs.id): 50.0})

    assert resp.status_code == 400, (
        'accepted a split against a stranger-owned category; got %s'
        % resp.status_code)
    assert Expense.query.filter_by(description='Big shop').first() is None
    assert CategorySplit.query.count() == 0


def test_a_zero_or_negative_split_is_refused(client, db, auth_headers):
    user = UserFactory()
    food, home = _categories(user)

    resp = _create(client, user, auth_headers, amount=100.0, category_splits={
        str(food.id): 120.0, str(home.id): -20.0})

    assert resp.status_code == 400
    assert Expense.query.filter_by(description='Big shop').first() is None


def test_an_empty_splits_object_leaves_an_ordinary_transaction(
        client, db, auth_headers):
    """The form sends `category_splits` only when the UI has rows, but an empty
    object must not produce a flagged expense with nothing to attribute."""
    user = UserFactory()
    food, = _categories(user, 1)

    resp = _create(client, user, auth_headers, category_id=food.id,
                   category_splits={})

    assert resp.status_code == 201, resp.get_data(as_text=True)[:300]
    row = Expense.query.filter_by(description='Big shop').first()
    assert row.has_category_splits is False
    assert row.category_id == food.id, 'the real category was cleared for nothing'


def test_deleting_the_transaction_removes_its_splits(client, db, auth_headers):
    """`CategorySplit.expense` declares `cascade='all, delete-orphan'`, so this
    should already hold — pinned because orphaned split rows would keep being
    counted by `budget.py`, which joins on `expense_id`."""
    user = UserFactory()
    food, home = _categories(user)

    created = _create(client, user, auth_headers, category_splits={
        str(food.id): 60.0, str(home.id): 40.0})
    tid = created.get_json()['transaction']['id']

    client.delete('/api/v1/transactions/%d' % tid, headers=auth_headers(user))

    assert CategorySplit.query.filter_by(expense_id=tid).count() == 0, (
        'split rows outlived their transaction and are still counted by budgets')


def test_the_budget_counts_a_split_once_through_its_own_category(
        client, db, auth_headers):
    """End to end, against the only consumer.

    A 100.00 shop split 60/40 across two categories should show as 60.00 against a
    budget for the first, not 100.00 and not 0.00.
    """
    from src.models.budget import Budget

    user = UserFactory()
    food, home = _categories(user)
    budget = Budget(name='Food', amount=500.0, period='monthly',
                    category_id=food.id, user_id=user.id, active=True)
    db.session.add(budget)
    db.session.commit()

    _create(client, user, auth_headers, amount=100.0, category_splits={
        str(food.id): 60.0, str(home.id): 40.0})

    spent = budget.calculate_spent_amount()
    assert spent == 60.0, (
        'the food budget should see the 60.00 slice of a 100.00 shop, got %s'
        % spent)
