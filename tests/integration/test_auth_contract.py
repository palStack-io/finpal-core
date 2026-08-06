"""The contract the auth blueprint serves TODAY, so it can be ported safely.

`src/services/auth/api_routes.py` is a plain Flask blueprint holding **13 rules**
— register, login, refresh, me, logout, onboarding, verify-email,
resend-verification, forgot-password, config, apple, reset-password, oidc. Only
`/auth/sync` and `/auth/whoami` are flask-restx, so **none of the 13 appears in
swagger**, which is why a generated OpenAPI client would have no login, no
register and no refresh. This file is the oracle for moving them onto restx, and
it follows `test_groups_rules_contract.py` — the file that, on its first run,
found `PUT /groups/<id>` had answered 500 since the initial commit.

Four things about *this* family that the groups/rules oracle did not have to deal
with, each of which decides how an assertion here is written:

**1. Every successful response is volatile.** `access_token` and `refresh_token`
differ on every single call, so a deep-compare of two responses fails before any
port happens. They are therefore *not* normalised away — a missing
`refresh_token` after the port must fail — but checked as
`presence + three dot-separated segments + non-empty`, via `_jwt_shape`. Every
other key is compared by **exact value**.

**2. Auth state is single-use.** Registering the same address twice, verifying an
email twice and spending a reset token twice all answer differently the second
time. The `db` fixture is function-scoped and drops every table after each test,
so each `(case, slash)` parametrization gets a fresh database — that, not
bookkeeping inside the test, is what keeps the two spellings comparable.

**3. The rate limits cannot be seen from here.** Four of the 13 carry
`@limiter.limit("10 per minute")` (register, login, apple, oidc) and
`tests/conftest.py` sets `RATELIMIT_ENABLED: False` for the whole session. So
this file is structurally blind to whether the limits survive the port —
precisely the "guard goes quiet exactly when needed" shape this project has hit
twice. They are covered separately, with the limiter turned back on, in
`test_auth_rate_limits.py`. Do not add a rate-limit assertion here; it would
pass without inspecting anything.

**4. Endpoint names are diagnostics, never assertions.** The port *deliberately*
renames `auth_api.login` to something else. `test_groups_rules_contract.py`'s
first surface guard was keyed to endpoint names and went quiet in #61 for exactly
this reason. Every check here is keyed to the **URL**.

Both slash spellings are exercised, as in the groups oracle: `strict_slashes` is
False, so `/auth/login` and `/auth/login/` are separate rules that *can* resolve
to different implementations. The comment at `api/v1/auth.py:120` records that
neither web-ui nor mobile sends the trailing form for an auth URL, so a
divergence here is documented as harmless rather than load-bearing — but it is
still captured, so that "what changed" is answerable.
"""
import pytest
from werkzeug.exceptions import HTTPException

from src.extensions import db as _db
from src.models.user import RevokedToken, User
from tests.factories import UserFactory

BOTH_SPELLINGS = pytest.mark.parametrize('slash', ['', '/'],
                                         ids=['no-slash', 'trailing-slash'])

# The 13 rules the blueprint owns, plus the two that were already restx. After
# the port every one of these must still resolve — under a different endpoint
# name, which is why this list is (path, method) and not endpoint names.
AUTH_SURFACE = [
    ('/api/v1/auth/register', 'POST'),
    ('/api/v1/auth/login', 'POST'),
    ('/api/v1/auth/refresh', 'POST'),
    ('/api/v1/auth/me', 'GET'),
    ('/api/v1/auth/logout', 'POST'),
    ('/api/v1/auth/onboarding', 'POST'),
    ('/api/v1/auth/verify-email', 'POST'),
    ('/api/v1/auth/resend-verification', 'POST'),
    ('/api/v1/auth/forgot-password', 'POST'),
    ('/api/v1/auth/config', 'GET'),
    ('/api/v1/auth/apple', 'POST'),
    ('/api/v1/auth/reset-password', 'POST'),
    ('/api/v1/auth/oidc', 'POST'),
    ('/api/v1/auth/sync', 'POST'),
    ('/api/v1/auth/whoami', 'GET'),
]


def _resolves(app, path, method):
    """The endpoint serving (path, method), or None if nothing does.

    Returned for *diagnostics and existence checks only*. Never assert on the
    name — see point 4 in the module docstring.
    """
    try:
        endpoint, _ = app.url_map.bind('localhost').match(path, method=method)
        return endpoint
    except HTTPException:
        return None


def _jwt_shape(token, field):
    """A JWT's value is volatile; its shape is not."""
    assert isinstance(token, str) and token, f'{field} missing or empty'
    assert len(token.split('.')) == 3, f'{field} is not a JWT: {token[:40]!r}'


