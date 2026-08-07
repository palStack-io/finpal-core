"""A transaction's category splits have to come back out — AUDIT D-54.

`TransactionInput` accepts `category_splits` and the update handler replaces them
wholesale, but **nothing served them back**. Verified rather than argued: a create
carrying them answers 201, the row reads back with `splits` — the per-*person*
settlement structure — and no `category_splits` key anywhere, while
`SELECT … FROM category_splits WHERE expense_id = …` on the deploy's own database
returns the rows. They were stored and unreadable.

**The consequence was a dead end the user could walk into**, and it is the reason
this is a defect rather than a missing nicety. Omitting the key on update means
"leave them alone", so both clients started their splits editor **empty** and that
was safe. But `api/v1/transactions.py:545` then refuses an amount change on a split
transaction with *"This transaction is split across categories, so its amount
cannot change without restating the splits"* — and **restating them is exactly what
no client could do**, because neither knew what they were. A message describing an
action the UI cannot offer.

**The read shape is the write shape**, deliberately: `{category_id: amount}`, the
same dict `TransactionInput` accepts. A list of objects would read and write the
same field in two different shapes, which is D-52 with extra steps, and it would
leave `transactionWireContract.test.ts`'s subset gate permanently exempting a key.
The clients already hold the category list, so names cost nothing here.

`has_category_splits` rides along because it is the flag `budget.py:92` branches on,
and a client that can see the splits should be able to see the same boolean the
server does rather than re-deriving it.
"""

from datetime import datetime

import pytest

from tests.factories import AccountFactory, CategoryFactory, ExpenseFactory, UserFactory


@pytest.fixture
def alice(db):
    return UserFactory(id='alice@test.com', name='Alice', password_plain='pw-alice')


@pytest.fixture
def alice_h(client, auth_headers, alice):
    return auth_headers(alice, password='pw-alice')


@pytest.fixture
def categories(db, alice):
    return (CategoryFactory(user_id=alice.id, name='Food'),
            CategoryFactory(user_id=alice.id, name='Travel'))


def _create(client, headers, **body):
    payload = {
        'description': 'Weekly shop',
        'amount': 100.0,
        'date': '2026-08-07',
        'transaction_type': 'expense',
    }
    payload.update(body)
    return client.post('/api/v1/transactions/', json=payload, headers=headers)


def test_a_split_transaction_reports_its_splits(client, alice_h, alice, categories):
    """The whole of D-54, on the create response."""
    food, travel = categories

    resp = _create(client, alice_h,
                   category_splits={str(food.id): 60.0, str(travel.id): 40.0})

    assert resp.status_code == 201, resp.get_json()
    body = resp.get_json()['transaction']
    assert body['category_splits'] == {str(food.id): 60.0, str(travel.id): 40.0}
    assert body['has_category_splits'] is True


def test_the_detail_route_reports_them_too(client, alice_h, alice, categories):
    """The create response is not the surface an edit form reads."""
    food, travel = categories
    created = _create(client, alice_h,
                      category_splits={str(food.id): 60.0, str(travel.id): 40.0})
    tid = created.get_json()['transaction']['id']

    resp = client.get('/api/v1/transactions/%d' % tid, headers=alice_h)

    assert resp.status_code == 200
    assert resp.get_json()['transaction']['category_splits'] == {
        str(food.id): 60.0, str(travel.id): 40.0}


def test_the_list_reports_them(client, alice_h, alice, categories):
    """`Transactions.tsx` and mobile's list both open their edit sheet from a row
    they already hold, so the field has to be on the list too or the form would
    need a second request to fill itself in."""
    food, travel = categories
    _create(client, alice_h, category_splits={str(food.id): 60.0, str(travel.id): 40.0})

    rows = client.get('/api/v1/transactions/', headers=alice_h).get_json()['transactions']

    assert rows[0]['category_splits'] == {str(food.id): 60.0, str(travel.id): 40.0}


def test_an_unsplit_transaction_reports_an_empty_map_not_null(client, alice_h, alice):
    """An empty dict, so a client can write `Object.entries(...)` without a guard
    and so "no splits" and "not told" are not the same value."""
    account = AccountFactory(user_id=alice.id)

    resp = _create(client, alice_h, account_id=account.id)

    body = resp.get_json()['transaction']
    assert body['category_splits'] == {}
    assert body['has_category_splits'] is False


def test_the_read_shape_is_exactly_the_write_shape(client, alice_h, alice, categories):
    """**Round-trip, and the point of the whole row.**

    Whatever comes out must be something that can go straight back in — otherwise
    "restate the splits" is still impossible and D-54 would be half-fixed. Feeding
    the response's own `category_splits` back as an update must be accepted and
    change nothing.
    """
    food, travel = categories
    created = _create(client, alice_h,
                      category_splits={str(food.id): 60.0, str(travel.id): 40.0})
    body = created.get_json()['transaction']

    resent = client.put('/api/v1/transactions/%d' % body['id'], headers=alice_h, json={
        'description': 'Weekly shop, corrected',
        'amount': 100.0,
        'date': '2026-08-07',
        'category_splits': body['category_splits'],
    })

    assert resent.status_code == 200, resent.get_json()
    assert resent.get_json()['transaction']['category_splits'] == body['category_splits']


def test_restating_the_splits_is_now_a_reachable_way_to_change_the_amount(
        client, alice_h, alice, categories):
    """The dead end, closed.

    Before D-54 this refusal was unanswerable from any client: the server demanded
    the splits be restated and no client could learn what they were. Asserted as
    the *pair* — the refusal still stands when the splits are not restated, and
    succeeds when they are — because deleting the refusal would also make this
    pass and would be the wrong fix.
    """
    food, travel = categories
    created = _create(client, alice_h,
                      category_splits={str(food.id): 60.0, str(travel.id): 40.0})
    tid = created.get_json()['transaction']['id']

    refused = client.put('/api/v1/transactions/%d' % tid, headers=alice_h, json={
        'description': 'Weekly shop', 'amount': 200.0, 'date': '2026-08-07'})
    assert refused.status_code == 400
    assert 'category_splits' in refused.get_json()['details']

    accepted = client.put('/api/v1/transactions/%d' % tid, headers=alice_h, json={
        'description': 'Weekly shop', 'amount': 200.0, 'date': '2026-08-07',
        'category_splits': {str(food.id): 120.0, str(travel.id): 80.0}})
    assert accepted.status_code == 200, accepted.get_json()
    assert accepted.get_json()['transaction']['category_splits'] == {
        str(food.id): 120.0, str(travel.id): 80.0}


def test_an_empty_map_clears_the_splits(client, alice_h, alice, categories):
    """**The rule the clients now depend on, pinned server-side.**

    Absent means "leave them alone"; `{}` means "there are none". Before D-54 the
    distinction was invisible, because an editor that always started empty could
    only ever mean the first. Now that the editor is prefilled, emptying it is a
    deliberate act and has to reach the server — so `{}` must really clear them,
    and `has_category_splits` must go false or `budget.py:92` would skip an
    expense that has nothing to attribute.
    """
    food, travel = categories
    created = _create(client, alice_h,
                      category_splits={str(food.id): 60.0, str(travel.id): 40.0})
    tid = created.get_json()['transaction']['id']

    cleared = client.put('/api/v1/transactions/%d' % tid, headers=alice_h, json={
        'description': 'Weekly shop', 'amount': 100.0, 'date': '2026-08-07',
        'category_splits': {}})

    assert cleared.status_code == 200, cleared.get_json()
    body = cleared.get_json()['transaction']
    assert body['category_splits'] == {}
    assert body['has_category_splits'] is False
