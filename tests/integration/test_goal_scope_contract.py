"""A household goal is a SHARED thing, so its read predicate is the same-side one.

*** NOT `is_household_member` ON BOTH SIDES. *** That is right for OWNERSHIP (D-81)
and it forbids demo->demo, which breaks the public demo -- and it is invisible to
any test that only builds real users. Both refusals and both permissions are
asserted.

*** AND NOT `read_scope` EITHER, WHICH IS THE TRAP THIS FILE EXISTS TO CATCH. ***
`read_scope`/`visible_user_ids` collapses a demo caller to ITSELF, which is exactly
right for reading a housemate's money and exactly wrong for a shared thing: on the
public demo, one persona would not see another's household goal. Reaching for the
familiar scope helper here passes every test built from real users.
"""

from decimal import Decimal

from src.extensions import db as _db
from src.models.goal import Goal
from tests.factories import UserFactory


def _make_goal(user, scope, name='A goal'):
    g = Goal(user_id=user.id, name=name, kind='savings', scope=scope,
             account_id=None, target_amount=Decimal('1000'),
             start_amount=Decimal('0'), current_manual=Decimal('0'),
             currency_code='USD', status='active')
    _db.session.add(g); _db.session.commit()
    return g


def _names(client, user, auth_headers):
    resp = client.get('/api/v1/goals', headers=auth_headers(user))
    assert resp.status_code == 200, resp.get_json()
    body = resp.get_json()
    return {g['name'] for g in body.get('goals', body)}


def test_a_household_goal_is_visible_to_every_member(client, auth_headers, db):
    owner = UserFactory(id='owner@test.com')
    member = UserFactory(id='member@test.com')
    _make_goal(owner, 'household', name='Ours')

    assert 'Ours' in _names(client, member, auth_headers)


def test_a_personal_goal_is_visible_only_to_its_owner(client, auth_headers, db):
    owner = UserFactory(id='owner2@test.com')
    member = UserFactory(id='member2@test.com')
    _make_goal(owner, 'personal', name='Mine')

    assert 'Mine' in _names(client, owner, auth_headers)
    assert 'Mine' not in _names(client, member, auth_headers)


def test_two_DEMO_users_can_see_each_others_household_goals(client, auth_headers, db):
    """The case `is_household_member` on both sides gets WRONG.

    That predicate is right for OWNERSHIP (D-81) and it forbids demo -> demo, which
    breaks the public demo -- invisibly to any test that only builds real users.
    This is the test that discriminates between the two predicates.
    """
    demo_a = UserFactory(id='demo1@finpal.app', is_demo_user=True)
    demo_b = UserFactory(id='demo2@finpal.app', is_demo_user=True)
    _make_goal(demo_a, 'household', name='Demo shared')

    assert 'Demo shared' in _names(client, demo_b, auth_headers)


def test_a_demo_user_cannot_see_a_REAL_household_goal_and_vice_versa(client, auth_headers, db):
    """Both directions. D-79 and D-81 were two unreported sandbox leaks found
    exactly by testing the inverse of the reported symptom."""
    demo = UserFactory(id='demo3@finpal.app', is_demo_user=True)
    real = UserFactory(id='real@test.com')
    _make_goal(real, 'household', name='Real shared')
    _make_goal(demo, 'household', name='Demo shared')

    assert 'Real shared' not in _names(client, demo, auth_headers)
    assert 'Demo shared' not in _names(client, real, auth_headers)


def test_a_demo_users_own_PERSONAL_goal_is_still_their_own(client, auth_headers, db):
    """The sandbox has to work internally, not just be sealed off."""
    demo = UserFactory(id='demo4@finpal.app', is_demo_user=True)
    other = UserFactory(id='demo5@finpal.app', is_demo_user=True)
    _make_goal(demo, 'personal', name='Demo private')

    assert 'Demo private' in _names(client, demo, auth_headers)
    assert 'Demo private' not in _names(client, other, auth_headers)


def test_a_member_may_not_EDIT_a_household_goal_they_do_not_own(client, auth_headers, db):
    """*** VISIBLE IS NOT WRITABLE, AND THIS IS THE PAIR THAT PROVES IT. ***

    Widening the read to every member is the whole point of `scope='household'`.
    Widening the WRITE with it would be D-47 all over again -- reads went
    household-wide and mutation had to be pulled back to owner-or-admin after a
    housemate could delete another member's account. 403, not 404: the goal was
    found through the read scope, and answering 404 would mean that scope had
    silently narrowed (D-43).
    """
    owner = UserFactory(id='howner@test.com')
    member = UserFactory(id='hmember@test.com')
    goal = _make_goal(owner, 'household', name='Ours to see')

    resp = client.put(f'/api/v1/goals/{goal.id}', headers=auth_headers(member),
                      json={'name': 'Mine now'})
    assert resp.status_code == 403, resp.get_json()

    _db.session.expire_all()
    assert _db.session.get(Goal, goal.id).name == 'Ours to see'