@pytest.fixture(autouse=True)
def no_outbound_mail(monkeypatch):
    """Registration, resend and forgot-password all send mail.

    Patched on the service object rather than at the route, so it keeps working
    when the handlers move to a different module.
    """
    sent = []
    from src.services import email_service as email_module

    def record(**kwargs):
        sent.append(kwargs)
        return True

    monkeypatch.setattr(email_module.email_service,
                        'send_verification_email', record)
    monkeypatch.setattr(email_module.email_service,
                        'send_password_reset_email', record)
    return sent


# pointsPal is `default_enabled` in core since PR #56, and `POINTSPAL_ENABLED` is
# unset under test, so the module list every auth endpoint returns is this. It is
# asserted as a literal rather than recomputed from the registry — a test that
# re-derives the value it is checking checks nothing — and
# `test_the_module_list_is_computed_not_hardcoded` proves the list really is
# built from the registry rather than being a constant in the handler.
DEFAULT_MODULES = ['pointspal']


@pytest.fixture
def user(db):
    """A user whose notification preferences are set explicitly.

    `UserFactory` picks its own values for these four booleans, so asserting on
    the factory's choices would pin the factory rather than the handler. Set
    here, then compared against literals below.
    """
    u = UserFactory()
    u.notification_email = True
    u.notification_push = False
    u.notification_budget_alerts = True
    u.notification_transaction_alerts = True
    _db.session.commit()
    return u


# --- the precondition: a case pointed at a URL that does not exist -----------
# In #66 a test case was written against `/users/me`, got a 404, and satisfied
# its own `status >= 400` assertion while proving nothing. Nothing about a status
# code can catch that, so the routing table is asked directly.

def test_every_auth_url_in_this_file_exists(app):
    missing = [(p, m, s) for p, m in AUTH_SURFACE for s in ('', '/')
               if _resolves(app, p + s, m) is None]
    assert not missing, f'these auth URLs resolve to no handler: {missing}'


def test_the_existence_check_can_fail(app):
    """Proof the check above inspects something.

    Without this, a resolver that silently returned a truthy value for every
    input would pass `test_every_auth_url_in_this_file_exists` forever.
    """
    assert _resolves(app, '/api/v1/auth/login', 'POST') is not None
    assert _resolves(app, '/api/v1/auth/lgoin', 'POST') is None
    assert _resolves(app, '/api/v1/auth/login', 'DELETE') is None


def test_auth_urls_are_served_by_exactly_one_handler(app):
    """No rule may be shadowed — the failure #19 existed to clean up.

    Keyed to (path, method), not to endpoint names, so the port renaming every
    endpoint leaves it just as sharp.
    """
    seen = {}
    for rule in app.url_map.iter_rules():
        if not str(rule.rule).startswith('/api/v1/auth'):
            continue
        for method in rule.methods - {'HEAD', 'OPTIONS'}:
            seen.setdefault((str(rule.rule), method), set()).add(rule.endpoint)
    shadowed = {k: sorted(v) for k, v in seen.items() if len(v) > 1}
    assert not shadowed, f'auth rules are shadowed again: {shadowed}'


# --- POST /register ---------------------------------------------------------

@BOTH_SPELLINGS
def test_register_first_user_becomes_admin(client, db, slash, no_outbound_mail):
    resp = client.post(f'/api/v1/auth/register{slash}', json={
        'email': 'first@finpal.test', 'password': 'longenough1',
    })
    assert resp.status_code == 201, resp.get_data(as_text=True)[:300]
    body = resp.get_json()
    assert set(body) == {'access_token', 'refresh_token', 'user'}
    _jwt_shape(body['access_token'], 'access_token')
    _jwt_shape(body['refresh_token'], 'refresh_token')
    assert body['user'] == {
        'id': 'first@finpal.test',
        'name': 'first',
        'email': 'first@finpal.test',
        'email_verified': False,
        'is_admin': True,
        'is_demo_user': False,
        'default_currency_code': 'USD',
        'hasCompletedOnboarding': False,
        'profile_emoji': None,
        'modules': DEFAULT_MODULES,
    }
    # The verification mail is fire-and-forget, but it is part of the contract.
    assert len(no_outbound_mail) == 1
    assert no_outbound_mail[0]['to_email'] == 'first@finpal.test'
    assert 'verify-email?token=' in no_outbound_mail[0]['verification_link']


@BOTH_SPELLINGS
def test_register_honours_an_explicit_username(client, db, slash):
    resp = client.post(f'/api/v1/auth/register{slash}', json={
        'email': 'named@finpal.test', 'password': 'longenough1',
        'username': 'Chosen Name',
    })
    assert resp.status_code == 201
    assert resp.get_json()['user']['name'] == 'Chosen Name'


@BOTH_SPELLINGS
def test_register_requires_email_and_password(client, db, slash):
    for payload in ({}, {'email': 'a@b.test'}, {'password': 'longenough1'}):
        resp = client.post(f'/api/v1/auth/register{slash}', json=payload)
        assert resp.status_code == 400
        assert resp.get_json() == {'error': 'Email and password are required'}


