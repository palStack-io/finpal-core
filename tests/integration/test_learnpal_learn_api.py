"""learn-as-you-use-it API: shapes, the off switch, set-aside, and recall ownership."""
from datetime import date, datetime, timedelta
from decimal import Decimal

import pytest

from src.extensions import db as _db
from src.modules.learnpal import routes as learn_routes
from src.modules.learnpal.models import LearnRecall, LearnSkillMark
from src.modules.learnpal.recall import schedule_first_recall
from tests.factories import AccountFactory, UserFactory

BASE = '/api/v1/learnpal'


@pytest.fixture
def user(db):
    return UserFactory(id='learn-api@test.com', name='Learner')


@pytest.fixture
def h(auth_headers, user):
    return auth_headers(user)


def _debt(user):
    """A rated card plus an unrated owed account: the interest lesson applies and is not yet 'used'."""
    AccountFactory(user_id=user.id, type='credit', balance=-Decimal('1860.00'),
                   apr=Decimal('25.00'), name='Visa')
    AccountFactory(user_id=user.id, type='loan', balance=-Decimal('900.00'), apr=None, name='Loan')


def _due_recall(user):
    r = schedule_first_recall(user.id, 'buffer', date.today() - timedelta(days=3))
    r.due_on = date.today() - timedelta(days=1)
    _db.session.commit()
    return r


def test_new_user_gets_no_cards_and_six_skills(client, h):
    body = client.get(f'{BASE}/skills-progress', headers=h).get_json()
    assert body['enabled'] is True and len(body['skills']) == 6
    assert client.get(f'{BASE}/why?screen=debt', headers=h).get_json() == {'enabled': True, 'cards': []}
    assert client.get(f'{BASE}/this-week', headers=h).get_json() == {'enabled': True, 'lesson': None}
    assert client.get(f'{BASE}/recall', headers=h).get_json() == {'enabled': True, 'recall': None}


def test_why_and_short_and_this_week_shapes(client, h, user):
    _debt(user)
    why = client.get(f'{BASE}/why?screen=debt', headers=h).get_json()
    assert [c['id'] for c in why['cards']] == ['interest']
    card = why['cards'][0]
    assert set(card) == {'id', 'skill', 'card', 'action'} and 'Visa' in card['card']
    assert client.get(f'{BASE}/why?screen=goals', headers=h).get_json()['cards'] == []
    assert client.get(f'{BASE}/why?screen=nope', headers=h).status_code == 400
    short = client.get(f'{BASE}/short/interest', headers=h).get_json()
    assert set(short) == {'id', 'skill', 'long_lesson', 'number', 'explain', 'try', 'action', 'when', 'lines'}
    assert short['try']['kind'] == 'interest' and short['when'] is True
    assert set(short['lines']) == {'not_now', 'understood', 'when_prompt'}
    assert client.get(f'{BASE}/short/buffer', headers=h).status_code == 404
    assert client.get(f'{BASE}/short/nope', headers=h).status_code == 404
    week = client.get(f'{BASE}/this-week', headers=h).get_json()
    assert week['enabled'] is True and week['lesson']['id'] == 'interest'


def test_finish_returns_skill_row(client, h, user):
    _debt(user)
    r = client.post(f'{BASE}/short/interest/finish', headers=h, json={'outcome': 'finished'})
    assert r.status_code == 200 and r.get_json()['id'] == 'interest'
    assert r.get_json()['marks']['understood'] is True
    assert client.post(f'{BASE}/short/interest/finish', headers=h, json={'outcome': 'x'}).status_code == 400
    assert client.post(f'{BASE}/short/nope/finish', headers=h, json={'outcome': 'finished'}).status_code == 404


def test_this_week_empty_on_a_quiet_day(client, h, user, monkeypatch):
    _debt(user)
    monkeypatch.setattr(learn_routes, 'quiet_day', lambda uid, today: True)
    assert client.get(f'{BASE}/this-week', headers=h).get_json() == {'enabled': True, 'lesson': None}


