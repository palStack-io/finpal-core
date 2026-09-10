"""
The map is CONTENT, so these tests pin the decisions rather than the mechanism.
A change to the map is a change to a product decision and should have to be made
here as well as in the source -- that is the point of duplicating the values.

*** THE MAP IS KEYED BY PATH, NOT BY BARE NAME, AND THAT IS NOT A STYLE CHOICE. ***
finPal has TWO default category sets: `AuthService.create_default_categories`
seeds 28 at signup, and `src/data/default_categories.DEFAULT_CATEGORIES` seeds
147 for the demo. They share 18 names and three of those mean different things --
`Gas` is the utility bill under the demo's `Housing` and petrol under the signup
set's `Transportation`. Keyed by bare name, the map writes `flexible` onto a gas
BILL, which is the one thing `fixed` exists for. Keyed by path they are distinct.

*** SIX OF THE SIGNUP CATEGORIES ARE DELIBERATELY UNCLASSIFIED. *** A gym contract
is fixed and pay-as-you-go is flexible; finPal cannot know which, so it does not
guess. Those land in Unsorted, and Unsorted having real content is what makes it
worth showing.

*** INCOME AND SAVINGS ARE ABSENT FROM THE MAP ON PURPOSE, NOT MISSING. ***
Owner decision 2026-09-10. Income is not spending, and `Goal` already owns
savings -- spec §1 decision 4 rejected a fourth `saving` value precisely because
it would count the same money twice.
"""
import pytest

from src.data.default_categories import DEFAULT_CATEGORIES
from src.services.category.spending_type import (
    DEFAULT_SPENDING_TYPES,
    VALID_SPENDING_TYPES,
    category_path,
    default_for_path,
)

SIGNUP_FIXED = {'Housing', 'Housing/Rent/Mortgage', 'Housing/Utilities'}
SIGNUP_NON_MONTHLY = {
    'Housing/Home Maintenance', 'Shopping/Gifts', 'Personal/Education',
}
SIGNUP_UNCLASSIFIED = {
    'Health', 'Health/Medical', 'Health/Pharmacy', 'Health/Fitness',
    'Personal', 'Other',
}

# Every path the signup seeder (`AuthService.create_default_categories`) creates.
SIGNUP_PATHS = SIGNUP_FIXED | SIGNUP_NON_MONTHLY | SIGNUP_UNCLASSIFIED | {
    'Food', 'Food/Groceries', 'Food/Restaurants', 'Food/Coffee Shops',
    'Transportation', 'Transportation/Gas', 'Transportation/Public Transit',
    'Transportation/Rideshare',
    'Shopping', 'Shopping/Clothing', 'Shopping/Electronics',
    'Entertainment', 'Entertainment/Movies', 'Entertainment/Music',
    'Entertainment/Subscriptions',
    'Personal/Self-care',
}

EXCLUDED_SUBTREES = ('Income', 'Savings & Investments')


def demo_paths():
    """Every path the demo seeder creates, derived from the source of truth."""
    paths = set()
    for parent, data in DEFAULT_CATEGORIES.items():
        paths.add(parent)
        for sub in data.get('subcategories', []):
            paths.add(f"{parent}/{sub['name']}")
    return paths


# --------------------------------------------------------------------------
# The signup set -- the 28 the owner approved unchanged
# --------------------------------------------------------------------------

def test_the_signup_set_is_28_paths():
    # 7 parents, 20 children, plus standalone "Other".
    assert len(SIGNUP_PATHS) == 28


def test_every_signup_path_is_in_the_map():
    # Including the six whose value is None: present with a None value is a
    # DECISION, and absent is an oversight. The map has to distinguish them.
    missing = SIGNUP_PATHS - set(DEFAULT_SPENDING_TYPES)
    assert missing == set()


def test_the_signup_fixed_set_is_exactly_what_was_agreed():
    got = {p for p in SIGNUP_PATHS if DEFAULT_SPENDING_TYPES[p] == 'fixed'}
    assert got == SIGNUP_FIXED


def test_the_signup_non_monthly_set_is_exactly_what_was_agreed():
    got = {p for p in SIGNUP_PATHS if DEFAULT_SPENDING_TYPES[p] == 'non_monthly'}
    assert got == SIGNUP_NON_MONTHLY


def test_the_signup_unclassified_set_is_deliberate_and_exactly_what_was_agreed():
    got = {p for p in SIGNUP_PATHS if DEFAULT_SPENDING_TYPES[p] is None}
    assert got == SIGNUP_UNCLASSIFIED


def test_groceries_is_FLEXIBLE_not_fixed():
    # Fixed means contractually committed, not essential. An earlier draft of the
    # spec had this backwards and contradicted lesson 8; the lesson was right.
    assert default_for_path('Food/Groceries') == 'flexible'
    assert default_for_path('Food & Dining/Groceries') == 'flexible'


def test_subscriptions_is_FLEXIBLE_so_it_stays_reviewable():
    # Burying subscriptions in `fixed` hides the thing people most need to look
    # at, and the page tells them not to act on the fixed group.
    assert default_for_path('Entertainment/Subscriptions') == 'flexible'
    assert default_for_path('Entertainment/Streaming Services') == 'flexible'


# --------------------------------------------------------------------------
# The demo set, and the collisions that forced path keying
# --------------------------------------------------------------------------

