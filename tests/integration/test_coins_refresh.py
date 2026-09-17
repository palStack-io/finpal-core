"""award_for_surface, and the refresh route: the same writer, narrowed to one page.

*** UNTIL THIS EXISTED THERE WAS NO AWARD MOMENT AT ALL. *** `award_for_user`
had exactly one production caller -- a cron at 04:30 -- so a user categorised
forty transactions and the coins arrived overnight, on a page they were not
looking at.
"""
import pytest

from src.extensions import db as _db
from src.models.coins import CoinAward
from src.models.goal import Goal
from src.services.literacy.acts import award_for_surface, award_for_user
from tests.factories import UserFactory

USER = 'refresh@test.com'


@pytest.fixture
def owner(db):
    u = UserFactory(id=USER, name='Refresh', password_plain='testpassword')
    _db.session.commit()
    return u


@pytest.fixture
def owner_with_a_goal(owner):
    _db.session.add(Goal(user_id=owner.id, name='Roof', start_amount=0,
                         target_amount=1000, status='active'))
    _db.session.commit()
    return owner


# ══════════════════════════════════════════════════════════════════════
# The service
# ══════════════════════════════════════════════════════════════════════

def test_it_awards_only_that_surfaces_acts(owner_with_a_goal):
    """Naming a goal must pay on `goals` and pay NOTHING on `rules`."""
    uid = owner_with_a_goal.id

    assert award_for_surface(uid, 'rules') == []
    _db.session.commit()
    assert CoinAward.query.filter_by(
        user_id=uid, act_slug='has_a_goal').first() is None

    earned = award_for_surface(uid, 'goals')
    _db.session.commit()
    assert [s for s, _ in earned] == ['has_a_goal']
    assert CoinAward.query.filter_by(
        user_id=uid, act_slug='has_a_goal').one().coins == 600


def test_calling_it_twice_awards_nothing_the_second_time(owner_with_a_goal):
    """*** IDEMPOTENCE IS WHAT MAKES THE CLIENT SAFE TO GET WRONG. ***"""
    uid = owner_with_a_goal.id

    first = award_for_surface(uid, 'goals')
    _db.session.commit()
    second = award_for_surface(uid, 'goals')
    _db.session.commit()

    assert first == [('has_a_goal', 600)]
    assert second == []


def test_an_unknown_surface_awards_nothing_and_does_not_raise(owner_with_a_goal):
    assert award_for_surface(owner_with_a_goal.id, 'tea_room') == []


def test_the_nightly_pass_still_collects_what_no_surface_fired(owner_with_a_goal):
    """*** THE CRON IS THE BACKSTOP AND MUST STAY ONE. *** A client that never
    calls refresh loses the MOMENT, never the COINS."""
    earned = award_for_user(owner_with_a_goal.id)
    _db.session.commit()
    assert ('has_a_goal', 600) in earned


# ══════════════════════════════════════════════════════════════════════
# The route
# ══════════════════════════════════════════════════════════════════════

def test_the_route_awards_and_returns_the_payoff_sentence(
        owner_with_a_goal, auth_headers, client):
    res = client.post('/api/v1/coins/refresh', json={'surface': 'goals'},
                      headers=auth_headers(owner_with_a_goal))
    assert res.status_code == 200, res.get_json()
    body = res.get_json()

    assert [a['slug'] for a in body['awarded']] == ['has_a_goal']
    assert body['awarded'][0]['coins'] == 600
    assert body['earned'] == 600
    assert body['balance'] == 600

    # *** ROLL BACK FIRST, OR THIS ASSERTION PROVES NOTHING — D-61's SHAPE. ***
    # The `db` fixture hands the test the SAME session the request used, so an
    # insert the handler never committed is still pending in it and autoflush
    # makes it visible to the very next query. Dropping `db.session.commit()`
    # from the handler passed this test until the rollback was added.
    # After a rollback, only what was actually COMMITTED survives.
    _db.session.rollback()
    assert CoinAward.query.filter_by(
        user_id=owner_with_a_goal.id, act_slug='has_a_goal').one().coins == 600


def test_the_route_is_idempotent(owner_with_a_goal, auth_headers, client):
    h = auth_headers(owner_with_a_goal)
    client.post('/api/v1/coins/refresh', json={'surface': 'goals'}, headers=h)
    again = client.post('/api/v1/coins/refresh', json={'surface': 'goals'},
                        headers=h).get_json()

    assert again['awarded'] == []
    assert again['earned'] == 600


def test_no_denominator_reaches_the_wire(
        owner_with_a_goal, auth_headers, client):
    """*** THE ASSERTION THAT MATTERS IS AN ABSENCE. *** A ceiling or a coverage
    fraction lets a client render "14 of 35", which decision 5 forbids."""
    body = client.post('/api/v1/coins/refresh', json={'surface': 'goals'},
                       headers=auth_headers(owner_with_a_goal)).get_json()
    assert body['awarded'], 'nothing was awarded — the absence check is vacuous'
    for award in body['awarded']:
        assert 'ceiling' not in award
        assert 'coverage' not in award
        assert 'total' not in award


def test_a_missing_surface_is_refused(owner, auth_headers, client):
    res = client.post('/api/v1/coins/refresh', json={},
                      headers=auth_headers(owner))
    assert res.status_code == 400
    assert 'error' in res.get_json()


def test_it_requires_a_token(client):
    assert client.post('/api/v1/coins/refresh',
                       json={'surface': 'goals'}).status_code == 401
