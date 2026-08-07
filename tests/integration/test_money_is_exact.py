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
    """
    account = AccountFactory(user_id=alice.id, balance=1104.55, type='checking')

    for _ in range(100):
        created = client.post('/api/v1/transactions/', headers=alice_h, json={
            'description': 'x', 'amount': 0.1, 'date': '2026-08-07',
            'transaction_type': 'expense', 'account_id': account.id})
        client.delete('/api/v1/transactions/%d' % created.get_json()['transaction']['id'],
                      headers=alice_h)

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
