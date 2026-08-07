"""A `required` in swagger must mean the server actually refuses without it.

The sibling gates prove every route is in the document and every body-reading
route documents a body. Neither says the document is *true*, and a route
documented with the wrong contract breaks a generated client exactly as badly as
a route that is missing: `Register` declared `username` required for two years
while the handler defaults it to the local part of the email, which would have
made the field mandatory in every generated client.

**The dangerous direction is over-claiming.** A field wrongly marked required
makes the client refuse a request the server accepts — and no server-side test
catches it, because the server is not the thing being broken. So each claim is
checked by *making the request the document calls invalid* and watching what the
server does with it.

**Two of these endpoints accept either of two spellings**, which is where
over-claiming was one keystroke away:

    reset-password:  data.get('password') or data.get('new_password')
    oidc:            if not id_token and not access_token

Marking any one of those four required would have been the natural reading of
the handler and would have been wrong. They are asserted below in both
directions, and the assertions are on the error *payload* rather than the status
code, because every one of these paths answers 400 for several different reasons
and the status alone cannot tell them apart.
"""
import pytest


def _definitions(client):
    spec = client.get('/api/v1/swagger.json').get_json()
    assert spec and spec.get('definitions'), 'swagger served no definitions'
    return spec['definitions']


def _required(client, model):
    definitions = _definitions(client)
    assert model in definitions, f'{model} is not in swagger definitions'
    return definitions[model].get('required', [])


# --------------------------------------------------------------------------
# The alternation traps: neither spelling may be marked required.
# --------------------------------------------------------------------------

def test_reset_password_marks_neither_password_spelling_required(client):
    required = _required(client, 'ResetPasswordRequest')
    assert 'token' in required, 'the handler does refuse without a token'
    assert 'password' not in required, (
        "the handler accepts `new_password` instead, so demanding `password` "
        "would make a generated client refuse a request the server allows")
    assert 'new_password' not in required, (
        "the handler accepts `password` instead")


@pytest.mark.parametrize('spelling', ['password', 'new_password'])
def test_reset_password_really_accepts_either_spelling(client, db, spelling):
    """Both spellings must get *past* the missing-field guard.

    An invalid token is fine and expected - what matters is which error comes
    back. 'Token and new password are required' means the spelling was not
    recognised; the token error means it was.
    """
    resp = client.post('/api/v1/auth/reset-password',
                       json={'token': 'not-a-real-token', spelling: 'longenough1'})
    body = resp.get_json()
    message = (body.get('error') or body.get('message') or '').lower()
    assert 'required' not in message, (
        f'sending only `{spelling}` was treated as a missing password, so the '
        f'two spellings are NOT interchangeable and the model is wrong: {body}')
    assert 'token' in message, (
        f'expected the request to fail on the bad token, meaning `{spelling}` '
        f'was accepted; got: {body}')


def test_reset_password_still_refuses_when_both_spellings_are_absent(client, db):
    """The other half - or the test above would pass on a handler with no guard."""
    resp = client.post('/api/v1/auth/reset-password', json={'token': 'x'})
    body = resp.get_json()
    assert resp.status_code == 400
    assert 'required' in (body.get('error') or body.get('message') or '').lower(), body


def test_oidc_marks_neither_token_required(client):
    required = _required(client, 'OidcSignIn')
    assert 'provider' in required, 'the handler does refuse without a provider'
    assert 'id_token' not in required, 'access_token alone is accepted'
    assert 'access_token' not in required, 'id_token alone is accepted'


# --------------------------------------------------------------------------
# Under-claiming is checked too: a field the server refuses without must say so.
# --------------------------------------------------------------------------

@pytest.mark.parametrize('path,model,field,body', [
    ('/api/v1/auth/verify-email', 'VerifyEmail', 'token', {}),
    ('/api/v1/auth/resend-verification', 'ResendVerification', 'email', {}),
    ('/api/v1/auth/forgot-password', 'ForgotPassword', 'email', {}),
])
def test_a_required_field_is_documented_and_enforced(client, db, path, model, field, body):
    assert field in _required(client, model), (
        f'{model}.{field} is enforced by the handler but not documented as required')
    resp = client.post(path, json=body)
    assert resp.status_code == 400, (
        f'{path} accepted a body with no {field}, so the model over-claims: '
        f'{resp.get_json()}')
    assert field.split('_')[0] in (
        resp.get_json().get('error') or resp.get_json().get('message') or ''
    ).lower(), resp.get_json()


def test_onboarding_claims_nothing_required(client):
    """It rejects only a wholly absent body, never an individual field."""
    assert _required(client, 'Onboarding') == [], (
        'the onboarding handler reads every key with a default; claiming any of '
        'them required would make a generated client demand fields nobody needs')


def test_optional_bodies_stay_optional(client):
    """Fields the handler treats as "leave it alone" must not be required."""
    for model in ('CategoryUpdate', 'ApiSettings', 'BulkApplyRules', 'MemberRole'):
        assert _required(client, model) == [], (
            f'{model} claims a required field, but its handler updates a value '
            f'only when the key is present - an omitted key means "unchanged"')


def test_the_required_check_can_fail(client):
    """Proof this file inspects something.

    A `_required` that always returned [] would satisfy every "not required"
    assertion above in silence.
    """
    assert 'email' in _required(client, 'Login')
    assert 'password' in _required(client, 'Login')
    assert _required(client, 'Register') == sorted(['email', 'password']) or set(
        _required(client, 'Register')) == {'email', 'password'}, (
        'Register should require exactly email and password')
    assert 'username' not in _required(client, 'Register'), (
        'the original defect: the handler defaults username')
