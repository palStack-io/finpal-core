"""
Integration tests for native Apple Sign In (POST /api/v1/auth/apple).

Regression coverage for two bugs:

  * Account takeover — the endpoint used to fall back to a client-supplied
    `email` when the identity token carried no email claim. Apple omits that
    claim on every sign-in after the first authorization, so the fallback was
    the normal path, and the user PK *is* the email.
  * `User.from_oidc` used to be installed only when OIDC_ENABLED=true, while
    this endpoint is gated on APPLE_SIGNIN_ENABLED. The test app has OIDC
    disabled, so every test here also covers that.

Apple's JWKS fetch and signature check are stubbed — these tests are about the
identity-resolution logic that runs after a token has verified, not about JWT
verification itself.
"""

import jwt as pyjwt
import pytest
import requests
from jwt.algorithms import RSAAlgorithm

from tests.factories import UserFactory

BUNDLE_ID = 'io.palstack.finpal'


@pytest.fixture
def apple_enabled(monkeypatch):
    monkeypatch.setenv('APPLE_SIGNIN_ENABLED', 'true')
    monkeypatch.setenv('APPLE_CLIENT_ID', BUNDLE_ID)


@pytest.fixture
def stub_apple(monkeypatch):
    """Stub Apple's discovery + JWKS endpoints and signature verification.

    Returns a setter that installs the claims a token should decode to. The
    stubbed `decode` still enforces the `audience` argument, so tests exercise
    the real audience plumbing rather than bypassing it.

    Two responses now, not one: /auth/apple delegates to
    integrations/oidc/native.py, which reads the OIDC discovery document to find
    jwks_uri rather than hardcoding Apple's key URL. Issuer is checked by
    native._decode against a set after decoding, since PyJWT 2.8 compares `iss`
    with a plain != and cannot take a list — so `decode` is no longer passed an
    `issuer` kwarg and asserting on one here would test nothing.
    """
    from integrations.oidc import native

    native.clear_jwks_cache()

    class _Resp:
        status_code = 200

        def __init__(self, payload):
            self._payload = payload

        def raise_for_status(self):
            pass

        def json(self):
            return self._payload

    def _get(url, **kwargs):
        if 'well-known' in url:
            return _Resp({'jwks_uri': 'https://appleid.apple.com/auth/keys'})
        return _Resp({'keys': [{'kid': 'testkid', 'kty': 'RSA'}]})

    monkeypatch.setattr(native.requests, 'get', _get)
    monkeypatch.setattr(requests, 'get', _get)
    monkeypatch.setattr(RSAAlgorithm, 'from_jwk', staticmethod(lambda k: 'fake-public-key'))
    monkeypatch.setattr(pyjwt, 'get_unverified_header', lambda t: {'kid': 'testkid'})

    def set_claims(claims):
        # Default a valid issuer in. These tests are about identity resolution,
        # not issuer validation — native._decode now checks `iss` against a set,
        # and making every fixture restate Apple's URL would only obscure what
        # each test is actually asserting. Issuer rejection has its own coverage
        # in tests/unit/test_native_oidc.py.
        claims = dict(claims)
        claims.setdefault('iss', 'https://appleid.apple.com')

        def _decode(token, key, **kwargs):
            if kwargs.get('audience') != BUNDLE_ID:
                raise pyjwt.InvalidAudienceError('Audience does not match')
            # native._decode checks the issuer itself, after this returns, so a
            # claims dict without a valid `iss` is still refused.
            return claims

        monkeypatch.setattr(pyjwt, 'decode', _decode)
        monkeypatch.setattr(native.pyjwt, 'decode', _decode)

    return set_claims


# ---------------------------------------------------------------------------
# The takeover regression
# ---------------------------------------------------------------------------

def test_body_email_cannot_claim_an_existing_account(
    client, db, apple_enabled, stub_apple
):
    """A valid Apple token + someone else's email in the body must not log in.

    This is the takeover: the attacker's token is genuinely theirs, carries no
    email claim (the normal case after first authorization), and names the
    victim in the request body.
    """
    victim = UserFactory()
    victim_email = victim.id

    stub_apple({'sub': 'attacker-apple-sub', 'aud': BUNDLE_ID})

    resp = client.post('/api/v1/auth/apple', json={
        'identity_token': 'stub',
        'email': victim_email,
    })

    assert resp.status_code == 400
    assert 'access_token' not in (resp.get_json() or {})

    # The victim's account must be untouched — no Apple identity linked to it.
    from src.models.user import User
    assert User.query.filter_by(id=victim_email).first().oidc_id is None


