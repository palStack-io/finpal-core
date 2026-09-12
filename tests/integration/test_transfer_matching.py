"""Money between two of the user's own accounts is not income.

*** THE SPEC SAID "OPPOSITE SIGNS" AND THAT WOULD HAVE MATCHED NOTHING, FOR
EVER. *** SimpleFin sends -500 and +500, but the importer does
`amount = abs(amount)` and puts the direction in `transaction_type`
(`client.py:191`), so by the time both legs are ROWS the signs are gone and both
amounts are positive. A matcher written against sign would be a feature that
looks implemented, passes review, and never fires. The rule is equal amounts
with opposite TYPES, and the first test here is the one that pins it.

The refusals matter more than the matches: a false pair does not merely mislabel
a row, it DELETES a real expense from the budget, because budgets exclude
transfers (D-183).
"""

from datetime import datetime, timedelta
from decimal import Decimal

import pytest

from src.extensions import db as _db
from src.models.transaction import Expense
from src.services.transaction.transfer_match import match_transfers
from tests.factories import UserFactory, AccountFactory, ExpenseFactory

SEP = datetime(2026, 9, 11)


@pytest.fixture
def user(db):
    return UserFactory(id='xfer@test.com', name='Xfer')


@pytest.fixture
def accounts(user):
    a = AccountFactory(user_id=user.id, name='Current', type='checking',
                       balance=Decimal('1000'))
    b = AccountFactory(user_id=user.id, name='Savings', type='savings',
                       balance=Decimal('5000'))
    _db.session.commit()
    return a, b


def _txn(user, account, amount, ttype, when=SEP, desc='Transfer'):
    return ExpenseFactory(user_id=user.id, account_id=account.id,
                          amount=Decimal(amount), transaction_type=ttype,
                          date=when, description=desc)


def _types(*rows):
    for r in rows:
        _db.session.refresh(r)
    return [r.transaction_type for r in rows]


# ---------------------------------------------------------------------------
# The match
# ---------------------------------------------------------------------------

def test_TWO_LEGS_OF_ONE_TRANSFER_ARE_MATCHED_AND_LINKED(user, accounts, app):
    """*** BOTH AMOUNTS ARE POSITIVE IN THE DATABASE. *** This is the fixture
    that would have failed a sign-based matcher and passed review anyway."""
    a, b = accounts
    out = _txn(user, a, '500.00', 'expense')
    inn = _txn(user, b, '500.00', 'income')
    assert out.amount > 0 and inn.amount > 0, 'the fixture must mirror storage'

    assert match_transfers(user.id) == 1
    _db.session.commit()

    assert _types(out, inn) == ['transfer', 'transfer']
    _db.session.refresh(out); _db.session.refresh(inn)
    assert out.transfer_group_id and out.transfer_group_id == inn.transfer_group_id


def test_the_two_rows_are_LINKED_not_merged(user, accounts, app):
    """An import is a record of what the bank said. Merging two statement lines
    into one breaks reconciliation against that statement."""
    a, b = accounts
    _txn(user, a, '500.00', 'expense')
    _txn(user, b, '500.00', 'income')
    match_transfers(user.id); _db.session.commit()
    assert Expense.query.filter_by(user_id=user.id).count() == 2


def test_a_leg_posted_three_days_later_still_matches(user, accounts, app):
    """Banks post the debit and the credit on different days more often than
    not. Same-day-only would miss most real transfers."""
    a, b = accounts
    _txn(user, a, '500.00', 'expense', when=SEP)
    _txn(user, b, '500.00', 'income', when=SEP + timedelta(days=3))
    assert match_transfers(user.id) == 1


# ---------------------------------------------------------------------------
# The refusals — these matter more than the matches
# ---------------------------------------------------------------------------

def test_TWO_GENUINE_EXPENSES_ON_ONE_DAY_ARE_NOT_A_TRANSFER(user, accounts, app):
    """*** THE FALSE POSITIVE THAT WOULD DELETE A REAL EXPENSE. *** Budgets
    exclude transfers, so mislabelling a £500 purchase removes it from the
    user's spending entirely. Two expenses have the same TYPE, so they can never
    pair -- this pins that the type check is doing the work."""
    a, b = accounts
    one = _txn(user, a, '500.00', 'expense', desc='Sofa')
    two = _txn(user, b, '500.00', 'expense', desc='Fridge')
    assert match_transfers(user.id) == 0
    assert _types(one, two) == ['expense', 'expense']


