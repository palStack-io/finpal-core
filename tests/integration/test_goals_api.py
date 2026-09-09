"""/api/v1/goals -- CRUD, the snapshot, and what a client may not set.

Every assertion here reads the DATABASE or the payload, never a status code.
Every bug found across eight passes of this project returned 200 and rendered
fine.
"""
from decimal import Decimal

import pytest

from src.extensions import db as _db
from src.models.goal import Goal
from tests.factories import UserFactory, AccountFactory

ENDPOINT = '/api/v1/goals/'


@pytest.fixture
def user(db):
    return UserFactory(id='goals@test.com', name='Goals')


def test_creating_a_LINKED_goal_snapshots_the_balance_and_ignores_the_body(
        client, auth_headers, user):
    """*** THE SNAPSHOT IS THE WHOLE DESIGN AND IT CANNOT BE RETROFITTED. ***

    A client-supplied start on a linked goal would make the denominator a typed
    number, which is the one thing linking exists to prevent. The body here sends
    a flattering start; the row must hold the real balance.
    """
    account = AccountFactory(user_id=user.id, name='Chase Amazon', type='credit',
                             balance=Decimal('-1125.41'))
    _db.session.commit()

    resp = client.post(ENDPOINT, headers=auth_headers(user),
                       json={'name': 'Pay off Chase Amazon', 'kind': 'payoff',
                             'account_id': account.id, 'target_amount': '0.00',
                             'start_amount': '-10.00'})
    assert resp.status_code == 201, resp.get_json()

    stored = _db.session.get(Goal, resp.get_json()['goal']['id'])
    assert stored.start_amount == Decimal('-1125.41'), 'the body was believed'
    assert stored.account_id == account.id


def test_the_payload_carries_progress_direction_and_current_amount(
        client, auth_headers, user):
    """A client must never derive these -- two clients deriving one figure is
    D-101's shape. So the server has to actually ship them."""
    account = AccountFactory(user_id=user.id, name='Card', type='credit',
                             balance=Decimal('-450.00'))
    _db.session.commit()
    client.post(ENDPOINT, headers=auth_headers(user),
                json={'name': 'Payoff', 'account_id': account.id,
                      'target_amount': '0.00'})
    # The snapshot is -450 here, so create then move the balance to see progress.
    account.balance = Decimal('-225.00')
    _db.session.commit()

    body = client.get(ENDPOINT, headers=auth_headers(user)).get_json()
    goal = body['goals'][0]
    assert goal['direction'] == 'paydown'
    assert goal['current_amount'] == -225.0
    assert abs(goal['progress'] - 0.5) < 0.0001
    assert goal['currency_code'], 'a figure with no currency is unrenderable'


def test_a_manual_goal_keeps_its_typed_figures(client, auth_headers, user):
    resp = client.post(ENDPOINT, headers=auth_headers(user),
                       json={'name': 'New laptop', 'target_amount': '2000.00',
                             'start_amount': '150.00', 'current_manual': '400.00'})
    assert resp.status_code == 201, resp.get_json()
    stored = _db.session.get(Goal, resp.get_json()['goal']['id'])
    assert stored.account_id is None
    assert stored.start_amount == Decimal('150.00')
    assert stored.current_manual == Decimal('400.00')


def test_a_client_cannot_declare_its_own_goal_ACHIEVED(client, auth_headers, user):
    """`achieved` is a badge. A client that could write it could award itself one.

    Asserted on the row: the request may well answer 200, because marshmallow
    drops an unknown value rather than complaining (`unknown=EXCLUDE`).
    """
    resp = client.post(ENDPOINT, headers=auth_headers(user),
                       json={'name': 'Cheat', 'target_amount': '100.00',
                             'status': 'achieved'})
    assert resp.status_code == 400, (
        'status=achieved must be refused by the validator, not silently dropped'
    )
    assert _db.session.query(Goal).filter_by(name='Cheat').first() is None


def test_a_goal_is_stamped_ACHIEVED_when_the_balance_reaches_the_target(
        client, auth_headers, user):
    """Nothing else runs when a balance moves, so the stamp happens on read."""
    account = AccountFactory(user_id=user.id, name='Fund', type='savings',
                             balance=Decimal('0.00'))
    _db.session.commit()
    created = client.post(ENDPOINT, headers=auth_headers(user),
                          json={'name': 'Emergency fund', 'account_id': account.id,
                                'target_amount': '1000.00'}).get_json()
    assert created['goal']['status'] == 'active'

    account.balance = Decimal('1000.00')
    _db.session.commit()

    body = client.get(ENDPOINT, headers=auth_headers(user)).get_json()
    assert body['goals'][0]['status'] == 'achieved'
    assert body['goals'][0]['achieved_at'] is not None
    _db.session.expire_all()
    assert _db.session.get(Goal, created['goal']['id']).status == 'achieved'


