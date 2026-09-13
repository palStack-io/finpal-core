"""Correcting a guess on the ORDINARY edit screen must clear it from Review.

*** THIS IS THE DEFECT THE REVIEW PAGE EXPOSED, NOT ONE IT INTRODUCED. *** Both
`*_source` columns were written only by the inference that set them and by the
boot backfill — **no hand edit ever moved one to `'user'`**. So a user who
changed "Gym" from flexible to fixed on the Categories page, or set an account's
type on the Accounts page, left the row still marked as finPal's guess.

Nothing visible depended on that until now, which is exactly why it survived: the
column was write-mostly. The Review page reads it, and the consequence lands on
the user — **a chore list that cannot be cleared from anywhere except the one
button on the Review page**, silently re-asking a question they already answered.

*** AND IT IS KEYED ON THE FIELD BEING PRESENT, NOT ON THE VALUE CHANGING. ***
Re-sending the same group is a person stating it; an omitted key is not. That is
D-197's rule, found for `transaction.type_source` — these were the second and
third places it was missing.

The sabotage worth remembering: a test that only edits to a DIFFERENT value
passes just as well against `if new_value != old_value`, which is the wrong rule
and silently refuses to accept agreement.
"""
import pytest

from src.extensions import db
from src.models.account import Account
from src.models.category import Category
from src.services.review.service import INFERRED, USER, build_review
from tests.factories import (AccountFactory, CategoryFactory, ExpenseFactory,
                             UserFactory)


@pytest.fixture
def bob(db):
    return UserFactory(id='bob@clears.test', name='Bob', is_admin=False,
                       password_plain='pw-bob')


@pytest.fixture
def bob_h(client, auth_headers, bob):
    return auth_headers(bob, password='pw-bob')


# ===========================================================================
# Categories
# ===========================================================================

def test_correcting_a_guessed_group_takes_it_off_the_review_page(
        client, bob_h, bob):
    category = CategoryFactory(user_id=bob.id, name='Gym', spending_type='flexible',
                               spending_type_source=INFERRED)

    res = client.put(f'/api/v1/categories/{category.id}',
                     json={'spending_type': 'fixed'}, headers=bob_h)

    assert res.status_code == 200
    row = db.session.get(Category, category.id)
    assert row.spending_type == 'fixed'
    assert row.spending_type_source == USER
    assert build_review(bob.id)['counts']['categories'] == 0, (
        'a corrected row that stays on the page is a chore that cannot be cleared')


def test_re_sending_the_same_group_is_also_an_answer(client, bob_h, bob):
    """*** AGREEING IS AN ANSWER. ***

    Keyed on presence, not on difference. A rule of "only if it changed" would
    refuse the most common case on this page — the user reads the guess, decides
    finPal got it right, and saves — leaving the row to be asked about forever.
    """
    category = CategoryFactory(user_id=bob.id, name='Gym', spending_type='fixed',
                               spending_type_source=INFERRED)

    client.put(f'/api/v1/categories/{category.id}',
               json={'spending_type': 'fixed'}, headers=bob_h)

    assert db.session.get(Category, category.id).spending_type_source == USER


def test_clearing_the_group_back_to_unsorted_is_an_answer_too(
        client, bob_h, bob):
    """null is a real value here — "back to unsorted" — not an absent one."""
    category = CategoryFactory(user_id=bob.id, name='Gym', spending_type='fixed',
                               spending_type_source=INFERRED)

    client.put(f'/api/v1/categories/{category.id}',
               json={'spending_type': None}, headers=bob_h)

    row = db.session.get(Category, category.id)
    assert row.spending_type is None
    assert row.spending_type_source == USER