def test_AMBIGUITY_REFUSES_RATHER_THAN_PICKING(user, accounts, app):
    """*** TWO EQUALLY GOOD CANDIDATES MEANS NO MATCH AT ALL. *** One £500 debit
    and TWO £500 credits on the same day: any choice is a coin toss, and the
    wrong one silently removes a real £500 of income. Refusing leaves three rows
    the user can correct by hand; guessing leaves one they will never notice."""
    a, b = accounts
    c = AccountFactory(user_id=user.id, name='Third', type='checking',
                       balance=Decimal('10'))
    _db.session.commit()
    out = _txn(user, a, '500.00', 'expense')
    in1 = _txn(user, b, '500.00', 'income')
    in2 = _txn(user, c, '500.00', 'income')

    assert match_transfers(user.id) == 0, 'it picked one of two identical candidates'
    assert _types(out, in1, in2) == ['expense', 'income', 'income']


def test_a_leg_four_days_later_does_NOT_match(user, accounts, app):
    """Pins the window as a decision rather than an accident: 3 matches, 4 does
    not. Without this the constant could drift to 30 and nothing would fail."""
    a, b = accounts
    _txn(user, a, '500.00', 'expense', when=SEP)
    _txn(user, b, '500.00', 'income', when=SEP + timedelta(days=4))
    assert match_transfers(user.id) == 0


def test_the_same_account_cannot_transfer_to_itself(user, accounts, app):
    a, _ = accounts
    _txn(user, a, '500.00', 'expense')
    _txn(user, a, '500.00', 'income')
    assert match_transfers(user.id) == 0


def test_different_amounts_do_not_match(user, accounts, app):
    a, b = accounts
    _txn(user, a, '500.00', 'expense')
    _txn(user, b, '499.99', 'income')
    assert match_transfers(user.id) == 0


def test_ANOTHER_USERS_ROW_IS_NEVER_THE_OTHER_LEG(user, accounts, app):
    """A household shares a view, not a ledger. Pairing across users would put
    one person's expense into another's transfer."""
    a, _ = accounts
    other = UserFactory(id='someone@test.com', name='Other')
    other_acc = AccountFactory(user_id=other.id, name='Theirs', type='checking',
                               balance=Decimal('10'))
    _db.session.commit()
    _txn(user, a, '500.00', 'expense')
    ExpenseFactory(user_id=other.id, account_id=other_acc.id,
                   amount=Decimal('500.00'), transaction_type='income', date=SEP)
    assert match_transfers(user.id) == 0


def test_AN_UNMATCHED_POSITIVE_STAYS_INCOME(user, accounts, app):
    """*** THE HONEST DEFAULT. *** finPal cannot see the other side of a transfer
    to an account it does not know, and must not invent one. This is exactly why
    a manual correction has to exist."""
    _, b = accounts
    inn = _txn(user, b, '500.00', 'income', desc='TRANSFER FROM 40-12-88')
    assert match_transfers(user.id) == 0
    assert _types(inn) == ['income']


def test_A_USER_SET_TYPE_IS_NEVER_OVERWRITTEN(user, accounts, app):
    """*** A PERSON SAID WHAT THIS IS. *** An import running afterwards must not
    silently disagree with them, or every correction is temporary."""
    a, b = accounts
    out = _txn(user, a, '500.00', 'expense')
    inn = _txn(user, b, '500.00', 'income')
    inn.type_source = 'user'
    _db.session.commit()

    assert match_transfers(user.id) == 0
    assert _types(out, inn) == ['expense', 'income']


def test_an_already_matched_row_is_not_rematched(user, accounts, app):
    """The matcher runs after every sync, so a second pass must be a no-op."""
    a, b = accounts
    _txn(user, a, '500.00', 'expense')
    _txn(user, b, '500.00', 'income')
    assert match_transfers(user.id) == 1
    _db.session.commit()
    assert match_transfers(user.id) == 0


def test_a_user_set_type_is_respected_FROM_EITHER_SIDE(user, accounts, app):
    """*** THE FIRST VERSION OF THE TEST ABOVE ONLY COVERED ONE SIDE, AND A
    SABOTAGE FOUND IT. *** It marked the INCOME leg as user-set, which the
    candidate filter rejects; removing the guard on the ITERATED row therefore
    changed nothing and the sabotage passed. This marks the EXPENSE leg instead,
    so the row being walked is the protected one.
    """
    a, b = accounts
    out = _txn(user, a, '500.00', 'expense')
    inn = _txn(user, b, '500.00', 'income')
    out.type_source = 'user'
    _db.session.commit()

    assert match_transfers(user.id) == 0
    assert _types(out, inn) == ['expense', 'income']
