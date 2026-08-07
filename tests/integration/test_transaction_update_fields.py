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


# Fields the create path accepts that `put` deliberately does not handle. Empty, and
# that is the point: every field of `TransactionInput` should be editable, because the
# web form posts one payload object to both endpoints. An entry here needs a reason.
UPDATE_EXEMPT = set()


def test_the_update_path_honours_every_field_create_accepts(client, db):
    """The invariant, derived from the schema rather than from a list of known cases.

    Two things this replaces, and the reason it is shaped this way:

    `KNOWN_DROPPED` in `test_transaction_create_payload.py` cannot see the update path
    at all — it inspects `transaction_input.fields`, and `put` reads `data` directly —
    which is why it fired three times on create and stayed silent while the edit path
    dropped `split_value` and `category_splits`.

    The first version of *this* test then hardcoded those same three field names, and
    so was blind in turn to `group_id` and `paid_by`, which had never had a `put`
    branch either. A check keyed to a list only ever catches the cases already known;
    keying it to the mechanism — every field the schema accepts — catches the next one
    too.
    """
    import inspect

    from api.v1 import transactions as module
    from schemas.input_schemas import transaction_input

    source = inspect.getsource(module.TransactionDetail.put)
    missing = sorted(
        field for field in transaction_input.fields
        if field not in UPDATE_EXEMPT and "'%s' in data" % field not in source)

    assert not missing, (
        '`put` has no branch for these, so an edit sending them gets a 200 and '
        'loses them — wire them up, or add them to UPDATE_EXEMPT with a reason: %s'
        % missing)


def test_group_id_can_be_changed(client, db, auth_headers):
    """Moving a transaction into a group, or out of one.

    `GroupDetail.tsx:88` lists a group's transactions with `?group_id=`, so a
    correction that is silently dropped never appears where the user is looking.
    """
    from src.models.group import Group

    user = UserFactory()
    group = Group(name='Flat', created_by=user.id, default_split_method='equal',
                  auto_include_all=False)
    group.members.append(user)
    db.session.add(group)
    db.session.commit()
    tid = _create(client, user, auth_headers)

    resp = client.put('/api/v1/transactions/%d' % tid,
                      headers=auth_headers(user), json={'group_id': group.id})

    assert resp.status_code == 200, resp.get_data(as_text=True)[:300]
    assert _row(tid).group_id == group.id, (
        'the edit was accepted with a 200 and the transaction never joined the '
        'group')

    cleared = client.put('/api/v1/transactions/%d' % tid,
                         headers=auth_headers(user), json={'group_id': None})
    assert cleared.status_code == 200
    assert _row(tid).group_id is None, 'a transaction cannot be taken out of a group'


def test_group_id_on_update_is_membership_checked(client, db, auth_headers):
    """The same check create does. Without it, `put` is a way around it."""
    from src.models.group import Group

    caller = UserFactory()
    owner = UserFactory()
    theirs = Group(name='Not yours', created_by=owner.id,
                   default_split_method='equal', auto_include_all=False)
    theirs.members.append(owner)
    db.session.add(theirs)
    db.session.commit()
    tid = _create(client, caller, auth_headers)

    resp = client.put('/api/v1/transactions/%d' % tid,
                      headers=auth_headers(caller),
                      json={'group_id': theirs.id})

    assert resp.status_code == 400, (
        'a non-member moved a transaction into a stranger\'s group; got %s'
        % resp.status_code)
    assert _row(tid).group_id is None


def test_paid_by_reaches_the_row_on_update(client, db, auth_headers):
    """That `put` has a working `paid_by` branch at all.

    This test originally set the payer to an unrelated user on an *ungrouped*
    transaction, and passed — which is precisely the hole automated review flagged on
    the commit that added the branch. It now asserts the same plumbing within the
    rule: the value reaches the row, and the caller naming themselves is always
    valid. Who *else* may be named is covered by
    `test_paid_by_may_be_another_member_of_the_transactions_group` and the two
    refusal tests below.
    """
    user = UserFactory()
    other = UserFactory()
    tid = _create(client, user, auth_headers)

    # Start from a state where someone else is the payer, set up directly rather
    # than through the API, since the API now refuses to put it there.
    _row(tid).paid_by = other.id
    db.session.commit()

    resp = client.put('/api/v1/transactions/%d' % tid,
                      headers=auth_headers(user), json={'paid_by': user.id})

    assert resp.status_code == 200, resp.get_data(as_text=True)[:300]
    assert _row(tid).paid_by == user.id, (
        'the payer correction was accepted with a 200 and discarded')


