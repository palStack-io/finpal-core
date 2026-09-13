"""An SSO user can set a local password — but only just after proving it is them.

*** D-161: THE OIDC PATH CREATES A USER WITH A REAL HASH OF A RANDOM 24-BYTE
SECRET. *** So `/change-password`, which proves identity by asking for the
CURRENT password, can never work for them — and the API told them they had typed
it wrong.

Owner decision 2026-09-12: send them back to the identity provider and accept a
new password only on a FRESH assertion.

*** THE THING MOST WORTH TESTING IS WHAT IS REFUSED. *** A password-setting
endpoint that is too easy to reach turns a stolen session into a PERMANENT
second credential — strictly worse than the session it came from. So every
refusal below is asserted, not assumed:

  * a perfectly valid token with no re-auth claim  -> 403
  * a claim that has aged past the window          -> 403
  * a provider that never stated `auth_time`       -> refused, not assumed fresh
  * a timestamp from the future                    -> refused

And 403 rather than 401 deliberately: the token IS valid, it simply does not
carry this authorisation. A 401 would make a client log the user out, which is
the opposite of what should happen.
"""

import time

import pytest
from flask_jwt_extended import create_access_token

from src.extensions import db as _db
from src.models.user import User
from src.services.auth.reauth import (
    FRESH_ASSERTION_SECONDS,
    REAUTH_CLAIM,
    describe_refusal,
    is_fresh_assertion,
    reauth_is_current,
)
from tests.factories import UserFactory

ENDPOINT = '/api/v1/auth/set-password'
NEW = 'a-real-password-they-chose'


@pytest.fixture
def sso_user(db):
    """A user as the OIDC path leaves them: a hash of something unknowable."""
    import secrets
    user = UserFactory(id='sso@test.com', name='SSO')
    user.set_password(secrets.token_urlsafe(24))
    _db.session.commit()
    return user


def _token(app, user_id, reauth_age=None):
    """An access token, optionally carrying a re-auth claim of a given age."""
    claims = {'email': user_id}
    if reauth_age is not None:
        claims[REAUTH_CLAIM] = time.time() - reauth_age
    with app.app_context():
        return create_access_token(identity=user_id, additional_claims=claims)


def _hdr(tok):
    return {'Authorization': f'Bearer {tok}'}


class TestTheFreshnessRule:
    def test_a_missing_auth_time_is_refused_not_assumed_recent(self):
        # *** THE ONE THAT MATTERS. *** `auth_time` is OPTIONAL in OIDC unless
        # `max_age` was requested, so an absent claim is an UNKNOWN. Treating it
        # as fresh would let a provider that ignores `prompt=login` authorise a
        # password change with a session from last month — the exact hole this
        # flow exists to close.
        assert is_fresh_assertion(None) is False

    def test_a_future_timestamp_is_refused(self):
        now = time.time()
        assert is_fresh_assertion(now + 600, now) is False

    def test_ordinary_clock_skew_is_tolerated(self):
        now = time.time()
        assert is_fresh_assertion(now + 30, now) is True

    def test_the_window_holds_and_then_does_not(self):
        now = time.time()
        assert is_fresh_assertion(now - (FRESH_ASSERTION_SECONDS - 5), now) is True
        assert is_fresh_assertion(now - (FRESH_ASSERTION_SECONDS + 5), now) is False

    def test_rubbish_is_refused_rather_than_raising(self):
        assert is_fresh_assertion('yesterday') is False
        assert reauth_is_current(None) is False

    def test_the_two_refusals_ask_for_different_things(self):
        # "You never re-authenticated" means START the flow; "it expired" means
        # do it AGAIN. Collapsing them is how D-106 happened — a login screen
        # telling a user something true-ish that did not describe their case.
        never = describe_refusal({})
        expired = describe_refusal({REAUTH_CLAIM: time.time() - 9999})
        assert never != expired
        assert 'expired' in expired.lower()


class TestTheEndpoint:
    def test_a_fresh_assertion_sets_the_password(self, app, client, sso_user):
        resp = client.post(ENDPOINT, json={'password': NEW},
                           headers=_hdr(_token(app, sso_user.id, reauth_age=5)))

        assert resp.status_code == 200, resp.get_json()
        # assert on the DATABASE, never the status code
        assert User.query.get(sso_user.id).check_password(NEW) is True

    def test_a_valid_token_with_NO_reauth_claim_is_refused(self, app, client, sso_user):
        """*** A STOLEN SESSION MUST NOT BECOME A PERMANENT CREDENTIAL. ***"""
        resp = client.post(ENDPOINT, json={'password': NEW},
                           headers=_hdr(_token(app, sso_user.id)))

        assert resp.status_code == 403
        assert resp.get_json()['reauth_required'] is True
        assert User.query.get(sso_user.id).check_password(NEW) is False

    def test_an_EXPIRED_assertion_is_refused(self, app, client, sso_user):
        resp = client.post(
            ENDPOINT, json={'password': NEW},
            headers=_hdr(_token(app, sso_user.id,
                                reauth_age=FRESH_ASSERTION_SECONDS + 60)))

        assert resp.status_code == 403
        assert User.query.get(sso_user.id).check_password(NEW) is False

    def test_no_token_at_all_is_refused(self, client, sso_user):
        assert client.post(ENDPOINT, json={'password': NEW}).status_code == 401

    def test_a_short_password_is_refused_even_with_a_fresh_assertion(
            self, app, client, sso_user):
        resp = client.post(ENDPOINT, json={'password': 'abc'},
                           headers=_hdr(_token(app, sso_user.id, reauth_age=5)))

        assert resp.status_code == 400
        assert User.query.get(sso_user.id).check_password('abc') is False

    def test_it_sets_the_password_for_THIS_user_only(self, app, client, sso_user, db):
        """The identity comes from the token, never from the body."""
        other = UserFactory(id='other@test.com', name='Other')
        other.set_password('untouched-password')
        _db.session.commit()

        client.post(ENDPOINT,
                    json={'password': NEW, 'email': other.id, 'user_id': other.id},
                    headers=_hdr(_token(app, sso_user.id, reauth_age=5)))

        assert User.query.get(other.id).check_password('untouched-password') is True
        assert User.query.get(sso_user.id).check_password(NEW) is True
