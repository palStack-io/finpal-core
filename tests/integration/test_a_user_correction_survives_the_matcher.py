"""A correction a person made must outlive the next sync — through the API.

*** THE PROTECTION EXISTS, IS TESTED, AND NOTHING IN PRODUCTION CAN REACH IT. ***
`match_transfers` filters candidates on `type_source != 'user'` in two places and
`test_transfer_matching.py` proves both directions work. Both of those tests set
`row.type_source = 'user'` **on the ORM object, inside the test**. Grep `api/`
and `src/` for a write of `Expense.type_source` and there is none — so no user
action anywhere in finPal can produce the state the guard defends.

That is `a helper's own test is not proof of its adoption` (D-106) wearing a
different hat: a guard whose precondition is unreachable is a guard that cannot
fire, and 2,095 green tests say it works.

*** SO THIS FILE ASSERTS THROUGH THE HTTP PATH, NEVER BY SETTING THE COLUMN. ***
If it ever becomes possible to make it pass by touching `type_source` directly,
it has stopped testing the thing it is for.
"""

from datetime import datetime
from decimal import Decimal

import pytest

from src.extensions import db as _db
from src.models.transaction import Expense
from src.services.transaction.transfer_match import match_transfers
from tests.factories import UserFactory, AccountFactory, ExpenseFactory

SEP = datetime(2026, 9, 11)


@pytest.fixture
def user(db):
    return UserFactory(id='correct@test.com', name='Correcting')


@pytest.fixture
def accounts(user):
    a = AccountFactory(user_id=user.id, name='Current', type='checking',
                       balance=Decimal('1000'))
    b = AccountFactory(user_id=user.id, name='Savings', type='savings',
                       balance=Decimal('5000'))
    _db.session.commit()
    return a, b


def _txn(user, account, amount, ttype, desc='Moved money'):
    return ExpenseFactory(user_id=user.id, account_id=account.id,
                          amount=Decimal(amount), transaction_type=ttype,
                          date=SEP, description=desc)


def _reread(row_id):
    """Read the row back, never the object the test is holding."""
    _db.session.expire_all()
    return Expense.query.get(row_id)


def test_CORRECTING_A_TYPE_THROUGH_THE_API_MARKS_IT_AS_THE_USERS(
        client, auth_headers, user, accounts):
    """The write that makes every other guarantee in this file possible."""
    a, _ = accounts
    row = _txn(user, a, '500.00', 'income')
    _db.session.commit()

    resp = client.put(f'/api/v1/transactions/{row.id}',
                      json={'transaction_type': 'expense'},
                      headers=auth_headers(user))

    assert resp.status_code == 200, resp.get_json()
    fresh = _reread(row.id)
    assert fresh.transaction_type == 'expense'
    assert fresh.type_source == 'user'


def test_A_CORRECTION_MADE_THROUGH_THE_API_SURVIVES_THE_MATCHER(
        client, auth_headers, user, accounts):
    """*** THE ONE THAT MATTERS, AND THE ONE NO EXISTING TEST COVERS. ***

    Every correction is temporary if the next sync disagrees with it. Budgets
    exclude transfers (D-183), so a row the user has called an expense being
    relabelled `transfer` does not merely mislabel it — it removes their money
    from their own budget.
    """
    a, b = accounts
    out = _txn(user, a, '500.00', 'income')      # the importer's reading
    inn = _txn(user, b, '500.00', 'income')
    _db.session.commit()

    # The person says: no, that first one really is money going OUT.
    resp = client.put(f'/api/v1/transactions/{out.id}',
                      json={'transaction_type': 'expense'},
                      headers=auth_headers(user))
    assert resp.status_code == 200, resp.get_json()

    # ...and the next sync runs the matcher over both rows.
    assert match_transfers(user.id) == 0, 'it paired a row the user had set'
    _db.session.commit()

    assert _reread(out.id).transaction_type == 'expense'
    assert _reread(inn.id).transaction_type == 'income'


def test_AN_EDIT_THAT_DOES_NOT_TOUCH_THE_TYPE_CLAIMS_NOTHING(
        client, auth_headers, user, accounts):
    """*** 'USER' MUST MEAN *THEY SAID WHAT THIS IS*, NOT *THEY TOUCHED THE ROW*.

    *** Stamping it on any edit would make renaming a transaction freeze its type
    against every future import, which is a worse failure than the one this fixes
    and an invisible one: nothing on screen would say the row had opted out.
    """
    a, _ = accounts
    row = _txn(user, a, '500.00', 'income')
    _db.session.commit()

    resp = client.put(f'/api/v1/transactions/{row.id}',
                      json={'description': 'Rent, September'},
                      headers=auth_headers(user))

    assert resp.status_code == 200, resp.get_json()
    fresh = _reread(row.id)
    assert fresh.description == 'Rent, September'
    assert fresh.type_source is None


