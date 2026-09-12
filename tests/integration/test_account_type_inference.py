"""D-191: SimpleFin sends no account type, so everything imported as `checking`.

*** THE SHAPE OF THE BUG WAS A BRANCH THAT COULD NEVER FIRE. ***
`client.py` refined the type inside `if 'type' in account:` and that key does
not exist -- measured against the live bridge, **0 of 25 real accounts carried
one**. So a Visa Signature at -5,544.12 and a PayPal Credit at -830.00 both
landed as `checking`, invisible to `peak_magnitude`'s cost scale, to
`credit_utilisation_below`, to `has_debt_account_with_a_rate` and to the four
lesson predicates that read `_owed_accounts`.

Every test here asserts on the stored row, and the ones that matter most are the
REFUSALS: a guess must be labelled a guess, and a user's choice must survive.
"""

from decimal import Decimal

import pytest

from src.extensions import db as _db
from src.models.account import Account
from src.services.account.type_inference import (
    backfill_account_type_source, infer_account_type,
)
from tests.factories import UserFactory, AccountFactory


@pytest.fixture
def user(db):
    return UserFactory(id='types@test.com', name='Types')


# ---------------------------------------------------------------------------
# The inference itself
# ---------------------------------------------------------------------------

def test_HOLDINGS_MEANS_INVESTMENT(app):
    """The one unambiguous signal in the payload. SimpleFin sends `holdings`
    only for an account that has them; 3 of 25 real accounts did."""
    assert infer_account_type({'holdings': [{'symbol': 'VWRP'}], 'balance': 25721.74}) \
        == ('investment', 'inferred')


def test_a_negative_balance_means_credit(app):
    assert infer_account_type({'balance': -830.0}) == ('credit', 'inferred')


def test_A_POSITIVE_BALANCE_IS_A_DEFAULT_AND_SAYS_SO(app):
    """*** `checking` HERE IS NOT A FINDING, IT IS AN ABSENCE OF ONE. *** The
    column is NOT NULL so something had to be written, and `default` is what
    lets the client say "we do not know" instead of asserting."""
    assert infer_account_type({'balance': 214.08}) == ('checking', 'default')


def test_holdings_WINS_over_a_negative_balance(app):
    """A margin account can hold stock and owe money. Holdings are evidence;
    a negative balance is an inference, and evidence outranks inference."""
    assert infer_account_type({'holdings': [{'symbol': 'X'}], 'balance': -500.0}) \
        == ('investment', 'inferred')


def test_a_junk_balance_does_not_raise_and_does_not_guess(app):
    """A feed is not a contract. A bad value must not abort an import, and must
    not be read as a negative balance either."""
    for bad in ({'balance': 'oops'}, {'balance': None}, {}):
        assert infer_account_type(bad) == ('checking', 'default')


def test_THE_ACCOUNT_NAME_IS_NEVER_CONSULTED(app):
    """*** THE RULE THAT KEEPS THIS HONEST FOR NON-ENGLISH BANKS. ***
    "Customized Cash Rewards Visa Signature" and "PayPal Credit" are the two
    real accounts that started this, and both carry an obvious tell. Both are
    also user-editable strings. D-189 rejected string-matching a category called
    "Income" for the same reason; matching an account name is that mistake in a
    different hat, and it fails silently in any locale finPal does not read.
    """
    for name in ('Customized Cash Rewards Visa Signature - 8007',
                 'PayPal Credit', 'Visa', 'Mastercard', 'Carte de Crédit'):
        assert infer_account_type({'name': name, 'balance': 100.0}) \
            == ('checking', 'default'), name


# ---------------------------------------------------------------------------
# The backfill — the half that reaches anybody (D-178)
# ---------------------------------------------------------------------------

def test_AN_IMPORTED_CARD_IN_DEBT_IS_RECLASSIFIED(user, app):
    """The live case: a card imported as `checking` with money owed."""
    a = AccountFactory(user_id=user.id, name='Customized Cash Rewards Visa',
                       type='checking', balance=Decimal('-5544.12'))
    a.import_source = 'simplefin'
    a.type_source = None
    _db.session.commit()

    assert backfill_account_type_source() == 1
    _db.session.refresh(a)
    assert (a.type, a.type_source) == ('credit', 'inferred')


def test_A_MANUAL_ACCOUNT_KEEPS_ITS_TYPE_AND_IS_MARKED_user(user, app):
    """*** A PERSON TYPED THIS INTO A FORM. *** There is nothing to infer, and
    an overdrawn current account must not become a credit card because it dipped
    below zero."""
    a = AccountFactory(user_id=user.id, name='Current account',
                       type='checking', balance=Decimal('-120.00'))
    a.import_source = None
    a.type_source = None
    _db.session.commit()

    backfill_account_type_source()
    _db.session.refresh(a)
    assert (a.type, a.type_source) == ('checking', 'user'), \
        'an overdrawn CURRENT account was reclassified as a credit card'


def test_an_imported_account_a_human_already_corrected_is_preserved(user, app):
    """The importer could only ever write `checking`, so a non-checking type on
    an imported row is a human decision wearing no label."""
    a = AccountFactory(user_id=user.id, name='Amex', type='credit',
                       balance=Decimal('300.00'))
    a.import_source = 'simplefin'
    a.type_source = None
    _db.session.commit()

    backfill_account_type_source()
    _db.session.refresh(a)
    assert (a.type, a.type_source) == ('credit', 'user')


def test_THE_BACKFILL_IS_IDEMPOTENT_AND_NEVER_OVERWRITES_A_user_VALUE(user, app):
    """*** RUN IT TWICE — THE HALF OF D-178 THAT GETS MISSED. *** It runs at
    every boot, so a second pass must be a no-op, and a correction made between
    the two must survive."""
    a = AccountFactory(user_id=user.id, name='Savings', type='checking',
                       balance=Decimal('9124.00'))
    a.import_source = 'simplefin'
    a.type_source = None
    _db.session.commit()

    assert backfill_account_type_source() == 1
    _db.session.refresh(a)

    # The user corrects it: this is actually a savings account.
    a.type, a.type_source = 'savings', 'user'
    _db.session.commit()

    assert backfill_account_type_source() == 0, 'the second pass wrote again'
    _db.session.refresh(a)
    assert (a.type, a.type_source) == ('savings', 'user'), \
        'the backfill overwrote a value the user had set'


def test_a_positive_imported_account_is_default_not_user(user, app):
    """The distinction the whole column exists for: nothing is known about this
    one, and the client must be able to say so."""
    a = AccountFactory(user_id=user.id, name='Everyday', type='checking',
                       balance=Decimal('214.08'))
    a.import_source = 'simplefin'
    a.type_source = None
    _db.session.commit()

    backfill_account_type_source()
    _db.session.refresh(a)
    assert (a.type, a.type_source) == ('checking', 'default')
