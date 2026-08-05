"""`Account.balance` must track the transactions written against it.

`Account.balance` is a stored column, and it is the only source of truth for what
an account holds: `AccountSchema.get_current_balance` calls `obj.get_balance()` if
it exists and `Account` defines no such method, so `current_balance` is simply the
stored value under another name. `web-ui/src/pages/Accounts.tsx:45` displays it, and
lines 137-139 sum it into the page's net worth, assets and liabilities totals.

It stopped being maintained in two halves, both by moving traffic from the legacy
blueprint to flask-restx:

  * **update and delete** — PR #42 retired the legacy detail handlers.
    `TransactionDetail.put` and `.delete` mutate and delete the row without
    touching either account.
  * **create** — PR #45 retired the legacy create handler, which removed the only
    caller of `TransactionService.add_transaction` and therefore of
    `_update_account_balances_on_add`.

Proven by running one probe against both commits: on `f0797b5` a 100.00 expense
against a 1000.00 account left it at 900.00; on the merge of #45 it left it at
1000.00.

So all three operations are covered here rather than just the create. Fixing create
alone would be worse than the symmetric no-op: balances would fall on every write
and never come back, which is permanent one-way drift.

Every assertion reads the account row from the database. A balance bug returns 200
and renders a plausible number, which is the whole reason this suite exists.

Scope, deliberately limited to the API write paths. Three other places build an
`Expense` and have *never* applied a balance, so they are pre-existing behaviour
rather than part of this regression, and each needs its own decision:
`src/services/csv_import/mapper.py`, `src/services/recurring/service.py` and
`integrations/recurring/detector.py` — all with zero references to `balance`.
Materialising a recurring transaction arguably should move one. SimpleFin is the
exception that should *not*: `integrations/simplefin/client.py` writes the balance
the bank reports, so applying a delta on top would double-count it.
"""
from datetime import datetime

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


def _create(client, user, auth_headers, **fields):
    payload = dict(description='T', amount=100.0, date='2026-08-05',
                   transaction_type='expense', currency_code='USD',
                   split_method='equal')
    payload.update(fields)
    return client.post('/api/v1/transactions', headers=auth_headers(user),
                       json=payload)


def test_an_expense_reduces_the_account_balance(client, db, auth_headers):
    user = UserFactory()
    acct, _ = _accounts(user)

    resp = _create(client, user, auth_headers, description='Shopping',
                   amount=100.0, account_id=acct.id)

    assert resp.status_code == 201, resp.get_data(as_text=True)[:200]
    assert _balance(acct.id) == 900.0, (
        'a 100.00 expense against a 1000.00 account left it at %s'
        % _balance(acct.id))


def test_income_increases_the_account_balance(client, db, auth_headers):
    user = UserFactory()
    acct, _ = _accounts(user)

    _create(client, user, auth_headers, description='Salary', amount=250.0,
            transaction_type='income', account_id=acct.id)

    assert _balance(acct.id) == 1250.0


def test_deleting_a_transaction_puts_the_money_back(client, db, auth_headers):
    """The half that makes fixing create alone dangerous."""
    user = UserFactory()
    acct, _ = _accounts(user)

    created = _create(client, user, auth_headers, description='Oops',
                      amount=40.0, account_id=acct.id)
    tid = created.get_json()['transaction']['id']
    assert _balance(acct.id) == 960.0, 'create did not move the balance'

    client.delete('/api/v1/transactions/%d' % tid, headers=auth_headers(user))

    assert _balance(acct.id) == 1000.0, (
        'deleting the transaction left the balance at %s instead of restoring '
        '1000.00 — balances would drift one way for ever' % _balance(acct.id))


def test_changing_an_amount_adjusts_by_the_difference(client, db, auth_headers):
    user = UserFactory()
    acct, _ = _accounts(user)

    created = _create(client, user, auth_headers, description='Fix me',
                      amount=100.0, account_id=acct.id)
    tid = created.get_json()['transaction']['id']

    client.put('/api/v1/transactions/%d' % tid, headers=auth_headers(user),
               json={'amount': 150.0})

    assert _balance(acct.id) == 850.0, (
        'raising a 100.00 expense to 150.00 should leave 850.00, got %s'
        % _balance(acct.id))


