"""D-205 — the nightly pass looped over users who HAVE a goal.

*** SEVEN OF THE THIRTEEN PREDICATES NEED NO GOAL AT ALL. *** A user who
categorises 200 transactions, sets a budget and records an APR earned nothing,
for ever, and was told nothing about why. That population is exactly the one
"base camp" is designed for.

Every one of the twenty tests in `test_learnpal_engine.py` gives its user a goal
in the fixture, so the suite was blind to this by construction — a fixture that
cannot produce the real case cannot catch the real defect (D-165's rule, in the
population rather than in the payload).
"""

import datetime

import pytest

from src.extensions import db as _db
from src.models.goal import Goal
from src.modules.learnpal.engine import sync_all_users
from src.modules.learnpal.models import LearnCompletion, LearnMilestone
from src.modules.learnpal.seed import seed_milestones
from tests.factories import (
    AccountFactory, CategoryFactory, ExpenseFactory, UserFactory,
)


@pytest.fixture
def seeded(db):
    seed_milestones()
    return LearnMilestone.query.count()


def _slugs(user_id):
    return {
        row.milestone_slug
        for row in LearnCompletion.query.filter_by(user_id=user_id).all()
    }


def _twenty_categorised(user_id):
    """Enough to satisfy `categorised_transactions_at_least` with n=20."""
    account = AccountFactory(
        user_id=user_id, name='Checking', type='checking', balance=100.0)
    category = CategoryFactory(user_id=user_id, name='Food')
    _db.session.commit()
    for i in range(20):
        ExpenseFactory(
            user_id=user_id, account_id=account.id, category_id=category.id,
            amount=-5.0, description=f'row-{i}',
            date=datetime.date(2026, 1, 1), transaction_type='expense')
    _db.session.commit()


def test_a_user_with_no_goal_still_unlocks(seeded, app):
    user = UserFactory(id='nogoal@test.com', name='No Goal')
    _twenty_categorised(user.id)
    assert Goal.query.filter_by(user_id=user.id).count() == 0

    sync_all_users(app)

    assert 'where-your-money-goes' in _slugs(user.id)


def test_a_user_with_a_goal_is_unaffected(seeded, app):
    """The control. Fixing the loop must not cost the existing population."""
    user = UserFactory(id='hasgoal@test.com', name='Has Goal')
    _twenty_categorised(user.id)
    _db.session.add(Goal(user_id=user.id, name='Anything',
                         start_amount=0, target_amount=100, status='active'))
    _db.session.commit()

    sync_all_users(app)

    assert 'where-your-money-goes' in _slugs('hasgoal@test.com')


def test_a_user_with_no_data_at_all_unlocks_nothing_and_does_not_raise(seeded, app):
    """The new population must not produce spurious unlocks or errors."""
    UserFactory(id='empty@test.com', name='Empty')

    sync_all_users(app)

    assert _slugs('empty@test.com') == set()
