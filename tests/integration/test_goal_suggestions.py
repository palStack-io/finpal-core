"""Goals a user's figures argue for, from predicates that already existed.

*** THIS MODULE ADDS NO ARITHMETIC. *** `services/literacy/checks.py` already
decides whether somebody has debt and no savings goal; a suggestion is that
predicate with a second reader. The tests therefore assert the MAP and the
refusals, not the underlying conditions, which have their own tests.
"""
from datetime import datetime
from decimal import Decimal

from src.extensions import db as _db
from src.models.goal import Goal
from src.services.goal.suggest import suggestions_for
from tests.factories import UserFactory, AccountFactory


def _card(user_id, balance=-800.0, apr='19.99'):
    account = AccountFactory(user_id=user_id, name='Visa', type='credit', balance=balance)
    account.apr = Decimal(apr)
    _db.session.commit()
    return account


def _goal(user_id, kind, name='G', status='active'):
    goal = Goal(user_id=user_id, name=name, kind=kind, status=status,
                start_amount=Decimal('0'), target_amount=Decimal('1000'),
                currency_code='USD')
    _db.session.add(goal)
    _db.session.commit()
    return goal


def test_debt_with_no_savings_goal_suggests_a_buffer_FIRST(db):
    """*** SHELTER BEFORE THE CLIMB. *** Lesson 12's argument, encoded as order.

    Somebody with debt and no buffer gets the buffer suggestion above the
    payoff one. Changing that order changes advice, not presentation.
    """
    user = UserFactory()
    _card(user.id)

    out = suggestions_for(user.id)
    assert out, 'a user with debt and no goals should be told something'
    assert out[0]['kind'] == 'savings'
    assert out[0]['lesson_slug'] == 'why-a-buffer-comes-first'
    # Voice rule 11: the condition is named, so the user can disagree with the
    # premise rather than only the advice.
    assert 'carrying debt' in out[0]['because']


def test_IT_NEVER_SUGGESTS_A_GOAL_THAT_ALREADY_EXISTS(db):
    """Telling somebody to do a thing they have done is how a prompt becomes noise.

    `has_debt_account_with_a_rate` describes the ACCOUNT, not the goal, so
    nothing in the predicate itself prevents this.
    """
    user = UserFactory()
    _card(user.id)
    _goal(user.id, 'savings')          # silences the buffer suggestion
    _goal(user.id, 'payoff')           # must silence the payoff one

    assert [s['kind'] for s in suggestions_for(user.id)] == []


def test_NOTHING_TO_SAY_IS_AN_ANSWER(db):
    """A page that always has advice is a page whose advice means nothing.

    Same reason `coverage` returns `None` for a dormant act rather than zero.
    """
    user = UserFactory()
    AccountFactory(user_id=user.id, name='Checking', type='checking', balance=5000.0)
    _db.session.commit()
    assert suggestions_for(user.id) == []


def test_an_archived_savings_goal_does_not_count_as_having_one(db):
    """Somebody who archived it has abandoned it — the predicate's own rule."""
    user = UserFactory()
    _card(user.id)
    _goal(user.id, 'savings', status='archived')

    assert any(s['kind'] == 'savings' for s in suggestions_for(user.id))


def test_it_says_at_most_two_things(db):
    user = UserFactory()
    _card(user.id)
    assert len(suggestions_for(user.id, limit=2)) <= 2


def test_the_endpoint_never_takes_the_page_down(client, db, auth_headers):
    user = UserFactory()
    body = client.get('/api/v1/goals/suggestions', headers=auth_headers(user)).get_json()
    assert body['success'] is True
    assert isinstance(body['suggestions'], list)
