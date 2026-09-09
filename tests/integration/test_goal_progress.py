"""One formula, no branching: (current - start) / (target - start).

*** THE PAYOFF ROWS ARE THE REASON THERE IS NO BRANCHING. *** Card debt is a
NEGATIVE balance -- `balances.py::_move` applies one rule for every account type
with no `type == 'credit'` special case -- so a paydown goal runs from -1,125.41
toward 0 and the same expression absorbs it. These three cases are copied from the
architecture spec's table.
"""
from datetime import date
from decimal import Decimal

import pytest

from src.extensions import db as _db
from src.models.goal import Goal
from src.services.goal.service import GoalService
from tests.factories import UserFactory, AccountFactory


def _goal(user, account=None, **kw):
    g = Goal(user_id=user.id, name=kw.pop('name', 'A goal'),
             kind=kw.pop('kind', 'savings'), scope=kw.pop('scope', 'personal'),
             account_id=account.id if account else None,
             currency_code='USD', start_date=date(2026, 1, 1),
             status='active', **kw)
    _db.session.add(g); _db.session.commit()
    return g


@pytest.mark.parametrize('start,target,current,expected', [
    ('1000.00', '10000.00', '4000.00', '0.3333'),   # save $10k emergency fund
    ('-1125.41', '0.00', '-450.00', '0.6002'),      # pay off Chase Amazon
    ('-1125.41', '-500.00', '-800.00', '0.5203'),   # pay card down to $500 owed
])
def test_the_specs_worked_examples(db, start, target, current, expected):
    user = UserFactory()
    account = AccountFactory(user_id=user.id, name='Acct', type='checking',
                             balance=Decimal(current))
    goal = _goal(user, account, start_amount=Decimal(start),
                 target_amount=Decimal(target))

    got = GoalService().progress(goal)
    assert abs(got - Decimal(expected)) < Decimal('0.001'), f'got {got}'


def test_direction_is_derived_not_stored(db):
    user = UserFactory()
    up = _goal(user, start_amount=Decimal('0'), target_amount=Decimal('100'),
               current_manual=Decimal('0'))
    down = _goal(user, start_amount=Decimal('-100'), target_amount=Decimal('0'),
                 current_manual=Decimal('-100'))
    svc = GoalService()
    assert svc.direction(up) == 'accumulate'
    assert svc.direction(down) == 'paydown'
    assert 'direction' not in Goal.__table__.columns, 'direction must not be a column'


@pytest.mark.parametrize('start,target,expected', [
    ('1000.00', '10000.00', 'accumulate'),   # save $10k emergency fund
    ('-1125.41', '0.00', 'paydown'),         # pay off Chase Amazon
    ('-1125.41', '-500.00', 'paydown'),      # pay card down to $500 owed
])
def test_direction_on_the_specs_own_examples(db, start, target, expected):
    """*** THE ROW THAT DISPROVED THE SPEC'S STATED RULE. ***

    The spec said `accumulate` if `target > start`. Its own second example -- "Pay
    off Chase Amazon", -1,125.41 -> 0 -- has `target > start`, because card debt is
    a negative balance, so that rule calls every payoff goal an accumulation. Both
    consumers of `direction` break under it: the presentation tells the user a
    falling debt is a rising number, and the `(account_id, direction)` uniqueness
    index stops conflating what it should and starts conflating what it should not.
    """
    user = UserFactory()
    goal = _goal(user, None, start_amount=Decimal(start),
                 target_amount=Decimal(target))
    assert GoalService().direction(goal) == expected


def test_target_equal_to_start_is_refused(db):
    """The only input that divides by zero. Refused at validation, so the
    formula never has to branch."""
    with pytest.raises(ValueError):
        GoalService().validate(start_amount=Decimal('500'),
                               target_amount=Decimal('500'))


def test_progress_is_never_clamped(db):
    """Overshooting is real information and the caller decides how to show it.

    Clamping in the service would make "saved 140% of target" indistinguishable
    from "saved exactly the target", and `stamp_if_achieved` reads this number.
    """
    user = UserFactory()
    account = AccountFactory(user_id=user.id, name='Over', type='savings',
                             balance=Decimal('1400.00'))
    goal = _goal(user, account, start_amount=Decimal('0'),
                 target_amount=Decimal('1000.00'))
    assert GoalService().progress(goal) == Decimal('1.4')


def test_an_achievement_cannot_un_happen(db):
    """Stamped once. A later transaction that moves the balance back must not
    retract a badge the user has already been shown."""
    user = UserFactory()
    account = AccountFactory(user_id=user.id, name='Fund', type='savings',
                             balance=Decimal('10000.00'))
    goal = _goal(user, account, start_amount=Decimal('0'),
                 target_amount=Decimal('10000.00'))
    svc = GoalService()

    assert svc.stamp_if_achieved(goal) is True
    assert goal.status == 'achieved' and goal.achieved_at is not None

    account.balance = Decimal('20.00')
    _db.session.commit()
    svc.stamp_if_achieved(goal)
    assert goal.status == 'achieved', 'an achievement was retracted'


def test_stamping_is_idempotent_and_reports_it(db):
    """The second call must answer False, or a caller that awards points on a
    True return awards them again on every read."""
    user = UserFactory()
    account = AccountFactory(user_id=user.id, name='Fund2', type='savings',
                             balance=Decimal('500.00'))
    goal = _goal(user, account, start_amount=Decimal('0'),
                 target_amount=Decimal('500.00'))
    svc = GoalService()
    assert svc.stamp_if_achieved(goal) is True
    assert svc.stamp_if_achieved(goal) is False


def test_a_manual_goal_uses_current_manual_and_a_linked_one_ignores_it(db):
    """Linking is what makes a goal honest: a typed number can be inflated, a
    linked balance cannot. Gamification pays only for linked goals."""
    user = UserFactory()
    account = AccountFactory(user_id=user.id, name='Real', type='savings',
                             balance=Decimal('250.00'))
    linked = _goal(user, account, start_amount=Decimal('0'),
                   target_amount=Decimal('1000.00'),
                   current_manual=Decimal('999.00'))
    manual = _goal(user, None, start_amount=Decimal('0'),
                   target_amount=Decimal('1000.00'),
                   current_manual=Decimal('250.00'))
    svc = GoalService()
    assert svc.current_amount(linked) == Decimal('250.00')
    assert svc.current_amount(manual) == Decimal('250.00')


def test_a_manual_goal_with_no_typed_figure_reads_as_the_start(db):
    """`current_manual` is nullable and a freshly created manual goal has none.

    Returning None here would make `progress` raise a TypeError on a goal the API
    just created -- so the absence of a typed figure means "no progress yet",
    which is what the start_amount snapshot already records.
    """
    user = UserFactory()
    goal = _goal(user, None, start_amount=Decimal('100.00'),
                 target_amount=Decimal('1000.00'))
    svc = GoalService()
    assert svc.current_amount(goal) == Decimal('100.00')
    assert svc.progress(goal) == Decimal('0')