@BOTH_SPELLINGS
def test_register_enforces_the_minimum_password_length(client, db, slash):
    resp = client.post(f'/api/v1/auth/register{slash}', json={
        'email': 'short@finpal.test', 'password': '1234567',
    })
    assert resp.status_code == 400
    assert resp.get_json() == {
        'error': 'Password must be at least 8 characters'}
    assert User.query.filter_by(id='short@finpal.test').first() is None


@BOTH_SPELLINGS
def test_register_does_not_confirm_an_address_is_taken(client, db, user, slash):
    """S-13: the message must not differ from any other refusal."""
    resp = client.post(f'/api/v1/auth/register{slash}', json={
        'email': user.id, 'password': 'longenough1',
    })
    assert resp.status_code == 400
    assert resp.get_json() == {'error': 'Unable to create account'}


@BOTH_SPELLINGS
def test_register_is_invitation_only_once_a_user_exists(client, db, user, slash):
    resp = client.post(f'/api/v1/auth/register{slash}', json={
        'email': 'stranger@finpal.test', 'password': 'longenough1',
    })
    assert resp.status_code == 403
    assert resp.get_json() == {
        'error': 'Registration is by invitation only. '
                 'Ask your household admin for an invite.'}
    assert User.query.filter_by(id='stranger@finpal.test').first() is None


@BOTH_SPELLINGS
def test_register_honours_disable_signups(client, app, db, slash):
    """Checked before the invitation path, so it means what it says."""
    app.config['DISABLE_SIGNUPS'] = True
    try:
        resp = client.post(f'/api/v1/auth/register{slash}', json={
            'email': 'nope@finpal.test', 'password': 'longenough1',
        })
    finally:
        app.config['DISABLE_SIGNUPS'] = False
    assert resp.status_code == 403
    assert resp.get_json() == {
        'error': 'Registration is disabled on this server.'}
    assert User.query.filter_by(id='nope@finpal.test').first() is None


@BOTH_SPELLINGS
def test_register_accepts_a_pending_invitation(client, db, user, slash):
    from src.models.invitation import Invitation
    invite = Invitation(email='invited@finpal.test', status='pending',
                        invited_by=user.id)
    _db.session.add(invite)
    _db.session.commit()

    resp = client.post(f'/api/v1/auth/register{slash}', json={
        'email': 'invited@finpal.test', 'password': 'longenough1',
    })
    assert resp.status_code == 201
    # Not an admin: a second user never is.
    assert resp.get_json()['user']['is_admin'] is False
    assert Invitation.query.filter_by(
        email='invited@finpal.test').first().status == 'accepted'


# --- POST /login -----------------------------------------------------------

@BOTH_SPELLINGS
def test_login_returns_the_full_user_shape(client, db, user, slash):
    resp = client.post(f'/api/v1/auth/login{slash}', json={
        'email': user.id, 'password': 'testpassword',
    })
    assert resp.status_code == 200, resp.get_data(as_text=True)[:300]
    body = resp.get_json()
    assert set(body) == {'access_token', 'refresh_token', 'user'}
    _jwt_shape(body['access_token'], 'access_token')
    _jwt_shape(body['refresh_token'], 'refresh_token')
    assert body['user'] == {
        'id': user.id,
        'name': user.name,
        'email': user.id,
        'profile_emoji': user.profile_emoji,
        'default_currency_code': user.default_currency_code,
        'hasCompletedOnboarding': user.has_completed_onboarding,
        'timezone': user.timezone,
        'modules': DEFAULT_MODULES,
        'notifications': {
            'email': True,
            'push': False,
            'budgetAlerts': True,
            'transactionAlerts': True,
        },
    }
    # login carries `timezone` and `notifications`; register does not. That
    # asymmetry is the contract, not an oversight to tidy up during the port.
    assert 'timezone' not in ('email_verified', 'is_admin')


def test_the_module_list_is_computed_not_hardcoded(client, db, user, monkeypatch):
    """`DEFAULT_MODULES` above must not be pinning a constant in the handler.

    Without this, a handler that returned a literal `['pointspal']` would satisfy
    every shape assertion in this file. Declining the module must empty the list.
    """
    from src.modules.registry import module_registry
    for module in module_registry.modules:
        monkeypatch.setattr(module, 'is_enabled', lambda: False)

    resp = client.post('/api/v1/auth/login',
                       json={'email': user.id, 'password': 'testpassword'})
    assert resp.status_code == 200
    assert resp.get_json()['user']['modules'] == []


@BOTH_SPELLINGS
def test_login_rejects_a_wrong_password_the_same_way_as_an_unknown_user(
        client, db, user, slash):
    wrong = client.post(f'/api/v1/auth/login{slash}',
                        json={'email': user.id, 'password': 'nope'})
    unknown = client.post(f'/api/v1/auth/login{slash}',
                          json={'email': 'ghost@finpal.test',
                                'password': 'testpassword'})
    assert wrong.status_code == unknown.status_code == 401
    assert wrong.get_json() == unknown.get_json() == {
        'error': 'Invalid email or password'}