def test_moving_a_transaction_between_accounts_moves_the_money(
        client, db, auth_headers):
    """`put` applies `account_id` conditionally, so the old account has to be
    credited back from the value the row held *before* the update."""
    user = UserFactory()
    first, second = _accounts(user)

    created = _create(client, user, auth_headers, description='Wrong account',
                      amount=75.0, account_id=first.id)
    tid = created.get_json()['transaction']['id']

    client.put('/api/v1/transactions/%d' % tid, headers=auth_headers(user),
               json={'account_id': second.id})

    assert _balance(first.id) == 1000.0, (
        'the original account was not credited back: %s' % _balance(first.id))
    assert _balance(second.id) == 425.0, (
        'the new account was not debited: %s' % _balance(second.id))


def test_changing_an_expense_to_income_flips_the_sign(client, db, auth_headers):
    user = UserFactory()
    acct, _ = _accounts(user)

    created = _create(client, user, auth_headers, description='Miscategorised',
                      amount=60.0, account_id=acct.id)
    tid = created.get_json()['transaction']['id']
    assert _balance(acct.id) == 940.0

    client.put('/api/v1/transactions/%d' % tid, headers=auth_headers(user),
               json={'transaction_type': 'income'})

    assert _balance(acct.id) == 1060.0, (
        'an expense corrected to income should add rather than subtract, '
        'leaving 1060.00; got %s' % _balance(acct.id))


def test_a_transfer_without_a_destination_moves_nothing(client, db, auth_headers):
    """Deliberately pinned as a no-op, and it must stay one until
    `destination_account_id` is actually accepted.

    `destination_account_id` is dropped at the schema layer (`TransactionInput`
    has no such field and `validate_request` uses `unknown=EXCLUDE`), so a
    transfer currently records no destination. Debiting the source anyway would
    make the money vanish, which is strictly worse than doing nothing — so the
    guard is `transaction_type == 'transfer' and destination_account_id`.
    """
    user = UserFactory()
    first, second = _accounts(user)

    _create(client, user, auth_headers, description='Move it', amount=200.0,
            transaction_type='transfer', account_id=first.id,
            destination_account_id=second.id)

    assert _balance(first.id) == 1000.0, (
        'the source was debited for a transfer with no recorded destination, so '
        '200.00 left the books entirely')
    assert _balance(second.id) == 500.0


def test_a_transfer_with_a_destination_moves_money_between_accounts(
        client, db, auth_headers):
    """The arithmetic the guard protects, exercised at the service layer since the
    API cannot yet supply a destination. This is what has to keep working when
    `destination_account_id` is wired up."""
    from src.services.transaction.balances import apply_on_add

    user = UserFactory()
    first, second = _accounts(user)
    transfer = Expense(
        description='Real transfer', amount=200.0, date=datetime(2026, 8, 5),
        user_id=user.id, paid_by=user.id, card_used='', split_method='equal',
        transaction_type='transfer', account_id=first.id,
        destination_account_id=second.id)
    db.session.add(transfer)
    db.session.commit()

    apply_on_add(transfer)
    db.session.commit()

    assert _balance(first.id) == 800.0
    assert _balance(second.id) == 700.0


def test_a_transaction_with_no_account_is_harmless(client, db, auth_headers):
    """Cash transactions carry no account. Nothing to update, and nothing should
    raise."""
    user = UserFactory()
    acct, _ = _accounts(user)

    resp = _create(client, user, auth_headers, description='Cash', amount=15.0)

    assert resp.status_code == 201, resp.get_data(as_text=True)[:200]
    assert _balance(acct.id) == 1000.0


def test_an_approved_proposal_moves_the_balance_like_a_direct_write(
        client, db, auth_headers):
    """The two write paths must not diverge here.

    `creation.build_transaction` is shared so an approved agent proposal builds the
    same row as a direct POST. Balance application happens where the row is
    persisted, not in `build_transaction`, so it is exactly the kind of step an
    alternative persist path can miss while still producing an identical Expense.
    """
    from src.services.transaction.creation import create_transaction

    user = UserFactory()
    acct, _ = _accounts(user)

    create_transaction({
        'description': 'Via the shared helper',
        'amount': 30.0,
        'date': '2026-08-05',
        'transaction_type': 'expense',
        'currency_code': 'USD',
        'account_id': acct.id,
    }, user.id)

    assert _balance(acct.id) == 970.0, (
        'create_transaction persisted the row without applying the balance, so '
        'an approved proposal and a direct POST disagree; got %s'
        % _balance(acct.id))
