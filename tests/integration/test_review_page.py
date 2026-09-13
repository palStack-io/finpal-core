"""Everything finPal guessed, and who is allowed to answer for it.

*** THE TWO CONFIRMATIONS USE OPPOSITE PERMISSION RULES ON PURPOSE, AND THAT IS
WHAT THIS FILE EXISTS TO PIN. *** A reader who sees two functions called
`confirm_category` and `confirm_account` sitting next to each other will one day
"tidy" them into one rule, and either direction of that tidy is a defect:

  * **categories are household property with NO owner** (D-20), and
    `can_manage_owned` says in as many words that it is *"deliberately NOT the rule
    for categories"* — so a housemate confirming a housemate's guessed spending
    group is CORRECT, not a hole;
  * **accounts are assignable to a member**, and while the deployed rule was "any
    household member" a housemate could delete another member's account and null
    `account_id` across its whole transaction history (D-47) — so the same
    housemate confirming somebody else's account type is REFUSED.

*** SO EVERY RULE BELOW IS ASSERTED IN BOTH DIRECTIONS. *** A one-sided
permission test passes just as happily when the predicate has been replaced by
`return True`, which is exactly how a sabotage slipped through this suite before.

*** AND A REFUSAL IS NOT A NO-OP. *** `confirm_account` raises
`ReviewNotPermitted` for "somebody else owns this" and returns `False` for
"already done". Collapsed into one value the route cannot tell a 403 from a
benign 200, and the housemate — who is correctly SHOWN the row — would click
Confirm and get silence.
"""
import pytest

from src.extensions import db
from src.models.account import Account
from src.models.category import Category
from src.models.transaction import Expense
from src.services.review.service import (
    INFERRED, SECTION_LIMIT, USER, ReviewNotPermitted, build_review,
    confirm_account, confirm_category)
from tests.factories import (AccountFactory, CategoryFactory, ExpenseFactory,
                             UserFactory)


@pytest.fixture
def bob(db):
    """An ordinary member who owns the account under test."""
    return UserFactory(id='bob@review.test', name='Bob', is_admin=False)


@pytest.fixture
def alice(db):
    """Another ordinary member — NOT an admin, NOT the owner."""
    return UserFactory(id='alice@review.test', name='Alice', is_admin=False)


@pytest.fixture
def ann(db):
    """The household admin."""
    return UserFactory(id='ann@review.test', name='Ann', is_admin=True)


@pytest.fixture
def dora(db):
    """A demo persona — on the instance, but not in the household (D-42)."""
    return UserFactory(id='demo@review.test', name='Dora', is_demo_user=True)


def _guessed_category(owner, name='Gym'):
    return CategoryFactory(user_id=owner.id, name=name,
                           spending_type='fixed',
                           spending_type_source=INFERRED)


def _inferred_account(owner, name='Everyday'):
    return AccountFactory(user_id=owner.id, name=name, type='checking',
                          type_source=INFERRED)


# ===========================================================================
# What the page shows
# ===========================================================================

def test_the_three_sections_carry_three_verbs_not_one(db, bob):
    """An uncategorised transaction is a *choice*, not a confirmation.

    There is nothing to confirm about a row finPal had no opinion on, and making
    the third section match the first two would need a `category_source` marker
    with no question behind it.
    """
    _guessed_category(bob)
    _inferred_account(bob)
    ExpenseFactory(user_id=bob.id, category_id=None, description='Corner shop')

    payload = build_review(bob.id)
    verbs = {name: s['action'] for name, s in payload['sections'].items()}

    assert verbs == {'categories': 'confirm',
                     'accounts': 'confirm',
                     'uncategorised': 'choose'}


def test_a_guessed_row_says_why_finpal_guessed(db, bob):
    """A row that says only "we guessed" asks the user to re-derive the question."""
    _guessed_category(bob)
    payload = build_review(bob.id)

    row = payload['sections']['categories']['rows'][0]
    assert row['reason'], 'a guess rendered without its reason is D-77/D-108'
    assert row['spending_type'] == 'fixed', 'the guess itself must be shown'