def test_body_email_cannot_create_an_account(client, db, apple_enabled, stub_apple):
    """No email claim and no known sub — refuse rather than trust the body."""
    stub_apple({'sub': 'unknown-sub', 'aud': BUNDLE_ID})

    resp = client.post('/api/v1/auth/apple', json={
        'identity_token': 'stub',
        'email': 'invented@test.com',
    })

    assert resp.status_code == 400
    from src.models.user import User
    assert User.query.filter_by(id='invented@test.com').first() is None


# ---------------------------------------------------------------------------
# The paths that should still work
# ---------------------------------------------------------------------------

def test_verified_token_email_creates_user(client, db, apple_enabled, stub_apple):
    """First authorization: Apple sends a verified email, so we can create."""
    stub_apple({
        'sub': 'new-apple-sub',
        'email': 'newuser@privaterelay.appleid.com',
        'email_verified': 'true',
        'aud': BUNDLE_ID,
    })

    resp = client.post('/api/v1/auth/apple', json={
        'identity_token': 'stub',
        'full_name': 'New User',
    })

    assert resp.status_code == 200, resp.get_json()
    data = resp.get_json()
    assert 'access_token' in data
    assert data['user']['email'] == 'newuser@privaterelay.appleid.com'

    # Default categories must be seeded — the old `from app import
    # create_default_categories` raised ImportError here, leaving the account
    # created but empty and the request returning 500.
    from src.models.category import Category
    assert Category.query.filter_by(
        user_id='newuser@privaterelay.appleid.com'
    ).count() > 0


def test_returning_user_resolves_by_sub_without_email_claim(
    client, db, apple_enabled, stub_apple
):
    """Second sign-in: no email claim, but the sub is known — must still work.

    This is the case the old body-email fallback existed to paper over.
    """
    user = UserFactory()
    user.oidc_id = 'known-apple-sub'
    user.oidc_provider = 'apple'
    db.session.commit()
    user_email = user.id

    stub_apple({'sub': 'known-apple-sub', 'aud': BUNDLE_ID})

    resp = client.post('/api/v1/auth/apple', json={'identity_token': 'stub'})

    assert resp.status_code == 200, resp.get_json()
    assert resp.get_json()['user']['email'] == user_email


def test_unverified_token_email_is_rejected(client, db, apple_enabled, stub_apple):
    stub_apple({
        'sub': 'unverified-sub',
        'email': 'unverified@test.com',
        'email_verified': 'false',
        'aud': BUNDLE_ID,
    })

    resp = client.post('/api/v1/auth/apple', json={'identity_token': 'stub'})

    assert resp.status_code == 403


# ---------------------------------------------------------------------------
# Configuration guards
# ---------------------------------------------------------------------------

def test_disabled_by_default(client, db, monkeypatch):
    monkeypatch.delenv('APPLE_SIGNIN_ENABLED', raising=False)
    resp = client.post('/api/v1/auth/apple', json={'identity_token': 'stub'})
    assert resp.status_code == 403


def test_missing_bundle_id_is_rejected_before_decoding(
    client, db, monkeypatch, stub_apple
):
    """APPLE_CLIENT_ID unset must be rejected outright, never authenticate.

    Without a guard this reached pyjwt.decode with audience='', a config error
    masquerading as an auth failure — and an empty audience is one PyJWT change
    away from matching something.

    The status moved from 500 to 403 when /auth/apple began sharing
    integrations/oidc/native.py: `native_signin_enabled` treats a missing client
    ID as "not enabled", which is both true and more useful than a 500. The
    assertion below is on the property that matters — no token is ever issued —
    so it survives that kind of reshuffle instead of pinning an incidental code.
    """
    monkeypatch.setenv('APPLE_SIGNIN_ENABLED', 'true')
    monkeypatch.delenv('APPLE_CLIENT_ID', raising=False)
    stub_apple({'sub': 'whoever', 'email': 'x@test.com', 'email_verified': 'true'})

    resp = client.post('/api/v1/auth/apple', json={'identity_token': 'stub'})

    assert resp.status_code in (403, 500, 503), resp.status_code
    assert 'access_token' not in (resp.get_json() or {})
    from src.models.user import User
    assert User.query.filter_by(oidc_id='whoever').first() is None


def test_token_for_another_audience_is_rejected(client, db, stub_apple, monkeypatch):
    """A token minted for a different app must not authenticate here."""
    monkeypatch.setenv('APPLE_SIGNIN_ENABLED', 'true')
    monkeypatch.setenv('APPLE_CLIENT_ID', 'io.palstack.some-other-app')
    stub_apple({'sub': 'whoever', 'email': 'x@test.com', 'email_verified': 'true'})

    resp = client.post('/api/v1/auth/apple', json={'identity_token': 'stub'})

    assert resp.status_code == 401
    assert 'access_token' not in (resp.get_json() or {})


def test_identity_token_is_required(client, db, apple_enabled):
    resp = client.post('/api/v1/auth/apple', json={})
    assert resp.status_code == 400