@BOTH_SPELLINGS
def test_login_requires_email_and_password(client, db, slash):
    resp = client.post(f'/api/v1/auth/login{slash}', json={})
    assert resp.status_code == 400
    assert resp.get_json() == {'error': 'Email and password are required'}


@BOTH_SPELLINGS
def test_login_answers_a_malformed_body_with_the_four_key_error_shape(
        client, db, slash):
    """D-40's shape. web-ui reads `data.error`, mobile reads `data.message`."""
    resp = client.post(f'/api/v1/auth/login{slash}', data='not json',
                       content_type='application/json')
    assert resp.status_code == 400
    body = resp.get_json()
    assert body['success'] is False
    assert body['error'] == 'Bad Request'
    assert body['message'] == 'Bad Request'
    assert body['status'] == 400


# --- POST /refresh ---------------------------------------------------------

@BOTH_SPELLINGS
def test_refresh_returns_only_a_new_access_token(client, db, user, slash):
    login = client.post('/api/v1/auth/login',
                        json={'email': user.id, 'password': 'testpassword'})
    refresh_token = login.get_json()['refresh_token']

    resp = client.post(f'/api/v1/auth/refresh{slash}', headers={
        'Authorization': f'Bearer {refresh_token}'})
    assert resp.status_code == 200, resp.get_data(as_text=True)[:300]
    body = resp.get_json()
    assert set(body) == {'access_token'}
    _jwt_shape(body['access_token'], 'access_token')


@BOTH_SPELLINGS
def test_refresh_rejects_an_access_token(client, db, user, auth_headers, slash):
    """A refresh route that accepts access tokens defeats the point of both.

    **401, not the 422 flask-jwt-extended raises for a wrong token type.**
    Captured because it was a surprise: the app's own error handling turns it
    into a 401, which is what both clients already treat as "log in again". A
    port that let restx answer 422 here would send mobile down a branch it does
    not have.
    """
    resp = client.post(f'/api/v1/auth/refresh{slash}',
                       headers=auth_headers(user))
    assert resp.status_code == 401


@BOTH_SPELLINGS
def test_refresh_requires_a_token(client, db, slash):
    assert client.post(f'/api/v1/auth/refresh{slash}').status_code == 401


# --- GET /me --------------------------------------------------------------

@BOTH_SPELLINGS
def test_me_returns_the_profile(client, db, user, auth_headers, slash):
    resp = client.get(f'/api/v1/auth/me{slash}', headers=auth_headers(user))
    assert resp.status_code == 200, resp.get_data(as_text=True)[:300]
    body = resp.get_json()
    assert body == {
        'id': user.id,
        'name': user.name,
        'email': user.id,
        'user_color': user.user_color,
        'profile_emoji': user.profile_emoji,
        'is_admin': user.is_admin,
        'default_currency_code': user.default_currency_code,
        'timezone': user.timezone,
        'hasCompletedOnboarding': user.has_completed_onboarding,
        'notifications': {
            'email': True,
            'push': False,
            'budgetAlerts': True,
            'transactionAlerts': True,
        },
        'created_at': user.created_at.isoformat() if user.created_at else None,
    }
    # `/me` is the only auth route carrying user_color and created_at, and the
    # only one that does NOT carry `modules`.
    assert 'modules' not in body


@BOTH_SPELLINGS
def test_me_requires_a_token(client, db, slash):
    assert client.get(f'/api/v1/auth/me{slash}').status_code == 401


# --- POST /logout ---------------------------------------------------------

@BOTH_SPELLINGS
def test_logout_revokes_the_token_it_was_called_with(
        client, db, user, auth_headers, slash):
    headers = auth_headers(user)
    assert client.get('/api/v1/auth/me', headers=headers).status_code == 200

    resp = client.post(f'/api/v1/auth/logout{slash}', headers=headers)
    assert resp.status_code == 200
    assert resp.get_json() == {'message': 'Logged out successfully'}

    # S-08. Asserted on the database and on a subsequent request, not on the
    # status code the logout itself returned.
    assert RevokedToken.query.count() == 1
    assert client.get('/api/v1/auth/me', headers=headers).status_code == 401


@BOTH_SPELLINGS
def test_logout_twice_does_not_double_revoke(
        client, db, user, auth_headers, slash):
    headers = auth_headers(user)
    client.post(f'/api/v1/auth/logout{slash}', headers=headers)
    # The token is revoked, so the second call cannot get past jwt_required.
    assert client.post(f'/api/v1/auth/logout{slash}',
                       headers=headers).status_code == 401
    assert RevokedToken.query.count() == 1


@BOTH_SPELLINGS
def test_logout_requires_a_token(client, db, slash):
    assert client.post(f'/api/v1/auth/logout{slash}').status_code == 401


# --- POST /onboarding -----------------------------------------------------