def test_a_row_finpal_did_not_guess_is_absent(db, bob):
    """Only `'inferred'` rows are questions. A user's own choice is settled."""
    CategoryFactory(user_id=bob.id, name='Rent', spending_type='fixed',
                    spending_type_source=USER)
    AccountFactory(user_id=bob.id, name='Told Us', type='savings',
                   type_source=USER)

    payload = build_review(bob.id)

    assert payload['counts']['categories'] == 0
    assert payload['counts']['accounts'] == 0
    assert payload['sections']['categories']['rows'] == []
    assert payload['sections']['accounts']['rows'] == []


def test_an_uncategorised_transfer_stays_out_of_the_list(db, bob):
    """*** A TRANSFER HAS NOTHING TO CATEGORISE. ***

    Money moving between your own accounts is not spending, so asking which
    category it belongs to is a question with no right answer — and budgets
    already exclude transfers (D-183). Listing one here would manufacture a chore
    that can never be finished.
    """
    ExpenseFactory(user_id=bob.id, category_id=None, description='Spending money',
                   transaction_type='expense')
    ExpenseFactory(user_id=bob.id, category_id=None, description='To savings',
                   transaction_type='transfer')

    payload = build_review(bob.id)
    described = [r['description'] for r in payload['sections']['uncategorised']['rows']]

    assert described == ['Spending money']
    assert payload['counts']['uncategorised'] == 1, (
        'the count and the list must agree — a count of 2 beside one row is a '
        'chore the user cannot clear')


def test_the_payload_carries_no_denominator(db, bob):
    """*** "3 to review", NEVER "3 of 47". ***

    The first is momentum; the second is a report card about your own mistakes,
    and not making people feel worse is a stated purpose of this app (voice rule
    11). Shipping the count AND the page size hands any client everything it
    needs to render "showing 50 of 237", which is the same thing one layer down.
    """
    for i in range(3):
        _guessed_category(bob, name=f'Guess {i}')

    payload = build_review(bob.id)

    assert payload['counts']['categories'] == 3
    assert 'limit' not in payload, 'count + page size reconstructs the denominator'
    # *** DELIBERATELY NOT A SCAN OF `repr(payload)` FOR THE NUMBER 50. *** That
    # is what this assertion was first written as, and it would have failed the
    # day somebody added an expense of 50.00 to this test — for a reason with
    # nothing to do with what it checks. `test_the_wire_format_carries_no_
    # denominator` pins the whole key set at the API level, which is where a
    # serializer or a paginator wrapper would actually reintroduce the field.


def test_the_count_is_the_honest_total_even_when_the_list_is_capped(db, bob):
    """The list is what you can act on now; the count is not a lie about it.

    Capping the list and capping the count would tell a household with 200
    guessed categories that it has 50 — the page would then never empty, because
    clearing 50 reveals 50 more that were never counted.
    """
    for i in range(SECTION_LIMIT + 5):
        _guessed_category(bob, name=f'Guess {i:03d}')

    payload = build_review(bob.id)

    assert len(payload['sections']['categories']['rows']) == SECTION_LIMIT
    assert payload['counts']['categories'] == SECTION_LIMIT + 5


def test_the_total_is_the_server_s_answer_not_the_client_s(db, bob):
    """D-101: two clients deriving the same figure is two chances to disagree."""
    _guessed_category(bob)
    _inferred_account(bob)
    ExpenseFactory(user_id=bob.id, category_id=None)

    payload = build_review(bob.id)

    assert payload['total'] == 3
    assert payload['total'] == sum(payload['counts'].values())


# ===========================================================================
# The sandbox — a demo persona is on the instance but not in the household
# ===========================================================================

def test_a_demo_persona_sees_only_its_own_rows(db, bob, dora):
    """D-42's symmetry: household property must not reach a demo visitor.

    `visible_user_ids` collapses to the caller alone for a demo account, and this
    pins that the review page inherits that rather than re-deriving a scope.
    """
    _guessed_category(bob, name='Household Gym')
    _guessed_category(dora, name='Demo Gym')

    demo_view = build_review(dora.id)
    names = [r['name'] for r in demo_view['sections']['categories']['rows']]

    assert names == ['Demo Gym']
    assert demo_view['counts']['categories'] == 1


