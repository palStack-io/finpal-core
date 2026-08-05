"""A transfer has to record where the money went.

`destination_account_id` is a real column on `Expense` with a relationship and an
`incoming_transfers` backref, and it is the entire point of a transfer — but it was
absent from `TransactionInput`, and `validate_request` loads with `unknown=EXCLUDE`,
so a transfer created through the API recorded **no destination** and returned 201.
`AddTransactionForm.tsx:131` sends it whenever the type is `transfer`.

That also made the transfer branch of the balance arithmetic unreachable, which is
why `balances._move` guards on `transaction_type == 'transfer' and
destination_account_id`: with no destination, debiting the source would have deleted
the money from the books. Wiring the field here makes that branch live for the first
time, so the guard now protects a real case rather than an impossible one, and
`test_account_balance_maintenance.py`'s no-destination test still pins the fallback.

Validation carried over from the legacy service, which is the only place it ever
existed: a transfer's source and destination must differ. Added on top, because the
field is a client-supplied raw foreign key of exactly the same class as `group_id`:
the destination must be an account the caller owns.
"""
from src.extensions import db
from src.models.account import Account
from src.models.transaction import Expense
from tests.factories import UserFactory


def _accounts(user, first=1000.0, second=500.0):
    a = Account(name='Checking', type='checking', balance=first,
                user_id=user.id, currency_code='USD')
    b = Account(name='Savings', type='savings', balance=second,
                user_id=user.id, currency_code='USD')
    db.session.add_all([a, b])
    db.session.commit()
    return a, b


def _balance(account_id):
    db.session.expire_all()
    return Account.query.get(account_id).balance


def _transfer(client, user, auth_headers, source, dest, amount=200.0, **extra):
    payload = dict(description='Move it', amount=amount, date='2026-08-05',
                   transaction_type='transfer', currency_code='USD',
                   account_id=source, destination_account_id=dest)
    payload.update(extra)
    return client.post('/api/v1/transactions', headers=auth_headers(user),
                       json=payload)


def test_a_transfer_records_its_destination(client, db, auth_headers):
    user = UserFactory()
    first, second = _accounts(user)

    resp = _transfer(client, user, auth_headers, first.id, second.id)

    assert resp.status_code == 201, resp.get_data(as_text=True)[:300]
    row = Expense.query.filter_by(description='Move it').first()
    assert row is not None
    assert row.destination_account_id == second.id, (
        'the transfer was accepted with a 201 and recorded no destination, so '
        'the money left one account and arrived nowhere')


def test_a_transfer_moves_the_money(client, db, auth_headers):
    """The balance branch that was unreachable until now."""
    user = UserFactory()
    first, second = _accounts(user)

    _transfer(client, user, auth_headers, first.id, second.id, amount=200.0)

    assert _balance(first.id) == 800.0, 'the source was not debited'
    assert _balance(second.id) == 700.0, 'the destination was not credited'


def test_the_response_reports_the_destination(client, db, auth_headers):
    """Same lesson as `group_id`: a response that omits a field it just stored
    tells the client the transfer went nowhere."""
    user = UserFactory()
    first, second = _accounts(user)

    resp = _transfer(client, user, auth_headers, first.id, second.id)

    assert resp.get_json()['transaction']['destination_account_id'] == second.id


def test_deleting_a_transfer_puts_the_money_back_on_both_sides(
        client, db, auth_headers):
    user = UserFactory()
    first, second = _accounts(user)

    created = _transfer(client, user, auth_headers, first.id, second.id,
                        amount=200.0)
    tid = created.get_json()['transaction']['id']

    client.delete('/api/v1/transactions/%d' % tid, headers=auth_headers(user))

    assert _balance(first.id) == 1000.0, 'the source was not credited back'
    assert _balance(second.id) == 500.0, 'the destination was not debited back'


def test_a_transfer_cannot_target_an_account_the_caller_does_not_own(
        client, db, auth_headers):
    """The field is a raw FK straight from the client, like `group_id` was.

    Without this, anyone could credit a stranger's account by guessing an integer —
    and the source being their own account makes it look like a legitimate write.
    """
    caller = UserFactory()
    stranger = UserFactory()
    mine, _ = _accounts(caller)
    theirs = Account(name='Not yours', type='checking', balance=50.0,
                     user_id=stranger.id, currency_code='USD')
    db.session.add(theirs)
    db.session.commit()

    resp = _transfer(client, caller, auth_headers, mine.id, theirs.id,
                     amount=200.0)

    assert Expense.query.filter_by(description='Move it').first() is None, (
        'a transfer was written into a stranger-owned destination account')
    assert _balance(theirs.id) == 50.0, "the stranger's balance moved"
    assert _balance(mine.id) == 1000.0, 'the source was debited anyway'
    assert resp.status_code == 400, (
        'should be rejected outright rather than accepted and stripped, which is '
        'the silent-drop failure this whole series is about; got %s'
        % resp.status_code)


def test_source_and_destination_must_differ(client, db, auth_headers):
    """Carried over from the legacy service, the only place it ever lived.

    A self-transfer nets to zero in the arithmetic, so it would be accepted and
    do nothing — a row claiming a movement that never happened.
    """
    user = UserFactory()
    first, _ = _accounts(user)

    resp = _transfer(client, user, auth_headers, first.id, first.id)

    assert Expense.query.filter_by(description='Move it').first() is None
    assert resp.status_code == 400
    assert _balance(first.id) == 1000.0


def test_a_destination_on_a_non_transfer_is_refused_not_ignored(
        client, db, auth_headers):
    """`destination_account_id` means nothing on an expense — the balance code
    only reads it for transfers.

    Refused rather than dropped: silently accepting it is how this series began.
    Safe for the web form, which only sends the field when the type is `transfer`
    (AddTransactionForm.tsx:131).
    """
    user = UserFactory()
    first, second = _accounts(user)

    resp = client.post('/api/v1/transactions', headers=auth_headers(user), json={
        'description': 'Not a transfer',
        'amount': 25.0,
        'date': '2026-08-05',
        'transaction_type': 'expense',
        'currency_code': 'USD',
        'account_id': first.id,
        'destination_account_id': second.id,
    })

    assert resp.status_code == 400, (
        'accepted a destination on an expense; got %s' % resp.status_code)
    assert Expense.query.filter_by(description='Not a transfer').first() is None


def test_changing_a_transfers_destination_moves_the_money_with_it(
        client, db, auth_headers):
    """`put` reverses the old state before applying the new one, so the account
    that was credited has to be debited back."""
    user = UserFactory()
    first, second = _accounts(user)
    third = Account(name='Third', type='savings', balance=0.0,
                    user_id=user.id, currency_code='USD')
    db.session.add(third)
    db.session.commit()

    created = _transfer(client, user, auth_headers, first.id, second.id,
                        amount=200.0)
    tid = created.get_json()['transaction']['id']
    assert _balance(second.id) == 700.0

    client.put('/api/v1/transactions/%d' % tid, headers=auth_headers(user),
               json={'destination_account_id': third.id})

    assert _balance(second.id) == 500.0, (
        'the original destination kept money it no longer receives: %s'
        % _balance(second.id))
    assert _balance(third.id) == 200.0, (
        'the new destination was not credited: %s' % _balance(third.id))
    assert _balance(first.id) == 800.0, 'the source should be unchanged'