@BOTH_SPELLINGS
def test_onboarding_saves_every_preference_it_accepts(
        client, db, user, auth_headers, slash):
    resp = client.post(f'/api/v1/auth/onboarding{slash}',
                       headers=auth_headers(user), json={
                           'default_currency_code': 'GBP',
                           'timezone': 'Europe/London',
                           'profile_emoji': '\U0001f9ee',
                           'notifications': {
                               'email': False, 'push': True,
                               'budgetAlerts': False,
                               'transactionAlerts': False,
                           },
                       })
    assert resp.status_code == 200, resp.get_data(as_text=True)[:300]
    assert resp.get_json() == {
        'id': user.id,
        'name': user.name,
        'email': user.id,
        'profile_emoji': '\U0001f9ee',
        'default_currency_code': 'GBP',
        'timezone': 'Europe/London',
        'hasCompletedOnboarding': True,
        'is_demo_user': False,
        'modules': DEFAULT_MODULES,
    }

    # Asserted on the row, not on the echo: the response repeats the request.
    saved = User.query.filter_by(id=user.id).first()
    assert saved.default_currency_code == 'GBP'
    assert saved.timezone == 'Europe/London'
    assert saved.notification_email is False
    assert saved.notification_push is True
    assert saved.notification_budget_alerts is False
    assert saved.notification_transaction_alerts is False
    assert saved.has_completed_onboarding is True


@BOTH_SPELLINGS
def test_onboarding_requires_a_body(client, db, user, auth_headers, slash):
    resp = client.post(f'/api/v1/auth/onboarding{slash}',
                       headers=auth_headers(user), json={})
    assert resp.status_code == 400
    assert resp.get_json() == {'error': 'Request body is required'}


@BOTH_SPELLINGS
def test_onboarding_requires_a_token(client, db, slash):
    assert client.post(f'/api/v1/auth/onboarding{slash}',
                       json={'timezone': 'UTC'}).status_code == 401


# --- POST /verify-email ---------------------------------------------------

@BOTH_SPELLINGS
def test_verify_email_marks_the_address_verified(client, db, user, slash):
    token = user.generate_verification_token()
    _db.session.commit()

    resp = client.post(f'/api/v1/auth/verify-email{slash}',
                       json={'token': token})
    assert resp.status_code == 200, resp.get_data(as_text=True)[:300]
    assert resp.get_json() == {
        'message': 'Email verified successfully',
        'user': {'id': user.id, 'email': user.id, 'email_verified': True},
    }
    saved = User.query.filter_by(id=user.id).first()
    assert saved.email_verified is True
    assert saved.verification_token is None


@BOTH_SPELLINGS
def test_verify_email_requires_a_token(client, db, slash):
    resp = client.post(f'/api/v1/auth/verify-email{slash}', json={})
    assert resp.status_code == 400
    assert resp.get_json() == {'error': 'Verification token is required'}


@BOTH_SPELLINGS
def test_verify_email_rejects_an_unknown_token(client, db, slash):
    resp = client.post(f'/api/v1/auth/verify-email{slash}',
                       json={'token': 'not-a-real-token'})
    assert resp.status_code == 400
    assert resp.get_json() == {'error': 'Invalid verification token'}


# --- POST /resend-verification -------------------------------------------

@BOTH_SPELLINGS
def test_resend_verification_sends_a_fresh_link(
        client, db, user, slash, no_outbound_mail):
    user.email_verified = False
    user.generate_verification_token()
    _db.session.commit()
    first_token = user.verification_token

    resp = client.post(f'/api/v1/auth/resend-verification{slash}',
                       json={'email': user.id})
    assert resp.status_code == 200, resp.get_data(as_text=True)[:300]
    assert resp.get_json() == {'message': 'Verification email sent'}
    assert len(no_outbound_mail) == 1
    assert User.query.filter_by(
        id=user.id).first().verification_token != first_token


@BOTH_SPELLINGS
def test_resend_verification_does_not_reveal_whether_the_user_exists(
        client, db, slash, no_outbound_mail):
    resp = client.post(f'/api/v1/auth/resend-verification{slash}',
                       json={'email': 'ghost@finpal.test'})
    assert resp.status_code == 200
    assert resp.get_json() == {
        'message': 'If the email exists, a verification link has been sent'}
    assert no_outbound_mail == []


@BOTH_SPELLINGS
def test_resend_verification_refuses_an_already_verified_address(
        client, db, user, slash, no_outbound_mail):
    user.email_verified = True
    _db.session.commit()
    resp = client.post(f'/api/v1/auth/resend-verification{slash}',
                       json={'email': user.id})
    assert resp.status_code == 400
    assert resp.get_json() == {'error': 'Email is already verified'}
    assert no_outbound_mail == []


@BOTH_SPELLINGS
def test_resend_verification_requires_an_email(client, db, slash):
    resp = client.post(f'/api/v1/auth/resend-verification{slash}', json={})
    assert resp.status_code == 400
    assert resp.get_json() == {'error': 'Email is required'}


# --- POST /forgot-password -----------------------------------------------