def test_RESTATING_THE_SAME_TYPE_STILL_COUNTS_AS_SAYING_IT(
        client, auth_headers, user, accounts):
    """*** CONFIRMING IS A CLAIM. *** A user who opens the editor, sees `income`,
    agrees with it and saves has told finPal the same thing as one who changed
    it. Keying on "the value differs" would silently discard that, and the whole
    point of the column is to record that a person decided.
    """
    a, _ = accounts
    row = _txn(user, a, '500.00', 'income')
    _db.session.commit()

    client.put(f'/api/v1/transactions/{row.id}',
               json={'transaction_type': 'income'},
               headers=auth_headers(user))

    assert _reread(row.id).type_source == 'user'


# ---------------------------------------------------------------------------
# The other half: a row a person TYPED is theirs too
# ---------------------------------------------------------------------------

def _create(client, auth_headers, user, account, ttype, desc, amount=500):
    return client.post('/api/v1/transactions/', json={
        'description': desc, 'amount': amount, 'date': '2026-09-11',
        'card_used': 'Card', 'split_method': 'equal', 'paid_by': user.id,
        'account_id': account.id, 'transaction_type': ttype,
    }, headers=auth_headers(user))


def test_TWO_UNRELATED_HAND_TYPED_ROWS_ARE_NOT_MERGED_INTO_A_TRANSFER(
        client, auth_headers, user, accounts):
    """*** THIS HAPPENED, AND IT TOOK NO IMPORT TO CAUSE IT. ***

    `match_transfers` is called by every SimpleFin sync as a FULL SWEEP over the
    user's rows — not over the batch — so any two rows with equal amounts,
    opposite types, different accounts and dates within three days are candidates,
    including ones a person typed by hand.

    Paying a friend £500 back and selling a bike for £500 in the same week is not
    a transfer. Before this was fixed the pair was merged into one, and budgets
    EXCLUDE transfers (D-183) — so both real amounts disappeared from the budget
    the user was looking at, silently.
    """
    a, b = accounts
    assert _create(client, auth_headers, user, a, 'expense',
                   'Paid a friend back').status_code == 201
    assert _create(client, auth_headers, user, b, 'income',
                   'Sold the bike').status_code == 201

    assert match_transfers(user.id) == 0, 'it merged two unrelated hand-typed rows'
    _db.session.commit()

    kinds = {r.description: r.transaction_type
             for r in Expense.query.filter_by(user_id=user.id).all()}
    assert kinds == {'Paid a friend back': 'expense', 'Sold the bike': 'income'}


def test_A_ROW_CREATED_WITHOUT_A_TYPE_CLAIMS_NOTHING(
        client, auth_headers, user, accounts):
    """*** THE DEFAULT IS finPal'S CHOICE, NOT THE USER'S. *** Omitting the key
    gets the model's `expense`; recording that as `'user'` would be a statement
    nobody made, and it would opt the row out of matching for ever."""
    a, _ = accounts
    resp = client.post('/api/v1/transactions/', json={
        'description': 'No type given', 'amount': 500, 'date': '2026-09-11',
        'card_used': 'Card', 'split_method': 'equal', 'paid_by': user.id,
        'account_id': a.id,
    }, headers=auth_headers(user))

    assert resp.status_code == 201, resp.get_json()
    row = Expense.query.filter_by(description='No type given').one()
    assert row.transaction_type == 'expense'
    assert row.type_source is None


def test_AN_IMPORTED_ROW_IS_STILL_MATCHABLE(user, accounts):
    """*** THE FIX MUST NOT SWITCH THE MATCHER OFF. *** Rows built by the CSV and
    SimpleFin importers never go through `build_transaction`, so they keep a NULL
    `type_source` and remain candidates — which is the entire point of the
    matcher."""
    a, b = accounts
    _txn(user, a, '500.00', 'expense', desc='CARD PAYMENT')
    _txn(user, b, '500.00', 'income', desc='PAYMENT RECEIVED')
    _db.session.commit()

    assert match_transfers(user.id) == 1
