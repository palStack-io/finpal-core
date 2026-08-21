"""#132 — European users want `1.234,56`, and finPal hardcoded `en-US` everywhere.

Reported as `palStack-io/finpal-core#132`: *"As the title describe in Europe we prefer the
use of ',' (comma) for numbers and not '.' (dot)"*, filed as a feature request.

Stored as an explicit user preference set during onboarding, by owner decision
(2026-08-20), alongside the currency and timezone the user already chooses there — rather
than sniffed from the browser or device. Two reasons that call is right: a user on a US
machine who wants EU formatting has no other lever, and the device signal is not the one
people assume. Verified on a simulator while investigating this: the iOS decimal keypad's
separator follows `AppleKeyboards`, NOT `AppleLocale`, so a phone with its region set to
Germany and a US keyboard still shows a dot. Device region would have been the wrong
input.

`User.timezone` is the precedent this follows exactly: a nullable string column, applied by
`POST /auth/onboarding` and by `PUT /users/profile`, and echoed in the auth payloads the clients
cache.

*** THIS ADDS A COLUMN, SO D-121 APPLIES. *** `create_all()` never ALTERs an existing
table, so no deployed instance gets `users.number_locale` from a redeploy;
`scripts/schema_drift.py` prints the statement.
"""
from src.models.user import User
from tests.factories import UserFactory


def test_a_new_user_has_no_forced_locale(client, db, auth_headers):
    """Nullable, so an untouched account keeps today's behaviour.

    The formatters fall back to en-US on null. A non-null default would silently
    re-format every existing user's figures on deploy.
    """
    user = UserFactory()
    assert user.number_locale is None


def test_onboarding_stores_the_number_locale(client, db, auth_headers):
    """The route the owner asked for: set during onboarding, beside currency + timezone."""
    user = UserFactory()

    resp = client.post('/api/v1/auth/onboarding', headers=auth_headers(user), json={
        'default_currency_code': 'EUR',
        'timezone': 'Europe/Berlin',
        'number_locale': 'de-DE',
    })

    assert resp.status_code == 200, resp.get_data(as_text=True)[:300]
    assert db.session.get(User, user.id).number_locale == 'de-DE'
    # Echoed back, because the clients cache this payload as their user object.
    assert resp.get_json().get('number_locale') == 'de-DE', resp.get_json()


def test_onboarding_without_a_locale_still_works(client, db, auth_headers):
    """The inverse of the symptom. Every existing client omits the field."""
    user = UserFactory()

    resp = client.post('/api/v1/auth/onboarding', headers=auth_headers(user), json={
        'default_currency_code': 'USD', 'timezone': 'America/New_York'})

    assert resp.status_code == 200, resp.get_data(as_text=True)[:300]
    assert db.session.get(User, user.id).number_locale is None


def test_the_preference_can_be_changed_later(client, db, auth_headers):
    """Onboarding happens once; a preference must be editable afterwards.

    A setting that can only be chosen during onboarding is a setting the reporter — who
    is already onboarded — cannot use at all. That would have made the whole change
    useless to the person who asked for it.
    """
    user = UserFactory()
    client.post('/api/v1/auth/onboarding', headers=auth_headers(user),
                json={'number_locale': 'de-DE'})

    resp = client.put('/api/v1/users/profile', headers=auth_headers(user),
                      json={'number_locale': 'fr-FR'})

    assert resp.status_code == 200, resp.get_data(as_text=True)[:300]
    assert db.session.get(User, user.id).number_locale == 'fr-FR'


def test_the_preference_is_served_on_the_profile(client, db, auth_headers):
    """"Stored but not served" is how half a fix passes — assert the read path too.

    `GET /auth/me` is the read (the write is `PUT /users/profile`); the clients cache this
    payload as their user object, so a preference missing from it is a preference no
    formatter can see.
    """
    user = UserFactory()
    client.post('/api/v1/auth/onboarding', headers=auth_headers(user),
                json={'number_locale': 'de-DE'})

    resp = client.get('/api/v1/auth/me', headers=auth_headers(user))

    assert resp.status_code == 200, resp.get_data(as_text=True)[:300]
    body = resp.get_json()
    served = body.get('user') or body
    assert served.get('number_locale') == 'de-DE', body


def test_a_nonsense_locale_is_refused(client, db, auth_headers):
    """It reaches `Intl.NumberFormat` in two clients, which THROWS on a bad tag.

    An unvalidated string here is a client-side crash on every screen that renders money,
    for as long as the value sits in the row. Refused at the door instead.
    """
    user = UserFactory()

    resp = client.put('/api/v1/users/profile', headers=auth_headers(user),
                      json={'number_locale': 'not a locale!!'})

    assert resp.status_code == 400, (
        f'an unusable locale tag was stored: {resp.status_code} '
        f'{resp.get_data(as_text=True)[:200]}'
    )
    assert db.session.get(User, user.id).number_locale is None


def test_the_locale_can_be_cleared_back_to_the_default(client, db, auth_headers):
    """Reverting to the app default must be possible, not a one-way door."""
    user = UserFactory()
    client.put('/api/v1/users/profile', headers=auth_headers(user),
               json={'number_locale': 'de-DE'})

    resp = client.put('/api/v1/users/profile', headers=auth_headers(user),
                      json={'number_locale': None})

    assert resp.status_code == 200, resp.get_data(as_text=True)[:300]
    assert db.session.get(User, user.id).number_locale is None
