"""Changing a password: the status code, and what the message is allowed to claim.

palStack-io/finpal-core#144. A self-hoster running SSO tried to set a local password
so they would have a break-glass admin, and got `401 Current password is incorrect`.

*** THE 401 WAS TECHNICALLY ACCURATE AND COMPLETELY USELESS. *** An OIDC-created
account is given `set_password(secrets.token_urlsafe(24))` at
`src/models/user.py:130` — a real hash of a password **nobody will ever know** — so
`check_password` correctly returns False for anything the human types, forever. They
were not told they had no usable password; they were told they had typed it wrong.

TWO THINGS ARE FIXED HERE AND ONE IS DELIBERATELY NOT.

Fixed: the **status code**, which was wrong on its own merits, and the **message**,
which now names the possibility instead of only blaming the input.

Not fixed here, by owner decision 2026-09-08: letting an SSO user SET a first local
password. It needs a way to tell "has no usable password" from "typed it wrong", and
there is none today — `oidc_id` cannot do it, because
`User.create_or_update_from_oidc` *links* an existing local account by setting
`oidc_id` on it (`src/models/user.py:89-91`), so a local user who signs in through
SSO once has both an `oidc_id` and a real password they are entitled to change.
Keying the refusal to `oidc_id` would break password changes for exactly those
people. So it needs a column, which makes it release-gating under D-121, and it is
filed rather than rushed.
"""
import pytest

from tests.factories import UserFactory


@pytest.fixture
def as_user(client, auth_headers):
    user = UserFactory(name='Local', password_plain='knownpassword')
    return user, auth_headers(user, password='knownpassword')


def test_a_correct_current_password_changes_it(client, as_user, db):
    """The happy path, asserted on the DATABASE and then on a real login.

    A 200 here proves nothing by itself — `set_password` could have been skipped and
    the handler would still answer 200. So the new password is used to authenticate.
    """
    user, headers = as_user
    resp = client.put('/api/v1/users/password', headers=headers, json={
        'currentPassword': 'knownpassword', 'newPassword': 'a-brand-new-one'})
    assert resp.status_code == 200, resp.get_json()

    assert user.check_password('a-brand-new-one') is True
    assert user.check_password('knownpassword') is False

    login = client.post('/api/v1/auth/login',
                        json={'email': user.id, 'password': 'a-brand-new-one'})
    assert login.status_code == 200, login.get_json()


def test_a_wrong_current_password_is_400_and_not_401(client, as_user, db):
    """*** #144, and the status code is a real defect rather than pedantry. ***

    `web-ui/src/services/api.ts:38` intercepts **every** 401 and tries to refresh the
    access token, logging the user out when that refresh fails. So answering 401 to a
    mistyped current password means a typo runs the re-authentication path, and a
    user whose refresh token has expired **gets signed out for mistyping a
    password**. 400 is what "your input was wrong" means; 401 is what "you are not
    authenticated" means, and the caller was authenticated — they got this far.
    """
    _, headers = as_user
    resp = client.put('/api/v1/users/password', headers=headers, json={
        'currentPassword': 'not-the-password', 'newPassword': 'a-brand-new-one'})

    assert resp.status_code == 400, (
        f'answered {resp.status_code}; a 401 here drives the client interceptor '
        f'into a token refresh and can sign the user out for a typo (#144)')


def test_the_refusal_names_the_sso_case_without_asserting_it(client, as_user, db):
    """The message the reporter should have got.

    It must NOT claim the account has no local password — nothing here can know
    that, and a local user who linked SSO does have one. So it states the input was
    wrong AND that an SSO-only account may have no local password to change, which
    is true in both cases and actionable in the one that matters.
    """
    _, headers = as_user
    body = client.put('/api/v1/users/password', headers=headers, json={
        'currentPassword': 'not-the-password',
        'newPassword': 'a-brand-new-one'}).get_json()

    message = (body.get('message') or '').lower()
    assert 'incorrect' in message, body
    assert 'sso' in message or 'single sign' in message, (
        f'the refusal still only blames the input, which is what left the reporter '
        f'with nowhere to go (#144): {body}')


def test_a_wrong_current_password_does_not_change_it(client, as_user, db):
    """Asserted on the database, because a status code is not a fact (house rule)."""
    user, headers = as_user
    client.put('/api/v1/users/password', headers=headers, json={
        'currentPassword': 'not-the-password', 'newPassword': 'attacker-choice'})

    assert user.check_password('knownpassword') is True
    assert user.check_password('attacker-choice') is False


def test_a_short_new_password_is_still_refused(client, as_user, db):
    """The strength check must survive the status-code change above."""
    user, headers = as_user
    resp = client.put('/api/v1/users/password', headers=headers, json={
        'currentPassword': 'knownpassword', 'newPassword': 'short'})

    assert resp.status_code == 400
    assert user.check_password('knownpassword') is True


def test_a_user_with_no_password_hash_at_all_does_not_500(client, auth_headers, db):
    """*** A SEPARATE LATENT 500, FOUND WHILE READING #144. ***

    `User.check_password` wraps `check_password_hash` in `try/except ValueError` —
    but a `None` hash makes werkzeug 3.1.3 raise **AttributeError**
    (`'NoneType' object has no attribute 'split'`), which that clause does not catch.
    Measured directly against the installed werkzeug, not inferred.

    `password_hash` is nullable and every current write path sets it, so this is not
    reachable through the API today. It is reachable on a database — an imported row,
    a hand-run INSERT, or a future auth path that forgets — and `check_password` is
    on the **login** route, so the failure mode is `POST /auth/login` answering 500
    instead of "invalid credentials". Fixed by catching what is actually raised.
    """
    from src.extensions import db as _db

    user = UserFactory(name='Hashless', password_plain='temp')
    headers = auth_headers(user, password='temp')
    _db.session.execute(
        _db.text('UPDATE users SET password_hash = NULL WHERE id = :i'),
        {'i': user.id})
    _db.session.commit()
    _db.session.expire_all()

    resp = client.put('/api/v1/users/password', headers=headers, json={
        'currentPassword': 'anything', 'newPassword': 'a-brand-new-one'})
    assert resp.status_code == 400, (
        f'a NULL password_hash raised instead of being refused: {resp.status_code}')

    login = client.post('/api/v1/auth/login',
                        json={'email': user.id, 'password': 'anything'})
    assert login.status_code in (400, 401), (
        f'login answered {login.status_code} for a row with no password hash; that '
        f'is a 500 dressed up, not a credential refusal')