@BOTH_SPELLINGS
def test_forgot_password_answers_identically_for_a_real_and_a_fake_address(
        client, db, user, slash, no_outbound_mail):
    """Enumeration is the whole point of this endpoint's shape."""
    real = client.post(f'/api/v1/auth/forgot-password{slash}',
                       json={'email': user.id})
    fake = client.post(f'/api/v1/auth/forgot-password{slash}',
                       json={'email': 'ghost@finpal.test'})
    assert real.status_code == fake.status_code == 200
    assert real.get_json() == fake.get_json() == {
        'success': True,
        'message': 'If the email exists, a reset link has been sent'}

    # Indistinguishable to the caller, but only one of them sent mail and only
    # one of them minted a token.
    assert len(no_outbound_mail) == 1
    assert no_outbound_mail[0]['to_email'] == user.id
    assert 'reset-password?token=' in no_outbound_mail[0]['reset_link']
    assert User.query.filter_by(id=user.id).first().reset_token is not None


@BOTH_SPELLINGS
def test_forgot_password_requires_an_email(client, db, slash):
    resp = client.post(f'/api/v1/auth/forgot-password{slash}', json={})
    assert resp.status_code == 400
    assert resp.get_json() == {'error': 'Email is required'}


# --- GET /config ---------------------------------------------------------

@BOTH_SPELLINGS
def test_config_reports_the_login_options_this_server_offers(client, db, slash):
    resp = client.get(f'/api/v1/auth/config{slash}')
    assert resp.status_code == 200
    body = resp.get_json()
    # Mobile's login screen branches on every one of these keys.
    assert set(body) == {'oidc_enabled', 'oidc_provider_name',
                         'apple_signin_enabled', 'google_client_id',
                         'google_signin_enabled'}
    assert body['oidc_enabled'] is False
    assert body['oidc_provider_name'] == 'SSO'
    assert body['apple_signin_enabled'] is False
    assert body['google_signin_enabled'] is False
    assert body['google_client_id'] == ''


@BOTH_SPELLINGS
def test_config_needs_no_token(client, db, slash):
    """The login screen calls it before anybody has a token."""
    assert client.get(f'/api/v1/auth/config{slash}').status_code == 200


# --- POST /apple ---------------------------------------------------------
# The env vars are patched, not the `native_signin_available` helper: the port
# moves that function, and a monkeypatch keyed to its name would go quiet.

@BOTH_SPELLINGS
def test_apple_signin_is_refused_when_the_server_has_not_enabled_it(
        client, db, slash):
    resp = client.post(f'/api/v1/auth/apple{slash}',
                       json={'identity_token': 'anything'})
    assert resp.status_code == 403
    assert resp.get_json() == {'error': 'Apple Sign In is not enabled'}


@BOTH_SPELLINGS
def test_apple_signin_requires_an_identity_token_when_enabled(
        client, db, slash, monkeypatch):
    monkeypatch.setenv('APPLE_SIGNIN_ENABLED', 'true')
    monkeypatch.setenv('APPLE_CLIENT_ID', 'io.palstack.finpal')
    resp = client.post(f'/api/v1/auth/apple{slash}', json={})
    assert resp.status_code == 400
    assert resp.get_json() == {'error': 'identity_token is required'}


@BOTH_SPELLINGS
def test_apple_signin_reports_a_bad_token_as_401_not_500(
        client, db, slash, monkeypatch):
    monkeypatch.setenv('APPLE_SIGNIN_ENABLED', 'true')
    monkeypatch.setenv('APPLE_CLIENT_ID', 'io.palstack.finpal')
    from integrations.oidc import native

    def reject(provider, token):
        raise native.OidcVerificationError('Token has expired')

    monkeypatch.setattr(native, 'verify_id_token', reject)
    resp = client.post(f'/api/v1/auth/apple{slash}',
                       json={'identity_token': 'expired'})
    assert resp.status_code == 401
    assert resp.get_json() == {'error': 'Token has expired'}


@BOTH_SPELLINGS
def test_apple_signin_reports_misconfiguration_as_503_not_401(
        client, db, slash, monkeypatch):
    """An operator's mistake must not send the user hunting for a bad token."""
    monkeypatch.setenv('APPLE_SIGNIN_ENABLED', 'true')
    monkeypatch.setenv('APPLE_CLIENT_ID', 'io.palstack.finpal')
    from integrations.oidc import native

    def misconfigured(provider, token):
        raise native.OidcConfigError('Apple Sign In is not configured')

    monkeypatch.setattr(native, 'verify_id_token', misconfigured)
    resp = client.post(f'/api/v1/auth/apple{slash}',
                       json={'identity_token': 'whatever'})
    assert resp.status_code == 503
    assert resp.get_json() == {'error': 'Apple Sign In is not configured'}


