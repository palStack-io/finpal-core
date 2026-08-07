"""Money is stored as decimal, and arithmetic on it is exact — AUDIT D-58.

**The probe that opened this row, run as a test.** On the deploy, creating a
$1,000 income on an account holding 1104.55 and then deleting it again left the
balance at **1104.5500000000002**. Read straight out of Postgres, and corrected by
hand. One round trip costs ~2e-13.

The size is not the point. `Account.balance` is a stored column mutated **in
place** — each write applies a delta, and **nothing ever re-derives it from the
transactions that produced it** — so the error accumulates and never self-corrects.
An account edited for years has no mechanism to converge back, and `balance` is
what the Accounts page sums into net worth.

**The cheap fix that this row originally proposed is impossible**, which is worth
stating because it is the obvious idea: "recompute from the rows instead of
applying a delta" needs an opening balance to recompute *from*, and `Account` has
no such column — `balance` is the only record, set once at creation and mutated
thereafter. So the columns themselves had to change.

WHY THESE TESTS CAN RUN ON SQLITE AT ALL. SQLite has no native decimal type, and
SQLAlchemy warns as much — but it still returns `Decimal` for a `Numeric` column,
so the *arithmetic* here is decimal arithmetic on both engines and the exactness
assertions are meaningful in CI. What CI **cannot** show is the stored
representation: that is checked against the deploy's own Postgres with psql,
because `NUMERIC` versus `DOUBLE PRECISION` in the actual DDL is the half a green
suite would happily lie about (`create_all()` creates missing *tables* and does not
alter existing *columns*, so a model change alone is a silent no-op on a database
that already exists).
"""

from datetime import datetime
from decimal import Decimal

import pytest

from src.extensions import db
from src.models.transaction import Expense
from tests.factories import AccountFactory, UserFactory


@pytest.fixture
def alice(db):
    return UserFactory(id='alice@test.com', name='Alice', password_plain='pw-alice')


@pytest.fixture
def alice_h(client, auth_headers, alice):
    return auth_headers(alice, password='pw-alice')


def _balance(account_id):
    from src.models.account import Account
    db.session.expire_all()
    return Account.query.get(account_id).balance


def test_the_exact_probe_that_opened_this_row(client, alice_h, alice):
    """Create a transaction, delete it, and require the balance to be **exactly**
    where it started.

    This is the deploy's 1104.55 → 1104.5500000000002 in miniature, and it is the
    assertion D-58 exists for. Everything else in this file supports it.
    """
    account = AccountFactory(user_id=alice.id, balance=1104.55, type='checking')
    before = _balance(account.id)

    created = client.post('/api/v1/transactions/', headers=alice_h, json={
        'description': 'round trip', 'amount': 1000.0, 'date': '2026-08-07',
        'transaction_type': 'income', 'account_id': account.id})
    assert created.status_code == 201, created.get_json()

    client.delete('/api/v1/transactions/%d' % created.get_json()['transaction']['id'],
                  headers=alice_h)

    assert _balance(account.id) == before
    assert _balance(account.id) == Decimal('1104.55')


