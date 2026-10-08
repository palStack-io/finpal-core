"""The page guides, asserted on the PAYLOAD and the database."""
import pytest

from src.models.act_event import TeachingSeen
from tests.factories import UserFactory


@pytest.fixture
def ann(db):
    return UserFactory(id='ann@guides.test', password_plain='pw-ann')


@pytest.fixture
def ann_h(client, auth_headers, ann):
    return auth_headers(ann, password='pw-ann')


@pytest.fixture
def ben_h(client, auth_headers, db):
    return auth_headers(UserFactory(id='ben@guides.test', password_plain='pw-ben'), password='pw-ben')


def _get(client, headers, **extra):
    return client.get('/api/v1/modules/guides', headers={**headers, **extra})


def test_guides_are_served_with_copy_and_empty_state(client, ann_h):
    body = _get(client, ann_h).get_json()
    from src.services.onboarding.guides import PAGES
    assert set(body['pages']) == set(PAGES) >= {'accounts', 'budgets', 'goals', 'dashboard', 'settings'}
    assert body['dismissed'] == [] and body['toured'] == []
    assert body['lang'] == 'en'
    assert body['pages']['goals']['heading'].startswith('Goals')
    assert [s['target'] for s in body['pages']['goals']['tour']] == ['goal-new', 'goal-list']


def test_no_language_signal_at_all_gets_english(client, ann_h):
    assert _get(client, ann_h).get_json()['lang'] == 'en'


def test_the_browser_language_is_used_when_the_user_has_no_setting(client, ann_h):
    body = _get(client, ann_h, **{'Accept-Language': 'es-ES,es;q=0.9'}).get_json()
    assert body['lang'] == 'es'


def test_dismissing_stores_a_row_and_answers_the_whole_state(client, db, ann_h):
    resp = client.post('/api/v1/modules/guides/goals/dismiss', headers=ann_h)
    assert resp.status_code == 200
    assert resp.get_json() == {'dismissed': ['goals'], 'toured': []}
    assert TeachingSeen.query.filter_by(user_id='ann@guides.test', topic='guide:goals').count() == 1
    assert _get(client, ann_h).get_json()['dismissed'] == ['goals']


def test_a_tour_is_recorded_separately_from_the_card(client, db, ann_h):
    resp = client.post('/api/v1/modules/guides/budgets/tour', headers=ann_h)
    assert resp.get_json() == {'dismissed': [], 'toured': ['budgets']}
    assert TeachingSeen.query.filter_by(topic='tour:budgets').count() == 1
    assert TeachingSeen.query.filter_by(topic='guide:budgets').count() == 0


def test_dismissing_twice_is_not_an_error_and_writes_one_row(client, db, ann_h):
    for _ in range(2):
        assert client.post('/api/v1/modules/guides/goals/dismiss', headers=ann_h).status_code == 200
    assert TeachingSeen.query.filter_by(topic='guide:goals').count() == 1


def test_one_users_dismissal_is_not_anothers(client, ann_h, ben_h):
    client.post('/api/v1/modules/guides/goals/dismiss', headers=ann_h)
    assert _get(client, ben_h).get_json()['dismissed'] == []


def test_an_unknown_page_is_a_404_with_a_reason_and_writes_nothing(client, db, ann_h):
    for tail in ('dismiss', 'tour'):
        resp = client.post(f'/api/v1/modules/guides/nonsense/{tail}', headers=ann_h)
        assert resp.status_code == 404
        assert 'nonsense' in resp.get_json()['error']
    assert TeachingSeen.query.filter(TeachingSeen.topic.like('guide:%')).count() == 0


def test_the_state_requires_a_login(client):
    assert client.get('/api/v1/modules/guides').status_code in (401, 422)


# --- the client's own language (review finding 1) -------------------------------------

def test_the_clients_language_outranks_the_browser_header(client, ann_h):
    """With the language gate off the client renders English whatever the browser sends."""
    body = client.get('/api/v1/modules/guides?lang=en',
                      headers={**ann_h, 'Accept-Language': 'es-ES,es;q=0.9'}).get_json()
    assert body['lang'] == 'en'
    assert body['pages']['goals']['heading'].startswith('Goals')


def test_the_clients_language_can_select_spanish(client, ann_h):
    assert client.get('/api/v1/modules/guides?lang=es', headers=ann_h).get_json()['lang'] == 'es'


def test_an_unsupported_client_language_is_english_not_the_browsers(client, ann_h):
    body = client.get('/api/v1/modules/guides?lang=fr',
                      headers={**ann_h, 'Accept-Language': 'es-ES'}).get_json()
    assert body['lang'] == 'en'


# --- module pages follow the deployment's modules -------------------------------------

def test_a_module_that_is_off_has_no_guides_in_the_payload(client, ann_h, monkeypatch):
    from api.v1 import modules as modules_api
    monkeypatch.setattr(modules_api, '_enabled_module_names', lambda: {'pointspal'})
    pages = _get(client, ann_h).get_json()['pages']
    assert 'pointspal-caps' in pages
    assert not [p for p in pages if p.startswith('learnpal')]


def test_both_modules_are_served_when_both_are_enabled(client, ann_h):
    pages = _get(client, ann_h).get_json()['pages']
    assert {'pointspal', 'learnpal', 'learnpal-range'} <= set(pages)


# --- the write routes need a login too (review finding 11) -----------------------------

@pytest.mark.parametrize('tail', ['dismiss', 'tour'])
def test_the_write_routes_require_a_login_and_write_nothing(client, db, tail):
    resp = client.post(f'/api/v1/modules/guides/goals/{tail}')
    assert resp.status_code in (401, 422)
    assert TeachingSeen.query.filter(TeachingSeen.topic.like('guide:%')).count() == 0
    assert TeachingSeen.query.filter(TeachingSeen.topic.like('tour:%')).count() == 0


def test_two_tabs_racing_the_same_dismissal_is_not_an_error(db, ann, monkeypatch):
    """The second insert hits the unique constraint: the outcome asked for already holds."""
    from src.services.onboarding import guide_state

    guide_state.dismiss_guide(ann.id, 'goals')          # the other tab won

    real = TeachingSeen.query

    class _Q:                                           # this tab's existence check ran BEFORE that insert
        def filter_by(self, **kw):
            import types
            return types.SimpleNamespace(first=lambda: None)

        def filter(self, *a, **k):
            return real.filter(*a, **k)

    monkeypatch.setattr(TeachingSeen, 'query', _Q())
    state = guide_state.dismiss_guide(ann.id, 'goals')
    assert state['dismissed'] == ['goals']
