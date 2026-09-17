"""The teaching panel: once per reward type, and it rides on the award.

*** THE RULE IS "ONCE PER REWARD TYPE", NOT "THE FIRST N AWARDS" (§14.6). *** A
counter spends itself badly — three awards in one evening can all be coins, so
the user would hear about coins three times and never learn what gear is.
"""
from decimal import Decimal

import pytest

from src.extensions import db as _db
from src.models.act_event import TeachingSeen
from src.models.coins import CoinAward
from src.models.goal import Goal
from src.services.literacy import teaching
from tests.factories import UserFactory

USER = 'teach@test.com'


@pytest.fixture
def owner(db):
    u = UserFactory(id=USER, name='Teach', password_plain='testpassword')
    _db.session.add(Goal(user_id=u.id, name='Roof', start_amount=0,
                         target_amount=1000, status='active'))
    _db.session.commit()
    return u


def test_the_first_award_carries_the_coins_panel(owner, auth_headers, client):
    body = client.post('/api/v1/coins/refresh', json={'surface': 'goals'},
                       headers=auth_headers(owner)).get_json()

    assert body['awarded'], 'nothing awarded — the test would pass vacuously'
    teach = body['awarded'][0]['teach']
    assert teach is not None
    assert teach['topic'] == 'coins'
    assert teach['title']
    assert teach['body']


def test_after_acking_it_no_further_award_carries_it(
        owner, auth_headers, client):
    h = auth_headers(owner)
    first = client.post('/api/v1/coins/refresh', json={'surface': 'goals'},
                        headers=h).get_json()
    slug = first['awarded'][0]['slug']

    client.post('/api/v1/coins/ack', json={'act_slug': slug}, headers=h)

    # A second, different act earns; it must NOT re-teach. `taught_a_rule` is
    # binary and needs no spend fixture, unlike `has_a_budget`, which measures
    # a share of FLEXIBLE spend.
    from src.models.transaction_rule import TransactionRule
    _db.session.add(TransactionRule(user_id=owner.id, name='Coffee',
                                    pattern='COFFEE', active=True))
    _db.session.commit()

    second = client.post('/api/v1/coins/refresh', json={'surface': 'rules'},
                         headers=h).get_json()
    assert second['awarded'], 'nothing awarded — vacuous'
    assert second['awarded'][0]['teach'] is None


def test_the_ack_persists_the_topic(owner, auth_headers, client):
    h = auth_headers(owner)
    first = client.post('/api/v1/coins/refresh', json={'surface': 'goals'},
                        headers=h).get_json()
    client.post('/api/v1/coins/ack',
                json={'act_slug': first['awarded'][0]['slug']}, headers=h)

    # *** ROLL BACK FIRST — D-61. *** The test shares the request's session, so
    # an uncommitted write would still be visible to the next query.
    _db.session.rollback()
    assert TeachingSeen.query.filter_by(
        user_id=owner.id, topic='coins').count() == 1


def test_only_ONE_award_in_a_batch_carries_the_panel(
        owner, auth_headers, client):
    """Two acts landing together must not both explain what a coin is."""
    from tests.factories import AccountFactory
    AccountFactory(user_id=owner.id, name='C', type='checking')
    _db.session.commit()

    # `review` moves several acts at once.
    body = client.post('/api/v1/coins/refresh', json={'surface': 'goals'},
                       headers=auth_headers(owner)).get_json()
    taught = [a for a in body['awarded'] if a.get('teach')]
    assert len(taught) <= 1


def test_the_unseen_queue_carries_it_too(owner, auth_headers, client):
    """An award earned at 04:30 must still get its explanation."""
    _db.session.add(CoinAward(user_id=owner.id, act_slug='has_a_goal',
                              coverage=Decimal(1), coins=600))
    _db.session.commit()

    wallet = client.get('/api/v1/coins', headers=auth_headers(owner)).get_json()
    assert wallet['unseen'], 'nothing unseen — vacuous'
    assert wallet['unseen'][0]['teach'] is not None


def test_no_served_teaching_sentence_uses_an_em_or_en_dash():
    """*** OWNER RULE FOR SERVED COPY. *** `test_module_catalog.py` enforces
    this on the module intros; the same rule applies to these four panels."""
    for topic, entry in teaching.TOPICS.items():
        for field in ('title', 'body'):
            text = entry[field]
            for dash, name in (('—', 'em dash'), ('–', 'en dash')):
                assert dash not in text, (
                    f'teaching topic {topic!r} {field} contains an {name}')


def test_every_topic_has_a_title_and_a_body():
    assert set(teaching.TOPICS) == {'coins', 'gear', 'badges', 'mountains'}
    for topic, entry in teaching.TOPICS.items():
        assert entry['title'].strip(), topic
        assert len(entry['body']) > 80, f'{topic} body is too thin to teach'


def test_an_unknown_topic_renders_nothing_rather_than_an_empty_box():
    assert teaching.panel_for('no_such_topic') is None