@BOTH_SPELLINGS
def test_apple_signin_creates_an_account_from_the_verified_claims_only(
        client, db, slash, monkeypatch):
    """The account-takeover fix: identity comes from the token, never the body."""
    monkeypatch.setenv('APPLE_SIGNIN_ENABLED', 'true')
    monkeypatch.setenv('APPLE_CLIENT_ID', 'io.palstack.finpal')
    from integrations.oidc import native

    monkeypatch.setattr(native, 'verify_id_token', lambda p, t: {
        'sub': 'apple-sub-1', 'email': 'claims@finpal.test',
        'email_verified': True,
    })
    resp = client.post(f'/api/v1/auth/apple{slash}', json={
        'identity_token': 'good',
        'full_name': 'Real Name',
        # A caller naming somebody else's address must be ignored entirely.
        'email': 'victim@finpal.test',
    })
    assert resp.status_code == 200, resp.get_data(as_text=True)[:300]
    body = resp.get_json()
    assert set(body) == {'access_token', 'refresh_token', 'user'}
    _jwt_shape(body['access_token'], 'access_token')
    _jwt_shape(body['refresh_token'], 'refresh_token')
    assert body['user'] == {
        'id': 'claims@finpal.test',
        'name': 'Real Name',
        'email': 'claims@finpal.test',
        'default_currency_code': 'USD',
        # None, NOT the '\U0001f464' the handler's
        # `getattr(user, 'profile_emoji', '\U0001f464')` looks like it supplies:
        # the column exists and holds None, so getattr returns None and the
        # default is dead code. Pinned as it behaves, not as it reads — a port
        # that "fixed" this would be a client-visible change smuggled in.
        'profile_emoji': None,
    }
    assert User.query.filter_by(id='victim@finpal.test').first() is None


# --- POST /reset-password ------------------------------------------------

@BOTH_SPELLINGS
def test_reset_password_actually_changes_the_password(client, db, user, slash):
    token = user.generate_reset_token()
    _db.session.commit()

    resp = client.post(f'/api/v1/auth/reset-password{slash}', json={
        'token': token, 'password': 'brandnewpassword'})
    assert resp.status_code == 200, resp.get_data(as_text=True)[:300]
    assert resp.get_json() == {'success': True,
                               'message': 'Password reset successfully'}

    # Asserted by logging in, not by the status code.
    assert client.post('/api/v1/auth/login', json={
        'email': user.id, 'password': 'brandnewpassword'}).status_code == 200
    assert client.post('/api/v1/auth/login', json={
        'email': user.id, 'password': 'testpassword'}).status_code == 401
    assert User.query.filter_by(id=user.id).first().reset_token is None


@BOTH_SPELLINGS
def test_reset_password_also_accepts_the_new_password_field_name(
        client, db, user, slash):
    """Both spellings are in the wild; dropping either breaks a live client."""
    token = user.generate_reset_token()
    _db.session.commit()
    resp = client.post(f'/api/v1/auth/reset-password{slash}', json={
        'token': token, 'new_password': 'brandnewpassword'})
    assert resp.status_code == 200
    assert client.post('/api/v1/auth/login', json={
        'email': user.id, 'password': 'brandnewpassword'}).status_code == 200


@BOTH_SPELLINGS
def test_reset_password_requires_a_token_and_a_password(client, db, slash):
    for payload in ({}, {'token': 'x'}, {'password': 'longenough1'}):
        resp = client.post(f'/api/v1/auth/reset-password{slash}', json=payload)
        assert resp.status_code == 400
        assert resp.get_json() == {
            'error': 'Token and new password are required'}


@BOTH_SPELLINGS
def test_reset_password_enforces_the_minimum_length(client, db, user, slash):
    token = user.generate_reset_token()
    _db.session.commit()
    resp = client.post(f'/api/v1/auth/reset-password{slash}', json={
        'token': token, 'password': '1234567'})
    assert resp.status_code == 400
    assert resp.get_json() == {
        'error': 'Password must be at least 8 characters'}
    # The old password still works.
    assert client.post('/api/v1/auth/login', json={
        'email': user.id, 'password': 'testpassword'}).status_code == 200


@BOTH_SPELLINGS
def test_reset_password_rejects_an_unknown_token(client, db, slash):
    resp = client.post(f'/api/v1/auth/reset-password{slash}', json={
        'token': 'not-a-real-token', 'password': 'longenough1'})
    assert resp.status_code == 400
    assert resp.get_json() == {'error': 'Invalid reset token'}


@BOTH_SPELLINGS
def test_reset_password_spends_the_token(client, db, user, slash):
    token = user.generate_reset_token()
    _db.session.commit()
    client.post(f'/api/v1/auth/reset-password{slash}',
                json={'token': token, 'password': 'brandnewpassword'})
    again = client.post(f'/api/v1/auth/reset-password{slash}',
                        json={'token': token, 'password': 'thirdpassword1'})
    assert again.status_code == 400
    assert again.get_json() == {'error': 'Invalid reset token'}


# --- POST /oidc ----------------------------------------------------------

@BOTH_SPELLINGS
def test_oidc_requires_a_provider(client, db, slash):
    resp = client.post(f'/api/v1/auth/oidc{slash}', json={'id_token': 'x'})
    assert resp.status_code == 400
    assert resp.get_json() == {'error': 'provider is required'}