def test_a_hundred_round_trips_do_not_drift(client, alice_h, alice):
    """The reason the size of one error does not matter.

    Nothing re-derives a balance, so whatever each write costs is permanent and
    additive. With floats this ends somewhere near 1104.5500000000186; with
    decimals it ends where it started, however many times it runs.

    `0.07` rather than `0.1`, and checked rather than assumed: SQLite has no
    native decimal and SQLAlchemy round-trips `Numeric` through float there, so a
    value that happens to survive that round trip would make this read stronger
    than it is. 0.07 does not divide cleanly in binary and still lands exactly, on
    the engine CI actually runs. The stored *representation* is still only
    provable on Postgres — see this file's docstring — and is, with psql.
    """
    account = AccountFactory(user_id=alice.id, balance=1104.55, type='checking')

    # Both halves of every round trip are checked, and that is not defensive
    # padding — it is the difference between a diagnosis and a mystery.
    #
    # This test failed once on main (the Flask 3 merge, #88) with
    # `Decimal('1104.48') != Decimal('1104.55')`. 1104.55 - 1104.48 is exactly
    # 0.07: ONE transaction's worth, so one delete of the hundred did not take
    # effect. Unasserted, that surfaced as "money drifted by 7p" in the test
    # whose entire subject is that money does not drift — pointing at D-58,
    # which was fine, instead of at a single failed request.
    #
    # A drift bug and a dropped request produce the same number here and need
    # opposite fixes, so the loop now says which one happened.
    for i in range(100):
        created = client.post('/api/v1/transactions/', headers=alice_h, json={
            'description': 'x', 'amount': 0.07, 'date': '2026-08-07',
            'transaction_type': 'expense', 'account_id': account.id})
        assert created.status_code in (200, 201), (
            f'create {i} failed with {created.status_code}: {created.get_json()}')

        transaction_id = created.get_json()['transaction']['id']
        deleted = client.delete('/api/v1/transactions/%d' % transaction_id,
                                headers=alice_h)
        assert deleted.status_code in (200, 204), (
            f'delete {i} failed with {deleted.status_code}: {deleted.get_json()}. '
            f'The balance below would be off by exactly 0.07 per dropped delete, '
            f'which reads as drift and is not.')

        # *** THE STATUS CODE ABOVE IS NOT ENOUGH, AND D-61 PROVED IT. ***
        #
        # The assertion added in #90 was supposed to tell a dropped request apart
        # from drift. It cannot see the failure that actually happened: when a
        # concurrent writer rolled this session's work back, `db.session.commit()`
        # committed an *empty* transaction and raised nothing, so the handler
        # answered a truthful **200** with the row still on disk. Measured — one
        # such delete in 400 under D-61's race, with `delete_failed` at zero.
        #
        # So the check has to be the database, which is this project's own rule
        # and the reason the row was found at all: assert on rendered output, a
        # payload, or the database, never a status code.
        assert Expense.query.filter(Expense.id == transaction_id).count() == 0, (
            f'delete {i} answered {deleted.status_code} and the row SURVIVED. '
            f'This is a lost write, not drift: the balance below will be off by '
            f'0.07 for each one. Something rolled this request back — check '
            f'whether a background thread is sharing the connection (D-61).')

    assert Expense.query.count() == 0, (
        f'{Expense.query.count()} transaction rows survived 100 deletes; the '
        f'balance assertion below is measuring lost writes, not drift.')

    assert _balance(account.id) == Decimal('1104.55')


def test_the_classic_case_adds_up(client, alice_h, alice):
    """0.1 + 0.2. In binary floating point that is 0.30000000000000004, and a
    three-way split of it is what `_validated_category_splits` refuses with "the
    split amounts must add up"."""
    account = AccountFactory(user_id=alice.id, balance=0, type='checking')

    for amount in (0.1, 0.2):
        resp = client.post('/api/v1/transactions/', headers=alice_h, json={
            'description': 'x', 'amount': amount, 'date': '2026-08-07',
            'transaction_type': 'income', 'account_id': account.id})
        assert resp.status_code == 201, resp.get_json()

    assert _balance(account.id) == Decimal('0.3')