def test_paid_by_must_be_a_real_user(client, db, auth_headers):
    """`paid_by` decides who owes whom, so it cannot be an arbitrary string.

    Flagged by automated review on the branch that first gave `paid_by` a `put`
    branch: assigning it unchecked lets a caller attribute their own spending to
    anyone, and the named user then carries it in `calculate_splits`.
    """
    user = UserFactory()
    tid = _create(client, user, auth_headers)

    resp = client.put('/api/v1/transactions/%d' % tid,
                      headers=auth_headers(user),
                      json={'paid_by': 'nobody@nowhere.invalid'})

    assert resp.status_code == 400, (
        'accepted a payer who does not exist; got %s' % resp.status_code)
    assert _row(tid).paid_by == user.id


def test_paid_by_cannot_name_a_stranger_on_an_ungrouped_transaction(
        client, db, auth_headers):
    """`paid_by` decides who owes whom, so it cannot be an arbitrary id.

    **The rule widened on 2026-08-06 and this test was re-keyed with it — D-49.** It
    used to be "with no group, the only honest value is the caller", and its
    docstring rejected the household as a boundary because `get_all_user_ids()`
    returns every user on the instance *including demo accounts*. `visible_user_ids`
    does not, so the boundary is usable now: a housemate really can have fronted the
    cash for a row on your card, and refusing that made the household transactions
    list unusable — an account owner editing a housemate's row was refused with a
    `paid_by` error naming a field they never sent.

    So the outsider here is a **demo account**: on the instance, not in the
    household, and holding a password published in this repository. That is the
    boundary that still exists, and the one worth a test.
    """
    user = UserFactory()
    stranger = UserFactory(id='demo-paidby@finpal.demo', is_demo_user=True)
    tid = _create(client, user, auth_headers)

    resp = client.put('/api/v1/transactions/%d' % tid,
                      headers=auth_headers(user), json={'paid_by': stranger.id})

    assert resp.status_code == 400, (
        "a stranger was recorded as having paid the caller's ungrouped expense; "
        'got %s' % resp.status_code)
    assert _row(tid).paid_by == user.id


def test_paid_by_may_be_another_member_of_the_transactions_group(
        client, db, auth_headers):
    """The legitimate case, and the one the rule must not break.

    `GroupDetail.tsx:115` records a settlement with `paid_by` set to another
    member's id, alongside that group's `group_id`.
    """
    from src.models.group import Group

    payer = UserFactory()
    other = UserFactory()
    group = Group(name='Flat', created_by=payer.id,
                  default_split_method='equal', auto_include_all=False)
    group.members.extend([payer, other])
    db.session.add(group)
    db.session.commit()
    tid = _create(client, payer, auth_headers, group_id=group.id)

    resp = client.put('/api/v1/transactions/%d' % tid,
                      headers=auth_headers(payer), json={'paid_by': other.id})

    assert resp.status_code == 200, resp.get_data(as_text=True)[:300]
    assert _row(tid).paid_by == other.id


def test_paid_by_may_be_a_housemate_on_an_ungrouped_transaction(
        client, db, auth_headers):
    """The case D-49 opened, pinned so the widening cannot silently un-widen.

    Without this, re-tightening `validate_paid_by` back to "only the caller" would
    leave every other test in this file green while making the household
    transactions list unusable again.
    """
    user = UserFactory()
    housemate = UserFactory()
    tid = _create(client, user, auth_headers)

    resp = client.put('/api/v1/transactions/%d' % tid,
                      headers=auth_headers(user), json={'paid_by': housemate.id})

    assert resp.status_code == 200, resp.get_data(as_text=True)[:300]
    assert _row(tid).paid_by == housemate.id


def test_paid_by_is_checked_on_create_too(client, db, auth_headers):
    """Both paths, or `put` and `post` disagree — the asymmetry this file exists
    for. D-49 widened the rule on both, so the outsider is a demo account on both.
    """
    user = UserFactory()
    stranger = UserFactory(id='demo-paidby-create@finpal.demo', is_demo_user=True)

    resp = client.post('/api/v1/transactions', headers=auth_headers(user), json={
        'description': 'Not yours to attribute',
        'amount': 10.0,
        'date': '2026-08-05',
        'transaction_type': 'expense',
        'currency_code': 'USD',
        'paid_by': stranger.id,
    })

    assert resp.status_code == 400, (
        'create accepted a stranger as payer; got %s' % resp.status_code)
    assert Expense.query.filter_by(
        description='Not yours to attribute').first() is None