def test_target_equal_to_start_is_refused_with_400_not_a_500(
        client, auth_headers, user):
    """The one input that divides by zero, refused at the boundary."""
    account = AccountFactory(user_id=user.id, name='Flat', type='savings',
                             balance=Decimal('500.00'))
    _db.session.commit()
    resp = client.post(ENDPOINT, headers=auth_headers(user),
                       json={'name': 'Nowhere', 'account_id': account.id,
                             'target_amount': '500.00'})
    assert resp.status_code == 400, resp.get_json()


def test_a_goal_cannot_be_linked_to_an_account_the_caller_cannot_see(
        client, auth_headers, db):
    """404, not 403: answering 403 tells the caller the id exists."""
    stranger = UserFactory(id='demo9@finpal.app', is_demo_user=True)
    real = UserFactory(id='real9@test.com')
    hidden = AccountFactory(user_id=real.id, name='Hidden', type='savings')
    _db.session.commit()

    resp = client.post(ENDPOINT, headers=auth_headers(stranger),
                       json={'name': 'Reach', 'account_id': hidden.id,
                             'target_amount': '10.00'})
    assert resp.status_code == 404, resp.get_json()
    assert _db.session.query(Goal).count() == 0


def test_archiving_releases_the_account_for_a_new_goal(client, auth_headers, user):
    """The uniqueness index is `WHERE status = 'active'`, so this is the escape
    hatch that stops a finished goal locking the account forever."""
    account = AccountFactory(user_id=user.id, name='Pot', type='savings',
                             balance=Decimal('0.00'))
    _db.session.commit()
    first = client.post(ENDPOINT, headers=auth_headers(user),
                        json={'name': 'First', 'account_id': account.id,
                              'target_amount': '100.00'}).get_json()['goal']['id']

    blocked = client.post(ENDPOINT, headers=auth_headers(user),
                          json={'name': 'Second', 'account_id': account.id,
                                'target_amount': '200.00'})
    assert blocked.status_code == 400, 'the double-counting index did not fire'

    archived = client.post(f'{ENDPOINT}{first}/archive', headers=auth_headers(user))
    assert archived.status_code == 200, archived.get_json()
    assert archived.get_json()['goal']['status'] == 'archived'

    allowed = client.post(ENDPOINT, headers=auth_headers(user),
                          json={'name': 'Second', 'account_id': account.id,
                                'target_amount': '200.00'})
    assert allowed.status_code == 201, allowed.get_json()


def test_start_amount_and_account_id_are_not_updatable(client, auth_headers, user):
    """Re-pointing a goal, or restating its start, silently rewrites the
    denominator of a percentage the user has already been shown -- and for a
    linked goal the original snapshot cannot be recovered."""
    account = AccountFactory(user_id=user.id, name='A', type='savings',
                             balance=Decimal('100.00'))
    other = AccountFactory(user_id=user.id, name='B', type='savings',
                           balance=Decimal('900.00'))
    _db.session.commit()
    goal_id = client.post(ENDPOINT, headers=auth_headers(user),
                          json={'name': 'Fixed', 'account_id': account.id,
                                'target_amount': '500.00'}).get_json()['goal']['id']

    resp = client.put(f'{ENDPOINT}{goal_id}', headers=auth_headers(user),
                      json={'start_amount': '0.00', 'account_id': other.id,
                            'name': 'Renamed'})
    assert resp.status_code == 200, resp.get_json()

    _db.session.expire_all()
    stored = _db.session.get(Goal, goal_id)
    assert stored.name == 'Renamed', 'the editable field did not apply'
    assert stored.start_amount == Decimal('100.00'), 'start_amount was rewritten'
    assert stored.account_id == account.id, 'the goal was re-pointed'


def test_deleting_a_goal_removes_the_row(client, auth_headers, user):
    goal_id = client.post(ENDPOINT, headers=auth_headers(user),
                          json={'name': 'Gone', 'target_amount': '10.00'}
                          ).get_json()['goal']['id']
    assert client.delete(f'{ENDPOINT}{goal_id}',
                         headers=auth_headers(user)).status_code == 200
    _db.session.expire_all()
    assert _db.session.get(Goal, goal_id) is None