def test_a_member_does_not_see_the_demo_persona_s_rows(db, bob, dora):
    """The other half of the same symmetry, asserted separately.

    The household must not be handed the sandbox's chores — and a test of only
    one direction passes when the scope has been widened to every user on the
    instance.
    """
    _guessed_category(bob, name='Household Gym')
    _guessed_category(dora, name='Demo Gym')

    names = [r['name'] for r in
             build_review(bob.id)['sections']['categories']['rows']]

    assert names == ['Household Gym']


# ===========================================================================
# CATEGORIES — household property, so a housemate MAY answer (D-20)
# ===========================================================================

def test_a_housemate_may_confirm_a_category_they_do_not_own(db, alice, bob):
    """*** THIS IS NOT A HOLE, IT IS THE RULE. ***

    Categories have no owner at all, so there is nothing for an owner check to
    key on. Refusing here would leave a household category that only the person
    who happened to create it could ever settle.
    """
    category = _guessed_category(bob)

    assert confirm_category(alice.id, category.id) is True

    db.session.refresh(category)
    assert category.spending_type_source == USER, (
        'the return value is not the change — assert the database')


def test_a_demo_persona_may_not_confirm_a_household_category(db, bob, dora):
    """The refusal that MUST exist beside the permission above.

    A demo account signs in with a published password, so "any caller may
    confirm" would let a visitor settle the real household's categories — which
    is D-42 exactly: one hour after categories became household property, a demo
    login could rename and delete them.
    """
    category = _guessed_category(bob)

    assert confirm_category(dora.id, category.id) is False

    db.session.refresh(category)
    assert category.spending_type_source == INFERRED, 'unchanged, not just refused'


def test_a_member_may_not_confirm_a_demo_persona_s_category(db, bob, dora):
    """And the mirror, because the sandbox boundary is symmetric."""
    category = _guessed_category(dora)

    assert confirm_category(bob.id, category.id) is False

    db.session.refresh(category)
    assert category.spending_type_source == INFERRED


def test_confirming_twice_is_a_no_op_and_not_an_error(db, bob):
    """Two tabs open, or a second click. Neither is a failure worth shouting about."""
    category = _guessed_category(bob)

    assert confirm_category(bob.id, category.id) is True
    assert confirm_category(bob.id, category.id) is False

    db.session.refresh(category)
    assert category.spending_type_source == USER


def test_confirming_never_invents_a_spending_type(db, bob):
    """Confirmation moves the SOURCE, not the value.

    A confirm that also wrote a default would turn "finPal guessed fixed" into
    "you said fixed" for a row the user never looked at.
    """
    category = CategoryFactory(user_id=bob.id, name='Odd', spending_type='flexible',
                               spending_type_source=INFERRED)

    confirm_category(bob.id, category.id)

    db.session.refresh(category)
    assert category.spending_type == 'flexible'


# ===========================================================================
# ACCOUNTS — assignable to a member, so the OWNER answers (the opposite rule)
# ===========================================================================

def test_the_owner_may_confirm_their_own_account(db, bob):
    account = _inferred_account(bob)

    assert confirm_account(bob.id, account.id) is True

    db.session.refresh(account)
    assert account.type_source == USER


def test_the_admin_may_confirm_a_members_account(db, ann, bob):
    """`can_manage_owned` is owner-OR-ADMIN, and the admin half is easy to lose."""
    account = _inferred_account(bob)

    assert confirm_account(ann.id, account.id) is True

    db.session.refresh(account)
    assert account.type_source == USER


def test_a_housemate_may_not_confirm_another_members_account(db, alice, bob):
    """*** THE OPPOSITE ANSWER FROM THE CATEGORY CASE, ONE FUNCTION AWAY. ***

    While the deployed rule here was "any household member", a housemate could
    delete another member's account and null `account_id` across its entire
    transaction history (D-47). An account is assignable to a member, which is
    what makes an owner check meaningful for it.
    """
    account = _inferred_account(bob)

    with pytest.raises(ReviewNotPermitted):
        confirm_account(alice.id, account.id)

    db.session.refresh(account)
    assert account.type_source == INFERRED