@pytest.mark.parametrize('value', [False, None])
def test_everything_empty_when_off(client, h, user, value):
    _debt(user)
    r = _due_recall(user)
    client.post(f'{BASE}/short/interest/finish', headers=h, json={'outcome': 'finished'})
    marks_before = client.get(f'{BASE}/skills-progress', headers=h).get_json()['skills']
    recall_before = client.get(f'{BASE}/recall', headers=h).get_json()
    assert recall_before['recall']['id'] == r.id

    user.learn_as_you_go = False
    _db.session.commit()
    off = client.get(f'{BASE}/skills-progress', headers=h).get_json()
    assert off['enabled'] is False and off['skills'] == marks_before
    assert client.get(f'{BASE}/why?screen=debt', headers=h).get_json() == {'enabled': False, 'cards': []}
    assert client.get(f'{BASE}/this-week', headers=h).get_json() == {'enabled': False, 'lesson': None}
    assert client.get(f'{BASE}/recall', headers=h).get_json() == {'enabled': False, 'recall': None}

    # Back on (True, or NULL which reads as on): same marks, same recall.
    user.learn_as_you_go = True if value is False else None
    _db.session.commit()
    on = client.get(f'{BASE}/skills-progress', headers=h).get_json()
    assert on['enabled'] is True and on['skills'] == marks_before
    assert client.get(f'{BASE}/recall', headers=h).get_json() == recall_before


def test_recall_shape_and_answer(client, h, user):
    r = _due_recall(user)
    got = client.get(f'{BASE}/recall', headers=h).get_json()['recall']
    assert set(got) == {'id', 'skill', 'prompt', 'options', 'not_sure_label'}
    assert got['id'] == r.id and got['not_sure_label'] == 'Not sure yet' and len(got['options']) >= 2
    out = client.post(f'{BASE}/recall/{r.id}', headers=h, json={'choice': 'not_sure'})
    assert out.status_code == 200 and out.get_json()['right'] is None
    assert client.post(f'{BASE}/recall/{r.id}', headers=h, json={'choice': 'bogus'}).status_code == 400


def test_recall_of_another_user_is_404(client, h, user, auth_headers):
    r = _due_recall(user)
    other = UserFactory(id='other-learn@test.com', name='Other')
    resp = client.post(f'{BASE}/recall/{r.id}', headers=auth_headers(other), json={'choice': 'not_sure'})
    assert resp.status_code == 404
    assert client.post(f'{BASE}/recall/99999', headers=h, json={'choice': '0'}).status_code == 404


def test_why_hides_set_aside_for_30_days(client, h, user):
    _debt(user)
    client.post(f'{BASE}/short/interest/finish', headers=h, json={'outcome': 'not_now'})
    assert client.get(f'{BASE}/why?screen=debt', headers=h).get_json()['cards'] == []
    assert client.get(f'{BASE}/this-week', headers=h).get_json()['lesson'] is None
    row = LearnSkillMark.query.filter_by(user_id=user.id, skill='interest').one()
    row.set_aside_at = datetime.utcnow() - timedelta(days=31)
    _db.session.commit()
    assert [c['id'] for c in client.get(f'{BASE}/why?screen=debt', headers=h).get_json()['cards']] == ['interest']


def test_profile_saves_learn_as_you_go(client, h, user):
    r = client.put('/api/v1/users/profile', headers=h, json={'learn_as_you_go': False})
    assert r.status_code == 200 and r.get_json()['learn_as_you_go'] is False
    _db.session.refresh(user)
    assert user.learn_as_you_go is False
    assert client.put('/api/v1/users/profile', headers=h, json={'learn_as_you_go': 'no'}).status_code == 400
    user.learn_as_you_go = None
    _db.session.commit()
    me = client.get('/api/v1/auth/me', headers=h).get_json()
    assert me['learn_as_you_go'] is True