def test_every_demo_path_is_accounted_for_or_deliberately_excluded():
    unaccounted = {
        p for p in demo_paths()
        if p not in DEFAULT_SPENDING_TYPES
        and not p.split('/')[0] in EXCLUDED_SUBTREES
    }
    assert unaccounted == set()


def test_GAS_IS_THE_UTILITY_UNDER_HOUSING_AND_PETROL_UNDER_TRANSPORT():
    # *** THE COLLISION THAT KILLED BARE-NAME KEYING. *** One name, two meanings,
    # opposite groups. A bare-name map classifies a gas BILL as flexible.
    assert default_for_path('Housing/Gas') == 'fixed'
    assert default_for_path('Transportation/Gas') == 'flexible'
    assert default_for_path('Transportation/Gas/Fuel') == 'flexible'


def test_gifts_appears_under_two_parents_and_both_are_non_monthly():
    # Same answer here, but keyed separately so the two can ever diverge.
    assert default_for_path('Shopping/Gifts') == 'non_monthly'
    assert default_for_path('Charity/Gifts') == 'non_monthly'


def test_education_is_a_parent_in_one_tree_and_a_child_in_the_other():
    assert default_for_path('Education') == 'non_monthly'
    assert default_for_path('Personal/Education') == 'non_monthly'


def test_a_top_level_key_never_matches_a_child_of_the_same_name():
    # 'Education' the parent and 'Personal/Education' the child are two keys. A
    # child must never be resolved by its bare name.
    assert default_for_path('Subscriptions') is None
    assert default_for_path('Groceries') is None
    assert default_for_path('Gas') is None


# --------------------------------------------------------------------------
# The owner's non-expense decision
# --------------------------------------------------------------------------

@pytest.mark.parametrize('path', [
    'Income', 'Income/Salary', 'Income/Freelance', 'Income/Dividends',
    'Savings & Investments', 'Savings & Investments/Emergency Fund',
    'Savings & Investments/Retirement', 'Savings & Investments/Crypto',
])
def test_income_and_savings_are_ABSENT_not_mapped_to_None(path):
    # *** ABSENT, NOT A FOURTH VALUE. *** Spec §1 decision 4 rejected a `saving`
    # value because it counts the same money twice. Absent means these never
    # acquire a default; they carry no Expense rows, so they never reach the
    # expense groups or Unsorted either.
    assert path not in DEFAULT_SPENDING_TYPES
    assert default_for_path(path) is None


@pytest.mark.parametrize('path', [
    'Debt & Loans', 'Debt & Loans/Credit Card Payment',
    'Debt & Loans/Student Loan', 'Debt & Loans/Personal Loan',
    'Debt & Loans/Car Loan', 'Debt & Loans/Other Debt',
    'Education/Student Loans',
])
def test_every_debt_repayment_is_FIXED(path):
    # A loan repayment is the definition of contractually committed, and
    # learnPal's debt route needs it visible rather than excluded.
    assert default_for_path(path) == 'fixed'


def test_taxes_are_non_monthly_except_sales_tax():
    assert default_for_path('Taxes/Federal Tax') == 'non_monthly'
    assert default_for_path('Taxes/State Tax') == 'non_monthly'
    assert default_for_path('Taxes/Property Tax') == 'non_monthly'
    assert default_for_path('Housing/Property Tax') == 'non_monthly'
    # Sales tax arrives with the purchase it is charged on, so it moves with
    # spending rather than arriving as a lump.
    assert default_for_path('Taxes/Sales Tax') == 'flexible'


# --------------------------------------------------------------------------
# The mechanism
# --------------------------------------------------------------------------

def test_only_the_three_valid_values_or_None_appear():
    assert set(DEFAULT_SPENDING_TYPES.values()) <= {
        'fixed', 'flexible', 'non_monthly', None,
    }


def test_the_valid_values_use_an_UNDERSCORE_not_a_hyphen():
    # A guard keyed to a spelling goes blind.
    assert VALID_SPENDING_TYPES == ('fixed', 'flexible', 'non_monthly')
    assert 'non-monthly' not in VALID_SPENDING_TYPES


def test_an_unknown_category_gets_no_default():
    # A user's own category is theirs to classify. finPal does not guess.
    assert default_for_path('Boat maintenance') is None
    assert default_for_path('Housing/Moat cleaning') is None


def test_default_for_path_is_case_and_whitespace_exact():
    # Names are user-editable, so a fuzzy match would reclassify a renamed
    # category behind the user's back.
    assert default_for_path('food/groceries') is None
    assert default_for_path(' Food/Groceries ') is None
    assert default_for_path('Food / Groceries') is None


def test_category_path_builds_the_key_from_a_name_and_its_parent():
    assert category_path('Housing', None) == 'Housing'
    assert category_path('Gas', 'Housing') == 'Housing/Gas'
    # "Rent/Mortgage" contains a slash of its own. The key is still unique, and
    # splitting it back apart is never something the map needs to do.
    assert category_path('Rent/Mortgage', 'Housing') == 'Housing/Rent/Mortgage'


def test_a_parent_named_none_is_not_the_string_None():
    # A bug shape worth pinning: f-string interpolation of a None parent would
    # produce the key "None/Gas" and silently match nothing.
    assert 'None/Gas' not in DEFAULT_SPENDING_TYPES
    assert category_path('Gas', None) == 'Gas'
