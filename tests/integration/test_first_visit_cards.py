"""The first-visit cards on Accounts and Investments, asserted on the PAYLOAD.

Owner, 2026-10-01: the first visit to Accounts explains how bank sync behaves
and how much history arrives; the first visit to Investments says prices are
free. Dismissed once, remembered on the SERVER, so a card dismissed on the web
stays dismissed on the phone.

*** EVERY ASSERTION READS THE BODY OR THE DATABASE, NEVER ONLY A STATUS. ***
"""
import pytest

from integrations.simplefin.client import MAX_DAYS_PER_REQUEST
from src.models.act_event import TeachingSeen
from tests.factories import UserFactory


@pytest.fixture
def ann(db):
    return UserFactory(id='ann@firstvisit.test', password_plain='pw-ann')


@pytest.fixture
def ann_h(client, auth_headers, ann):
    return auth_headers(ann, password='pw-ann')


@pytest.fixture
def ben_h(client, auth_headers, db):
    ben = UserFactory(id='ben@firstvisit.test', password_plain='pw-ben')
    return auth_headers(ben, password='pw-ben')


def _cards(client):
    return client.get('/api/v1/modules/catalog').get_json()['first_visit']


def test_both_cards_are_served_with_prose(client):
    cards = _cards(client)
    assert set(cards) == {'accounts', 'investments'}
    for page, card in cards.items():
        assert card['heading'], page
        assert len(card['lines']) >= 2, page
        assert all(len(line) > 40 for line in card['lines']), page


def test_the_accounts_card_states_the_window_the_sync_actually_asks_for(client):
    """*** THE NUMBER A USER IS TOLD IS THE NUMBER THE CODE FETCHES. ***

    The card read "90 days per request" in the brief while the sync asked for
    30. Interpolated from the same constant, the two cannot drift; this pins
    that the card still carries it.
    """
    prose = ' '.join(_cards(client)['accounts']['lines'])
    assert f'{MAX_DAYS_PER_REQUEST} days' in prose, prose
    # SimpleFIN documents that depth varies by bank. Without this sentence the
    # card reads as a promise of the full window for every account.
    assert 'varies' in prose, prose


def test_the_investments_card_says_no_key_is_needed(client):
    prose = ' '.join(_cards(client)['investments']['lines']).lower()
    assert 'no key' in prose and 'do not need one' in prose, prose


def test_no_accounts_card_on_a_server_with_simplefin_off(client, app):
    """A card about bank sync on a server that cannot sync describes nothing."""
    app.config['SIMPLEFIN_ENABLED'] = False
    try:
        cards = _cards(client)
    finally:
        app.config['SIMPLEFIN_ENABLED'] = True
    assert 'accounts' not in cards
    assert 'investments' in cards


def test_no_card_uses_a_dash_for_punctuation(client):
    prose = str(_cards(client))
    assert '—' not in prose and '–' not in prose, prose


def test_a_new_user_has_dismissed_nothing(client, ann_h):
    body = client.get('/api/v1/modules/first-visit', headers=ann_h).get_json()
    assert body == {'dismissed': []}


def test_dismissing_is_stored_and_answered_with_the_whole_list(client, ann, ann_h):
    body = client.post('/api/v1/modules/first-visit/accounts',
                       headers=ann_h).get_json()
    assert body == {'dismissed': ['accounts']}

    # On the server, which is what makes it hold on another device.
    rows = TeachingSeen.query.filter_by(user_id=ann.id).all()
    assert [r.topic for r in rows] == ['first_visit:accounts']

    again = client.get('/api/v1/modules/first-visit', headers=ann_h).get_json()
    assert again == {'dismissed': ['accounts']}


def test_dismissing_twice_is_not_an_error_and_writes_one_row(client, ann, ann_h):
    client.post('/api/v1/modules/first-visit/investments', headers=ann_h)
    res = client.post('/api/v1/modules/first-visit/investments', headers=ann_h)
    assert res.get_json() == {'dismissed': ['investments']}
    assert TeachingSeen.query.filter_by(user_id=ann.id).count() == 1


def test_a_dismissal_is_one_users_not_everyones(client, ann_h, ben_h):
    client.post('/api/v1/modules/first-visit/accounts', headers=ann_h)
    body = client.get('/api/v1/modules/first-visit', headers=ben_h).get_json()
    assert body == {'dismissed': []}


def test_an_unknown_page_is_refused_and_writes_nothing(client, ann, ann_h):
    res = client.post('/api/v1/modules/first-visit/dashboard', headers=ann_h)
    assert res.status_code == 404
    assert 'dashboard' in res.get_json()['error']
    assert TeachingSeen.query.filter_by(user_id=ann.id).count() == 0


def test_the_reward_explanations_do_not_count_as_a_dismissal(client, ann, ann_h):
    """The table is shared with the four reward explanations; the prefix is
    what keeps "taught about coins" from reading as "dismissed a card"."""
    from src.extensions import db
    db.session.add(TeachingSeen(user_id=ann.id, topic='coins'))
    db.session.commit()
    body = client.get('/api/v1/modules/first-visit', headers=ann_h).get_json()
    assert body == {'dismissed': []}


def test_dismissal_needs_a_session(client):
    assert client.get('/api/v1/modules/first-visit').status_code == 401
    assert client.post('/api/v1/modules/first-visit/accounts').status_code == 401
