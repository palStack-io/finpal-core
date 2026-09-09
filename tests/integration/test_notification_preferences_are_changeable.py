"""D-148 — a preference you can change more than once.

*** THE ONLY WRITE PATH USED TO BE `POST /auth/onboarding`, AND THAT IS WHY
"WIRE THE UI TO THE EXISTING ENDPOINT" WAS THE WRONG FIX. *** That handler saves
the four columns correctly and then, eleven lines later, sets
`has_completed_onboarding = True` unconditionally — so re-posting to flip one
toggle re-completes onboarding as a side effect. Sixteen routes in `auth.py` and
none of them a settings route.

The recorded precedent is `number_locale` (#132), which had exactly this problem
and was solved by putting it on `PUT /users/profile`. Same object, same place.

*** THE ASSERTION THAT MATTERS IS THE SIDE EFFECT ONE. *** A test that only checked
"the column changed" would pass against the onboarding endpoint too, which is the
thing being replaced.
"""
import pytest

from src.extensions import db as _db
from src.models.user import User
from tests.factories import UserFactory

# The password `auth_headers` logs in with by default.
PASSWORD = 'testpassword'
COLUMNS = {
    'email': 'notification_email',
    'push': 'notification_push',
    'budgetAlerts': 'notification_budget_alerts',
    'transactionAlerts': 'notification_transaction_alerts',
}


@pytest.fixture
def person(db):
    user = UserFactory(id='prefs2@test.com', name='Prefs')
    user.set_password(PASSWORD)
    user.has_completed_onboarding = True
    db.session.commit()
    return user


def test_every_preference_can_be_changed_after_onboarding(client, auth_headers, person, db):
    resp = client.put('/api/v1/users/profile', headers=auth_headers(person),
                      json={'notifications': {'email': False, 'push': False,
                                              'budgetAlerts': False,
                                              'transactionAlerts': True}})
    assert resp.status_code == 200, resp.get_json()

    db.session.expire(person)
    assert person.notification_email is False
    assert person.notification_push is False
    assert person.notification_budget_alerts is False
    assert person.notification_transaction_alerts is True


def test_changing_a_preference_does_NOT_re_complete_onboarding(client, auth_headers, db):
    """*** THE ASSERTION THE OLD ENDPOINT WOULD FAIL. ***

    `CompleteOnboarding` sets `has_completed_onboarding = True` whatever else it
    does, so using it as a settings route silently marks a half-onboarded account
    finished. Staged from `False` so the flag has somewhere to move to — starting at
    True would make this test pass against the very handler it exists to rule out.
    """
    user = UserFactory(id='midway@test.com', name='Midway')
    user.set_password(PASSWORD)
    user.has_completed_onboarding = False
    _db.session.commit()

    resp = client.put('/api/v1/users/profile', headers=auth_headers(user),
                      json={'notifications': {'email': False}})
    assert resp.status_code == 200, resp.get_json()

    _db.session.expire(user)
    assert user.has_completed_onboarding is False, (
        'changing a notification preference completed onboarding as a side effect')


def test_a_partial_update_leaves_the_other_preferences_alone(client, auth_headers, person, db):
    """Settings saves one panel; it must not reset the three toggles not on screen."""
    person.notification_budget_alerts = False
    person.notification_transaction_alerts = True
    _db.session.commit()

    resp = client.put('/api/v1/users/profile', headers=auth_headers(person),
                      json={'notifications': {'email': False}})
    assert resp.status_code == 200

    db.session.expire(person)
    assert person.notification_email is False
    assert person.notification_budget_alerts is False, 'an absent key was overwritten'
    assert person.notification_transaction_alerts is True, 'an absent key was overwritten'


def test_a_profile_update_that_does_not_mention_notifications_changes_none_of_them(
        client, auth_headers, person, db):
    """The other half: renaming yourself must not silently reset four preferences."""
    person.notification_email = False
    _db.session.commit()

    resp = client.put('/api/v1/users/profile', headers=auth_headers(person),
                      json={'name': 'Renamed'})
    assert resp.status_code == 200

    db.session.expire(person)
    assert person.name == 'Renamed'
    assert person.notification_email is False


def test_the_response_echoes_the_preferences_back(client, auth_headers, person):
    """So a client can round-trip without a second request, in the same shape
    `/auth/login` and `/auth/me` use."""
    resp = client.put('/api/v1/users/profile', headers=auth_headers(person),
                      json={'notifications': {'transactionAlerts': True}})

    body = resp.get_json()
    assert set(body['notifications']) == set(COLUMNS)
    assert body['notifications']['transactionAlerts'] is True


def test_a_null_preference_echoes_as_its_declared_default(client, auth_headers, person):
    """The D-155/D-150 rule, applied at this boundary too.

    The NULL is written with raw SQL: the ORM substitutes the column default whenever
    the attribute is None at INSERT, so a factory-written NULL is not a NULL and a
    test built that way asserts nothing.
    """
    _db.session.execute(_db.text(
        'UPDATE users SET notification_email = NULL WHERE id = :i'), {'i': person.id})
    _db.session.commit()
    assert _db.session.execute(_db.text(
        'SELECT notification_email FROM users WHERE id = :i'),
        {'i': person.id}).scalar() is None, 'the NULL did not take'

    resp = client.put('/api/v1/users/profile', headers=auth_headers(person),
                      json={'name': 'Same'})

    default = User.__table__.columns['notification_email'].default.arg
    assert resp.get_json()['notifications']['email'] == default


def test_a_non_object_notifications_body_is_refused(client, auth_headers, person):
    """`notifications: true` was the DOCUMENTED shape until D-151.

    A client written against the old spec will send it. Answering 200 and ignoring it
    is the exact failure this endpoint exists to end, so it is a 400.
    """
    resp = client.put('/api/v1/users/profile', headers=auth_headers(person),
                      json={'notifications': True})
    assert resp.status_code == 400, resp.get_json()


def test_the_endpoint_is_documented_with_the_nested_shape(client):
    """Asserts the TYPE. Two doc gates already check that fields exist, and that is
    what let D-151 ship."""
    spec = client.get('/api/v1/swagger.json').get_json()
    prefs = spec['definitions']['ProfileUpdate']['properties']['notifications']
    assert prefs.get('type') != 'boolean'
    ref = prefs.get('$ref') or prefs.get('allOf', [{}])[0].get('$ref')
    assert ref, f'notifications is not a nested object: {prefs}'
    nested = spec['definitions'][ref.rsplit('/', 1)[-1]]
    assert set(COLUMNS) <= set(nested['properties'])