def test_editing_something_else_does_not_claim_the_user_set_the_group(
        client, bob_h, bob):
    """*** THE REFUSAL HALF, AND WITHOUT IT THE RULE IS UNTESTED. ***

    Renaming a category says nothing about whether finPal sorted it correctly.
    Stamping `'user'` on any edit at all would silently empty the review page for
    anybody who tidies their category names — the fix turning into a worse bug
    than the one it closed.
    """
    category = CategoryFactory(user_id=bob.id, name='Gym', spending_type='fixed',
                               spending_type_source=INFERRED)

    client.put(f'/api/v1/categories/{category.id}',
               json={'name': 'Gym & Fitness'}, headers=bob_h)

    row = db.session.get(Category, category.id)
    assert row.name == 'Gym & Fitness'
    assert row.spending_type_source == INFERRED, (
        'an omitted key is not an answer')
    assert build_review(bob.id)['counts']['categories'] == 1


# ===========================================================================
# Accounts
# ===========================================================================

def test_setting_an_account_type_takes_it_off_the_review_page(
        client, bob_h, bob):
    account = AccountFactory(user_id=bob.id, name='Everyday', type='checking',
                             type_source=INFERRED)

    res = client.put(f'/api/v1/accounts/{account.id}',
                     json={'account_type': 'savings'}, headers=bob_h)

    assert res.status_code == 200
    row = db.session.get(Account, account.id)
    assert row.type == 'savings'
    assert row.type_source == USER
    assert build_review(bob.id)['counts']['accounts'] == 0


def test_re_sending_the_same_account_type_is_also_an_answer(client, bob_h, bob):
    account = AccountFactory(user_id=bob.id, name='Everyday', type='checking',
                             type_source=INFERRED)

    client.put(f'/api/v1/accounts/{account.id}',
               json={'account_type': 'checking'}, headers=bob_h)

    assert db.session.get(Account, account.id).type_source == USER


def test_editing_an_accounts_balance_does_not_claim_the_type_was_stated(
        client, bob_h, bob):
    """The refusal half again. The edit form sends only what changed, so an
    ordinary balance correction must leave the inference standing."""
    account = AccountFactory(user_id=bob.id, name='Everyday', type='checking',
                             balance=100.0, type_source=INFERRED)

    client.put(f'/api/v1/accounts/{account.id}',
               json={'balance': 250.0}, headers=bob_h)

    row = db.session.get(Account, account.id)
    assert float(row.balance) == 250.0
    assert row.type_source == INFERRED
    assert build_review(bob.id)['counts']['accounts'] == 1


# ===========================================================================
# Uncategorised transactions — the section with NO confirm button
# ===========================================================================

def test_choosing_a_category_takes_the_transaction_off_the_review_page(
        client, bob_h, bob):
    """*** THE SECTION I WENT OUT OF MY WAY TO MAKE DIFFERENT NEEDS THIS MOST. ***

    The other two sections clear by a `*_source` moving to `'user'`. This one
    clears because the row stops matching `category_id IS NULL` at all — a
    completely different mechanism, sharing none of the code the tests above
    cover. "A chore that cannot be cleared" is the failure mode this whole page
    is built against, and it would have been unasserted for exactly the third of
    it that works differently.
    """
    category = CategoryFactory(user_id=bob.id, name='Groceries')
    expense = ExpenseFactory(user_id=bob.id, category_id=None,
                             description='SAINSBURYS S/MKTS')
    assert build_review(bob.id)['counts']['uncategorised'] == 1

    res = client.put(f'/api/v1/transactions/{expense.id}',
                     json={'category_id': category.id}, headers=bob_h)

    assert res.status_code == 200
    assert build_review(bob.id)['counts']['uncategorised'] == 0
    assert build_review(bob.id)['sections']['uncategorised']['rows'] == []


def test_a_transaction_that_is_still_uncategorised_stays_on_the_page(
        client, bob_h, bob):
    """The refusal half: editing something else must not clear the row.

    Without this, a fix that emptied the section on ANY transaction edit would
    pass the test above — and would silently retire a chore list for anybody who
    corrects a description.
    """
    expense = ExpenseFactory(user_id=bob.id, category_id=None,
                             description='SAINSBURYS S/MKTS 0123')

    client.put(f'/api/v1/transactions/{expense.id}',
               json={'description': 'Sainsburys'}, headers=bob_h)

    assert build_review(bob.id)['counts']['uncategorised'] == 1