def test_a_refusal_is_told_apart_from_nothing_to_do(db, alice, bob):
    """*** THE WHOLE REASON `ReviewNotPermitted` EXISTS. ***

    "Somebody else owns this" and "it is already confirmed" ask the user for
    different actions — one is *ask your housemate*, the other is *nothing, it is
    done*. If both came back as `False` the route could not answer 403 for one
    and 200 for the other, and the page would go quiet on a row it had just
    shown.
    """
    theirs = _inferred_account(bob, name='Theirs')
    mine = _inferred_account(alice, name='Mine')
    assert confirm_account(alice.id, mine.id) is True

    # Already done: a plain False, and emphatically not an exception.
    assert confirm_account(alice.id, mine.id) is False

    # Not yours: an exception, and emphatically not a False.
    with pytest.raises(ReviewNotPermitted):
        confirm_account(alice.id, theirs.id)


def test_a_housemate_still_SEES_the_account_they_may_not_confirm(db, alice, bob):
    """Read stays household-wide; only the write narrows.

    Narrowing the read to match the write would reintroduce D-43 — a row in the
    list that its viewer cannot open. The page showing it and refusing to write
    it is the intended pair, which is why the refusal has to be legible.
    """
    account = _inferred_account(bob, name='Bobs Current')

    names = [r['name'] for r in
             build_review(alice.id)['sections']['accounts']['rows']]

    assert 'Bobs Current' in names


def test_a_demo_persona_cannot_reach_a_household_account_at_all(db, bob, dora):
    """Not found, rather than found-and-refused — the row is outside its scope."""
    account = _inferred_account(bob)

    assert confirm_account(dora.id, account.id) is False

    db.session.refresh(account)
    assert account.type_source == INFERRED


def test_confirming_an_account_never_invents_a_type(db, bob):
    account = AccountFactory(user_id=bob.id, name='Odd', type='credit',
                             type_source=INFERRED)

    confirm_account(bob.id, account.id)

    db.session.refresh(account)
    assert account.type == 'credit'


# ===========================================================================
# A confirmation has to SURVIVE, or the page refills itself overnight
# ===========================================================================

def test_a_confirmed_row_leaves_the_page(db, bob):
    """The chore must actually clear. A confirm that does not remove the row is a
    page that can never be finished, which is the opposite of the point."""
    category = _guessed_category(bob)
    account = _inferred_account(bob)

    confirm_category(bob.id, category.id)
    confirm_account(bob.id, account.id)

    payload = build_review(bob.id)
    assert payload['total'] == 0
    assert payload['counts'] == {'categories': 0, 'accounts': 0, 'uncategorised': 0}


def test_the_backfills_do_not_overwrite_a_confirmation(db, bob):
    """*** NO NEW STORAGE, AND THIS IS THE CLAIM THAT MAKES THAT SAFE. ***

    The confirmation is one existing column changing value, so it is only
    permanent if the thing that writes that column already skips a row it does
    not own. Both backfills are documented to — and a docstring is not a gate,
    so they are RUN here against a confirmed row.
    """
    from src.services.account.type_inference import backfill_account_type_source
    from src.services.category.spending_type import backfill_spending_type_source

    category = _guessed_category(bob)
    account = _inferred_account(bob)
    confirm_category(bob.id, category.id)
    confirm_account(bob.id, account.id)
    # A user's correction, made after confirming, is what must survive.
    category.spending_type = 'flexible'
    account.type = 'savings'
    db.session.commit()

    backfill_spending_type_source()
    backfill_account_type_source()

    assert db.session.get(Category, category.id).spending_type == 'flexible'
    assert db.session.get(Category, category.id).spending_type_source == USER
    assert db.session.get(Account, account.id).type == 'savings'
    assert db.session.get(Account, account.id).type_source == USER
