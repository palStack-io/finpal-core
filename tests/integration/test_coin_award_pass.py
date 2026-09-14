"""The award pass: the ratchet, and D-205's mistake not re-made one service over.

*** ALMOST EVERY ACT IS GOAL-INDEPENDENT. *** learnPal's unlock pass looped over
`Goal.user_id` and so never reached a user with no goal (D-205). The same filter
here would be the same defect with a different name, and it would silently empty
base camp — the screen whose whole audience is people who have not set a goal.
"""

import datetime
from decimal import Decimal

import pytest

from src.extensions import db as _db
from src.models.account import Account
from src.models.coins import CoinAward
from src.models.goal import Goal
from src.repositories.coins import CoinRepository
from src.services.literacy.acts import award_all_users, award_for_user
from tests.factories import AccountFactory, CategoryFactory, ExpenseFactory, UserFactory


def _spender(user_id, categorised=True):
    user = UserFactory(id=user_id, name=user_id)
    acct = AccountFactory(user_id=user.id, name='C', type='checking', balance=500.0)
    cat = CategoryFactory(user_id=user.id, name='Rent')
    _db.session.commit()
    cat.spending_type, cat.kind = 'fixed', 'expense'
    acct.type_source = 'user'
    _db.session.commit()
    ExpenseFactory(user_id=user.id, account_id=acct.id,
                   category_id=cat.id if categorised else None,
                   amount=-1800.0, description='rent',
                   date=datetime.date(2026, 8, 1), transaction_type='expense')
    _db.session.commit()
    return user


def test_a_user_with_NO_GOAL_is_awarded(db, app):
    """*** D-205's SHAPE, GUARDED ONE SERVICE OVER. ***"""
    _spender('nogoal@test.com')
    assert Goal.query.filter_by(user_id='nogoal@test.com').count() == 0

    award_all_users(app)

    assert CoinRepository().earned('nogoal@test.com') > 0, (
        'a user with no goal earned nothing — the award pass has re-made '
        'D-205 by filtering the population it walks.')


def test_running_the_pass_twice_awards_nothing_the_second_time(db, app):
    _spender('twice@test.com')
    award_all_users(app)
    first = CoinRepository().earned('twice@test.com')

    award_all_users(app)

    assert CoinRepository().earned('twice@test.com') == first


def test_coverage_FALLING_takes_nothing_back(db, app):
    """A user categorises everything, then imports a pile of uncategorised rows.
    Coverage genuinely drops. Coins must not."""
    user = _spender('falling@test.com')
    award_for_user(user.id)
    _db.session.commit()
    before = CoinRepository().earned(user.id)
    assert before > 0

    acct_id = Account.query.filter_by(user_id=user.id).first().id
    for i in range(30):
        ExpenseFactory(user_id=user.id, account_id=acct_id, category_id=None,
                       amount=-100.0, description=f'unsorted-{i}',
                       date=datetime.date(2026, 9, 1), transaction_type='expense')
    _db.session.commit()

    award_for_user(user.id)
    _db.session.commit()

    assert CoinRepository().earned(user.id) == before, 'coins were taken back'


def test_a_dormant_act_writes_NO_ROW_AT_ALL(db, app):
    """Absent, not zero. A zero row would turn *this does not apply to you* into
    a score you are failing at."""
    _spender('nodebt@test.com')
    award_all_users(app)

    slugs = {row.act_slug for row in
             CoinAward.query.filter_by(user_id='nodebt@test.com').all()}
    assert 'debt_rates' not in slugs
    assert 'debt_limits' not in slugs


def test_one_users_failure_does_not_cost_everybody_else_their_coins(db, app, monkeypatch):
    """D-61's lesson: per-user commit, never one transaction for the night."""
    _spender('good@test.com')
    _spender('bad@test.com')

    import src.services.literacy.acts as acts_mod
    real = acts_mod.award_for_user

    def selective(user_id):
        if user_id == 'bad@test.com':
            raise RuntimeError('this user explodes')
        return real(user_id)

    monkeypatch.setattr(acts_mod, 'award_for_user', selective)
    award_all_users(app)

    assert CoinRepository().earned('good@test.com') > 0
    assert CoinRepository().earned('bad@test.com') == 0
