"""One ACTIVE goal per (account, direction). Enforced in the SCHEMA.

The gaming vector: two members each create a *personal* goal linked to the same
joint account and both earn points for the same dollars. An application-level
check races -- two requests can each read "no existing goal" before either
writes -- and a constraint does not.

*** THE INDEX AND `GoalService.direction` ARE TWO DEFINITIONS OF ONE RULE, WHICH
IS THE DUPLICATION D-18 WAS OPENED FOR. *** The last test in this file is the
mitigation: it drives the SQL expression and the Python function over the same
matrix and fails if they ever disagree.
"""
from datetime import date
from decimal import Decimal

import pytest
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError

from src.extensions import db as _db
from src.models.goal import Goal
from src.services.goal.service import GoalService
from tests.factories import UserFactory, AccountFactory


def _goal(user, account=None, **kw):
    g = Goal(user_id=user.id, name=kw.pop('name', 'A goal'),
             kind=kw.pop('kind', 'savings'), scope=kw.pop('scope', 'personal'),
             account_id=account.id if account else None,
             currency_code='USD', start_date=date(2026, 1, 1),
             status=kw.pop('status', 'active'), **kw)
    _db.session.add(g); _db.session.commit()
    return g


def test_two_active_goals_cannot_point_at_the_same_account_and_direction(db):
    """The gaming vector: two members, one joint account, both paid for the same
    dollars. Enforced in the schema because an application check races."""
    a, b = UserFactory(id='a@test.com'), UserFactory(id='b@test.com')
    joint = AccountFactory(user_id=a.id, name='Joint', type='savings',
                           balance=Decimal('0'))
    _db.session.commit()
    _goal(a, joint, start_amount=Decimal('0'), target_amount=Decimal('5000'))

    with pytest.raises(IntegrityError):
        _goal(b, joint, start_amount=Decimal('0'), target_amount=Decimal('5000'))
    _db.session.rollback()


def test_the_SAME_account_may_carry_one_goal_of_EACH_direction(db):
    """The reason the index is on `direction` and not on `account_id` alone.

    A credit card can honestly be both "pay this down to zero" and -- once it is --
    nothing else; but an offset/overdraft account can carry a paydown and a savings
    goal at once, and forbidding that would be stricter than the spec asks.
    """
    a = UserFactory(id='both@test.com')
    acct = AccountFactory(user_id=a.id, name='Flex', type='checking',
                          balance=Decimal('0'))
    _db.session.commit()

    up = _goal(a, acct, start_amount=Decimal('0'), target_amount=Decimal('5000'))
    down = _goal(a, acct, start_amount=Decimal('-800'), target_amount=Decimal('0'))

    svc = GoalService()
    assert svc.direction(up) == 'accumulate'
    assert svc.direction(down) == 'paydown'
    assert up.id is not None and down.id is not None


def test_an_ARCHIVED_goal_does_not_block_a_new_one(db):
    """`WHERE status='active'` is the point: finishing a goal must not lock the
    account forever."""
    a = UserFactory(id='c@test.com')
    acct = AccountFactory(user_id=a.id, name='Fund', type='savings', balance=Decimal('0'))
    _db.session.commit()
    old = _goal(a, acct, start_amount=Decimal('0'), target_amount=Decimal('100'))
    old.status = 'archived'; _db.session.commit()

    fresh = _goal(a, acct, start_amount=Decimal('0'), target_amount=Decimal('200'))
    assert fresh.id is not None


def test_an_ACHIEVED_goal_does_not_block_a_new_one_either(db):
    """`status='achieved'` is also not active. A user who hits a savings target
    must be able to set the next one on the same account."""
    a = UserFactory(id='d@test.com')
    acct = AccountFactory(user_id=a.id, name='Fund', type='savings', balance=Decimal('0'))
    _db.session.commit()
    done = _goal(a, acct, start_amount=Decimal('0'), target_amount=Decimal('100'))
    done.status = 'achieved'; _db.session.commit()

    assert _goal(a, acct, start_amount=Decimal('0'), target_amount=Decimal('500')).id


def test_manual_goals_are_not_constrained_by_each_other(db):
    """`account_id IS NULL` means there is no shared pot to double-count, and a
    NULL does not collide in a unique index on either engine. Asserted rather
    than assumed, because the two engines HAVE differed here before (D-123)."""
    a = UserFactory(id='e@test.com')
    one = _goal(a, None, start_amount=Decimal('0'), target_amount=Decimal('100'))
    two = _goal(a, None, start_amount=Decimal('0'), target_amount=Decimal('100'))
    assert one.id != two.id


def test_the_sql_expression_and_the_python_function_agree(db):
    """*** THE ANTI-DRIFT GUARD. ***

    `direction` is derived in Python and re-derived in SQL by the index. Two
    definitions of one rule is exactly what D-18 was opened to remove, and here it
    is unavoidable -- a partial unique index cannot call a Python method. So the
    duplication is made safe by proving the two agree, on the boundaries as well
    as the ordinary cases.

    A drifted index does not raise: it silently constrains the wrong pairs, which
    is a defect no status code and no green write path would show.
    """
    from src.models.goal import DIRECTION_SQL

    user = UserFactory(id='matrix@test.com')
    matrix = [
        ('1000.00', '10000.00'),   # save
        ('-1125.41', '0.00'),      # pay a card off
        ('-1125.41', '-500.00'),   # pay a card down
        ('0.00', '100.00'),        # from nothing
        ('-100.00', '-200.00'),    # deeper into debt
        ('1000.00', '500.00'),     # spend down
        ('-0.01', '0.00'),         # the boundary either side of zero
        ('0.00', '-0.01'),
    ]
    svc = GoalService()
    for start, target in matrix:
        goal = _goal(user, None, start_amount=Decimal(start),
                     target_amount=Decimal(target))
        in_sql = _db.session.execute(
            text(f'SELECT {DIRECTION_SQL} FROM goals WHERE id = :i'),
            {'i': goal.id}).scalar()
        assert in_sql == svc.direction(goal), (
            f'start={start} target={target}: SQL says {in_sql!r}, '
            f'GoalService.direction says {svc.direction(goal)!r}'
        )
