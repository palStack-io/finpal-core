"""The acknowledgement watermark.

*** A BOOLEAN FLAG CANNOT EXPRESS THE CASE THAT MATTERS. *** An act whose
coverage rises 0.4 -> 0.8 earns a SECOND time and deserves a second moment. A
`seen` boolean would swallow it. So the ack stores the coin figure that was
seen, and unseen is `award.coins > ack.coins_seen`.
"""
from decimal import Decimal

import pytest

from src.extensions import db as _db
from src.models.coins import CoinAward, CoinAwardAck
from src.repositories.coins import CoinRepository
from tests.factories import UserFactory

USER = 'ack@test.com'


@pytest.fixture
def owner(db):
    u = UserFactory(id=USER, name='Ack', password_plain='testpassword')
    _db.session.commit()
    return u


def _award(user_id, slug, coins, coverage='1.0'):
    row = CoinAward.query.filter_by(user_id=user_id, act_slug=slug).first()
    if row is None:
        row = CoinAward(user_id=user_id, act_slug=slug,
                        coverage=Decimal(coverage), coins=coins)
        _db.session.add(row)
    else:
        row.coins, row.coverage = coins, Decimal(coverage)
    _db.session.commit()
    return row


def test_a_fresh_award_is_unseen(owner):
    _award(owner.id, 'has_a_goal', 600)
    assert CoinRepository().unseen(owner.id) == [('has_a_goal', 600)]


def test_acknowledging_clears_it(owner):
    _award(owner.id, 'has_a_goal', 600)
    repo = CoinRepository()
    repo.ack(owner.id, 'has_a_goal')
    _db.session.commit()
    assert repo.unseen(owner.id) == []


def test_a_second_earning_on_the_same_act_is_unseen_again(owner):
    """*** THE CASE A FLAG CANNOT EXPRESS. ***"""
    _award(owner.id, 'debt_rates', 600, coverage='0.5')
    repo = CoinRepository()
    repo.ack(owner.id, 'debt_rates')
    _db.session.commit()
    assert repo.unseen(owner.id) == []

    _award(owner.id, 'debt_rates', 1200, coverage='1.0')
    assert repo.unseen(owner.id) == [('debt_rates', 600)]


def test_the_ack_is_a_ratchet_and_never_falls(owner):
    _award(owner.id, 'debt_rates', 1200)
    repo = CoinRepository()
    repo.ack(owner.id, 'debt_rates')
    _db.session.commit()

    # An award row whose coins were retuned DOWNWARD must not lower the ack.
    row = CoinAward.query.filter_by(user_id=owner.id,
                                    act_slug='debt_rates').one()
    row.coins = 400
    _db.session.commit()
    repo.ack(owner.id, 'debt_rates')
    _db.session.commit()

    ack = CoinAwardAck.query.filter_by(user_id=owner.id,
                                       act_slug='debt_rates').one()
    assert ack.coins_seen == 1200


def test_one_users_ack_does_not_touch_another(owner, db):
    other = UserFactory(id='ack2@test.com', name='O',
                        password_plain='testpassword')
    _db.session.commit()
    _award(owner.id, 'has_a_goal', 600)
    _award(other.id, 'has_a_goal', 600)

    repo = CoinRepository()
    repo.ack(owner.id, 'has_a_goal')
    _db.session.commit()

    assert repo.unseen(owner.id) == []
    assert repo.unseen(other.id) == [('has_a_goal', 600)]


# ══════════════════════════════════════════════════════════════════════
# The wire
# ══════════════════════════════════════════════════════════════════════

def test_the_wallet_reports_an_overnight_award_as_unseen(
        owner, auth_headers, client):
    """*** THIS IS WHAT GIVES A CRON AWARD ITS MOMENT. *** The user was asleep
    at 04:30; the award waits for them."""
    _award(owner.id, 'has_a_goal', 600)

    body = client.get('/api/v1/coins', headers=auth_headers(owner)).get_json()
    assert [u['slug'] for u in body['unseen']] == ['has_a_goal']
    assert body['unseen'][0]['coins'] == 600


def test_acknowledging_clears_it_from_the_wallet(owner, auth_headers, client):
    _award(owner.id, 'has_a_goal', 600)
    h = auth_headers(owner)

    res = client.post('/api/v1/coins/ack', json={'act_slug': 'has_a_goal'},
                      headers=h)
    assert res.status_code == 200, res.get_json()

    body = client.get('/api/v1/coins', headers=h).get_json()
    assert body['unseen'] == []

    # *** ROLL BACK FIRST — D-61's SHAPE. *** The `db` fixture gives the test
    # the SAME session the request used, so a write the handler never committed
    # is still pending in it and autoflush makes it visible to the next query.
    # Only what was actually COMMITTED survives a rollback.
    _db.session.rollback()
    assert CoinAwardAck.query.filter_by(
        user_id=owner.id, act_slug='has_a_goal').one().coins_seen == 600


def test_acknowledging_an_act_the_user_never_earned_is_404(
        owner, auth_headers, client):
    res = client.post('/api/v1/coins/ack', json={'act_slug': 'has_a_goal'},
                      headers=auth_headers(owner))
    assert res.status_code == 404


def test_unseen_carries_no_denominator(owner, auth_headers, client):
    _award(owner.id, 'has_a_goal', 600)
    body = client.get('/api/v1/coins', headers=auth_headers(owner)).get_json()
    assert body['unseen'], 'nothing unseen — the absence check is vacuous'
    for u in body['unseen']:
        assert 'ceiling' not in u and 'coverage' not in u
