"""Coverage for the eight universal acts.

*** THE TEST THAT MATTERS IS THAT A USER WHO HAS DONE EVERYTHING AVAILABLE TO
THEM REACHES EXACTLY 1. *** Every promise in the design rests on it: if any act
caps below 1, it never pays its ceiling, the maximum stops being reachable, and
the kit stops being affordable. The sharpest case is D-189 — income categories
can never carry a `spending_type`, so counting them in the denominator would cap
`categories_classified` for ever.

The second thing asserted here is that a **dormant** act returns `None`, never
`Decimal('0')`. Zero says *you are failing at this*; absent says *this does not
apply to you*, which is the truth for a user with no credit card.
"""

import datetime
from decimal import Decimal

import pytest

from src.extensions import db as _db
from src.models.budget import Budget
from src.models.category import Category
from src.models.goal import Goal
from src.models.recurring import RecurringExpense
from src.models.transaction_rule import TransactionRule
from src.services.literacy import coverage
from tests.factories import AccountFactory, CategoryFactory, ExpenseFactory, UserFactory

DONE = 'complete@test.com'
BARE = 'bare@test.com'
ONE = Decimal('1')


def _expense(user_id, account_id, category_id, amount, day=1):
    return ExpenseFactory(
        user_id=user_id, account_id=account_id, category_id=category_id,
        amount=-amount, description=f'row-{category_id}-{amount}',
        date=datetime.date(2026, 8, day), transaction_type='expense')


@pytest.fixture
def complete(db):
    """A user who has done every universal act available to them."""
    user = UserFactory(id=DONE, name='Complete')
    acct = AccountFactory(user_id=user.id, name='Checking', type='checking',
                          balance=1000.0)
    acct.type_source = 'user'
    acct.import_source = 'simplefin'
    rent = CategoryFactory(user_id=user.id, name='Rent')
    food = CategoryFactory(user_id=user.id, name='Food')
    # *** THE D-189 CASE: an income category, which can NEVER carry a
    # spending_type. If it lands in the denominator this user can never finish.
    salary = CategoryFactory(user_id=user.id, name='Salary')
    _db.session.commit()
    rent.spending_type, rent.kind = 'fixed', 'expense'
    food.spending_type, food.kind = 'flexible', 'expense'
    salary.kind = 'income'
    _db.session.commit()

    _expense(user.id, acct.id, rent.id, 1800, day=1)
    _expense(user.id, acct.id, food.id, 200, day=2)
    # Money recorded against the income category — it is spend-shaped in the
    # table but its category can never be classified.
    _expense(user.id, acct.id, salary.id, 50, day=3)

    _db.session.add_all([
        Goal(user_id=user.id, name='Buffer', start_amount=0,
             target_amount=1000, status='active'),
        Budget(user_id=user.id, category_id=food.id, amount=300,
               period='monthly', active=True),
        RecurringExpense(user_id=user.id, description='Salary', amount=2500,
                         card_used='Checking', split_method='none',
                         paid_by=user.id, transaction_type='income',
                         frequency='monthly', active=True,
                         start_date=datetime.datetime(2026, 3, 1)),
        TransactionRule(user_id=user.id, name='Coffee', pattern='COFFEE',
                        active=True),
    ])
    _db.session.commit()
    return user


@pytest.fixture
def bare(db):
    """A user with nothing at all — every weighted act must be dormant."""
    UserFactory(id=BARE, name='Bare')
    _db.session.commit()


UNIVERSAL = [
    'accounts_confirmed', 'transactions_categorised', 'categories_classified',
    'has_a_goal', 'has_a_budget', 'income_recorded', 'taught_a_rule',
    'bank_connected',
]


@pytest.mark.parametrize('act', UNIVERSAL)
def test_a_user_who_has_done_everything_reaches_EXACTLY_one(complete, act):
    got = getattr(coverage, act)(DONE)
    assert got == ONE, (
        f'{act} capped at {got} for a user who has done everything available to '
        'them. It can never pay its ceiling, so the kit stops being affordable.')


def test_the_income_category_is_EXCLUDED_rather_than_counted_as_unclassified(complete):
    """*** D-189, PROVEN BY MOVING THE CATEGORY IN AND OUT OF THE DENOMINATOR. ***

    `Category.kind == 'income'` is what makes a category unable to carry a
    `spending_type`. With the exclusion, this user is finished. Clear the marker
    so the same row counts as an ordinary expense category, and coverage must
    drop below 1 — which is exactly the trap: the user would be permanently
    unfinished through no fault of their own.
    """
    assert coverage.categories_classified(DONE) == ONE

    salary = Category.query.filter_by(user_id=DONE, name='Salary').one()
    salary.kind = None                     # now it counts, and it is unclassified
    _db.session.commit()

    assert coverage.categories_classified(DONE) < ONE, (
        'the income category was not in the denominator to begin with, so this '
        'test proves nothing — check the fixture records spend against it.')


@pytest.mark.parametrize('act', [
    'accounts_confirmed', 'transactions_categorised', 'categories_classified',
    'has_a_budget', 'bank_connected',
])
def test_a_user_with_nothing_is_DORMANT_not_zero(bare, act):
    got = getattr(coverage, act)(BARE)
    assert got is None, (
        f'{act} returned {got!r} for a user with no data. Zero says "you are '
        'failing at this"; absent says "this does not apply to you yet".')


@pytest.mark.parametrize('act', ['has_a_goal', 'income_recorded', 'taught_a_rule'])
def test_the_acts_every_user_can_always_do_are_never_dormant(bare, act):
    assert getattr(coverage, act)(BARE) == Decimal('0')


def test_coverage_is_weighted_by_AMOUNT_not_by_COUNT(db):
    """*** THE RENT OUTWEIGHS TWENTY COFFEES, BECAUSE IT TEACHES MORE. ***"""
    user = UserFactory(id='weighted@test.com', name='Weighted')
    acct = AccountFactory(user_id=user.id, name='C', type='checking', balance=0.0)
    cat = CategoryFactory(user_id=user.id, name='Housing')
    _db.session.commit()
    cat.spending_type, cat.kind = 'fixed', 'expense'
    _db.session.commit()

    _expense(user.id, acct.id, cat.id, 1800, day=1)          # categorised
    for i in range(20):                                       # not categorised
        ExpenseFactory(user_id=user.id, account_id=acct.id, category_id=None,
                       amount=-3.0, description=f'coffee-{i}',
                       date=datetime.date(2026, 8, 5), transaction_type='expense')
    _db.session.commit()

    got = coverage.transactions_categorised('weighted@test.com')
    # By count this would be 1/21 = 0.048. By amount it is 1800/1860 = 0.968.
    assert got > Decimal('0.9'), f'weighted by count, not amount: {got}'