def test_money_columns_are_decimal_not_binary_float(db):
    """**Keyed to `Float`, not to `Numeric` — and that distinction is the whole
    test.**

    In SQLAlchemy `Float` is a *subclass* of `Numeric`, so
    `isinstance(col.type, Numeric)` is `True` for a column that has not been
    converted at all. A gate written that way would certify success while
    inspecting nothing, which is the failure mode this project has now hit five
    times. This asserts the column is **not a Float**, and that it really returns
    `Decimal` (`asdecimal`), which is what makes the arithmetic above exact.

    `import_source.confidence` is deliberately absent: it is a 0..1 heuristic
    score that never touches money, and converting it would be scope creep.
    """
    from sqlalchemy import Float

    from src.models.account import Account
    from src.models.budget import Budget
    from src.models.group import Settlement
    from src.models.investment import Investment, InvestmentTransaction
    from src.models.recurring import IgnoredRecurringPattern, RecurringExpense
    from src.models.transaction import CategorySplit, Expense
    from src.models.transaction_rule import TransactionRule

    money = [
        (Account, 'balance'),
        (Expense, 'amount'), (Expense, 'original_amount'), (Expense, 'split_value'),
        (CategorySplit, 'amount'),
        (Budget, 'amount'), (Budget, 'rollover_amount'),
        (Settlement, 'amount'),
        (RecurringExpense, 'amount'), (RecurringExpense, 'original_amount'),
        (RecurringExpense, 'split_value'),
        (IgnoredRecurringPattern, 'amount'),
        (TransactionRule, 'amount_min'), (TransactionRule, 'amount_max'),
        (Investment, 'shares'), (Investment, 'purchase_price'), (Investment, 'current_price'),
        (InvestmentTransaction, 'shares'), (InvestmentTransaction, 'price'),
        (InvestmentTransaction, 'fees'),
    ]

    offenders = []
    for model, field in money:
        column = getattr(model, field).property.columns[0]
        if isinstance(column.type, Float) or not getattr(column.type, 'asdecimal', False):
            offenders.append('%s.%s is %r' % (model.__name__, field, column.type))

    assert not offenders, (
        'these hold money and are still binary floating point, so their errors '
        'accumulate and never re-derive: %s' % '; '.join(offenders))


def test_money_still_reaches_the_clients_as_a_json_number(client, alice_h, alice):
    """**The contract D-58 must not break on its way out.**

    `Decimal` is not JSON-serialisable, so something has to convert it — and the
    choice of what to convert it *to* is a client-visible contract, not an
    implementation detail. Both apps read these as numbers; emitting strings
    would be a silent breaking change across two codebases that no backend test
    would notice.

    Two encoders had to learn this, which is the part worth pinning: Flask's JSON
    provider covers `jsonify`, and **flask-restx does not use it** — its
    `output_json` calls the standard library's `dumps` directly with whatever is
    in `RESTX_JSON`. Setting only the first leaves every `/api/v1` response
    500ing on a `Decimal`. Asserted on the raw body text so a helpful test client
    cannot coerce the answer.
    """
    import json as _json

    account = AccountFactory(user_id=alice.id, balance=1104.55, type='checking')
    client.post('/api/v1/transactions/', headers=alice_h, json={
        'description': 'x', 'amount': 12.34, 'date': '2026-08-07',
        'transaction_type': 'expense', 'account_id': account.id})

    body = client.get('/api/v1/transactions/', headers=alice_h).get_data(as_text=True)
    row = _json.loads(body)['transactions'][0]

    assert isinstance(row['amount'], (int, float)), (
        'amount arrived as %r — the wire contract changed' % type(row['amount']))
    assert '"amount": "' not in body and '"amount":"' not in body

    accounts = _json.loads(
        client.get('/api/v1/accounts', headers=alice_h).get_data(as_text=True))
    assert isinstance(accounts['accounts'][0]['balance'], (int, float))


def test_the_analytics_dashboard_survives_decimal_totals(client, alice_h, alice):
    """The hand-built dicts, as opposed to the schema-serialised ones.

    marshmallow's `fields.Float` coerces on dump, so every schema response was
    always going to be fine. `/analytics/dashboard` assembles its totals into a
    plain dict, which is exactly where "Object of type Decimal is not JSON
    serializable" would land — as a 500, on the busiest screen in the app.
    """
    account = AccountFactory(user_id=alice.id, balance=1104.55, type='checking')
    client.post('/api/v1/transactions/', headers=alice_h, json={
        'description': 'x', 'amount': 12.34, 'date': '2026-08-07',
        'transaction_type': 'expense', 'account_id': account.id})

    resp = client.get('/api/v1/analytics/dashboard', headers=alice_h)

    assert resp.status_code == 200, resp.get_json()
    assert resp.get_json()['data']['total_expenses_only'] == pytest.approx(12.34)