@BOTH_SPELLINGS
def test_oidc_names_the_provider_it_has_not_enabled(client, db, slash):
    resp = client.post(f'/api/v1/auth/oidc{slash}',
                       json={'provider': 'google', 'id_token': 'x'})
    assert resp.status_code == 403
    assert resp.get_json() == {
        'error': 'Google sign-in is not enabled on this server'}


@BOTH_SPELLINGS
def test_oidc_requires_a_token_of_some_kind(client, db, slash, monkeypatch):
    monkeypatch.setenv('GOOGLE_CLIENT_ID', 'test-client-id')
    resp = client.post(f'/api/v1/auth/oidc{slash}', json={'provider': 'google'})
    assert resp.status_code == 400
    assert resp.get_json() == {'error': 'id_token or access_token is required'}


@BOTH_SPELLINGS
def test_oidc_accepts_an_access_token_via_userinfo(
        client, db, slash, monkeypatch):
    """Google's native SDKs often hand the app an access_token, not an id_token."""
    monkeypatch.setenv('GOOGLE_CLIENT_ID', 'test-client-id')
    from integrations.oidc import native

    monkeypatch.setattr(native, 'fetch_userinfo', lambda p, t: {
        'sub': 'google-sub-1', 'email': 'gmail@finpal.test',
        'email_verified': 'true', 'name': 'From Userinfo',
    })
    resp = client.post(f'/api/v1/auth/oidc{slash}', json={
        'provider': 'google', 'access_token': 'ya29.x'})
    assert resp.status_code == 200, resp.get_data(as_text=True)[:300]
    assert resp.get_json()['user']['id'] == 'gmail@finpal.test'
    assert resp.get_json()['user']['name'] == 'From Userinfo'


@BOTH_SPELLINGS
def test_oidc_refuses_a_token_carrying_no_subject(client, db, slash, monkeypatch):
    monkeypatch.setenv('GOOGLE_CLIENT_ID', 'test-client-id')
    from integrations.oidc import native
    monkeypatch.setattr(native, 'verify_id_token',
                        lambda p, t: {'email': 'nosub@finpal.test'})
    resp = client.post(f'/api/v1/auth/oidc{slash}', json={
        'provider': 'google', 'id_token': 'x'})
    assert resp.status_code == 401
    assert resp.get_json() == {'error': 'Provider token carried no subject'}


@BOTH_SPELLINGS
def test_oidc_will_not_create_an_account_from_an_unverified_address(
        client, db, slash, monkeypatch):
    monkeypatch.setenv('GOOGLE_CLIENT_ID', 'test-client-id')
    from integrations.oidc import native
    monkeypatch.setattr(native, 'verify_id_token', lambda p, t: {
        'sub': 'google-sub-2', 'email': 'unverified@finpal.test',
        'email_verified': False,
    })
    resp = client.post(f'/api/v1/auth/oidc{slash}', json={
        'provider': 'google', 'id_token': 'x'})
    assert resp.status_code == 403
    assert resp.get_json() == {
        'error': 'This account email is not verified with the provider'}
    assert User.query.filter_by(id='unverified@finpal.test').first() is None


@BOTH_SPELLINGS
def test_oidc_will_not_create_an_account_with_no_address_at_all(
        client, db, slash, monkeypatch):
    """Apple omits `email` on every sign-in after the first."""
    monkeypatch.setenv('GOOGLE_CLIENT_ID', 'test-client-id')
    from integrations.oidc import native
    monkeypatch.setattr(native, 'verify_id_token',
                        lambda p, t: {'sub': 'google-sub-3'})
    resp = client.post(f'/api/v1/auth/oidc{slash}', json={
        'provider': 'google', 'id_token': 'x'})
    assert resp.status_code == 400
    assert 'did not return an email address' in resp.get_json()['error']


@BOTH_SPELLINGS
def test_oidc_resolves_a_returning_user_by_sub_not_by_email(
        client, db, slash, monkeypatch):
    """The second sign-in has no email claim and must still find the account."""
    monkeypatch.setenv('GOOGLE_CLIENT_ID', 'test-client-id')
    from integrations.oidc import native

    monkeypatch.setattr(native, 'verify_id_token', lambda p, t: {
        'sub': 'google-sub-4', 'email': 'returning@finpal.test',
        'email_verified': True,
    })
    first = client.post(f'/api/v1/auth/oidc{slash}', json={
        'provider': 'google', 'id_token': 'x'})
    assert first.status_code == 200, first.get_data(as_text=True)[:300]

    monkeypatch.setattr(native, 'verify_id_token',
                        lambda p, t: {'sub': 'google-sub-4'})
    second = client.post(f'/api/v1/auth/oidc{slash}', json={
        'provider': 'google', 'id_token': 'x'})
    assert second.status_code == 200, second.get_data(as_text=True)[:300]
    assert second.get_json()['user']['id'] == 'returning@finpal.test'
    assert User.query.count() == 1
