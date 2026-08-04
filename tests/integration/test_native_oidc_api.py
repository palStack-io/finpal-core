"""POST /api/v1/auth/oidc — the unified native sign-in endpoint.

Contract matches pantryPal's (`{provider, id_token|access_token, full_name?}`)
so mobile code is portable across the pals.

The identity rules here are the ones that matter: the user PK *is* the email
address, so a caller who could name an address in the request body could be
handed that account. Identity comes from the verified token only.
"""
import pytest

from integrations.oidc import native
from src.extensions import db
from src.models.user import User
from tests.factories import UserFactory

URL = '/api/v1/auth/oidc'
GOOGLE_CLIENT = 'test-google.apps.googleusercontent.com'


@pytest.fixture(autouse=True)
def _limiter_off():
    """The endpoint is rate limited; conftest disables the limiter globally but
    make it explicit here so a future change to that default is visible."""
    from src.extensions import limiter
    was = limiter.enabled
    limiter.enabled = False
    yield
    limiter.enabled = was


@pytest.fixture
def google_enabled(monkeypatch):
    monkeypatch.setenv('GOOGLE_CLIENT_ID', GOOGLE_CLIENT)
    native.clear_jwks_cache()
    yield
    native.clear_jwks_cache()


@pytest.fixture
def stub_verify(monkeypatch):
    """Install the claims a provider token should verify to."""
    def _set(claims, provider_check=None):
        def _verify(provider, id_token):
            if provider_check:
                provider_check(provider)
            return claims
        monkeypatch.setattr(native, 'verify_id_token', _verify)
    return _set


def test_a_verified_google_token_creates_a_user(client, db, google_enabled, stub_verify):
    stub_verify({'sub': 'google-sub-1', 'email': 'new@example.com',
                 'email_verified': True, 'name': 'New Person'})

    resp = client.post(URL, json={'provider': 'google', 'id_token': 'stub'})

    assert resp.status_code == 200, resp.get_json()
    body = resp.get_json()
    assert body['access_token']
    assert body['refresh_token']
    assert body['user']['email'] == 'new@example.com'

    user = User.query.filter_by(id='new@example.com').first()
    assert user is not None
    assert user.oidc_id == 'google-sub-1'
    assert user.oidc_provider == 'google'


def test_a_returning_user_resolves_by_sub_without_an_email_claim(
        client, db, google_enabled, stub_verify):
    """Providers stop sending email after the first authorization. Resolving by
    sub is what makes that survivable."""
    existing = UserFactory(id='returning@example.com')
    existing.oidc_id = 'google-sub-2'
    existing.oidc_provider = 'google'
    db.session.commit()

    stub_verify({'sub': 'google-sub-2'})
    resp = client.post(URL, json={'provider': 'google', 'id_token': 'stub'})

    assert resp.status_code == 200, resp.get_json()
    assert resp.get_json()['user']['email'] == 'returning@example.com'


def test_a_body_email_cannot_claim_someone_elses_account(
        client, db, google_enabled, stub_verify):
    """The account takeover this design exists to prevent. The token carries no
    email; the body names a real user's address."""
    victim = UserFactory(id='victim@example.com')
    db.session.commit()

    stub_verify({'sub': 'attacker-sub'})
    resp = client.post(URL, json={
        'provider': 'google', 'id_token': 'stub',
        'email': 'victim@example.com'})

    assert resp.status_code == 400, resp.get_json()
    assert 'access_token' not in (resp.get_json() or {})
    db.session.refresh(victim)
    assert victim.oidc_id is None, 'the victim account was linked to an attacker'


def test_an_unverified_provider_email_is_refused(
        client, db, google_enabled, stub_verify):
    stub_verify({'sub': 'unverified-sub', 'email': 'x@example.com',
                 'email_verified': False})

    resp = client.post(URL, json={'provider': 'google', 'id_token': 'stub'})

    assert resp.status_code == 403
    assert User.query.filter_by(id='x@example.com').first() is None


def test_full_name_is_display_only_and_never_selects_the_account(
        client, db, google_enabled, stub_verify):
    stub_verify({'sub': 'named-sub', 'email': 'named@example.com',
                 'email_verified': True})

    resp = client.post(URL, json={
        'provider': 'google', 'id_token': 'stub', 'full_name': 'Relayed Name'})

    assert resp.status_code == 200
    user = User.query.filter_by(id='named@example.com').first()
    assert user.name == 'Relayed Name'


def test_provider_is_required(client, db, google_enabled):
    resp = client.post(URL, json={'id_token': 'stub'})
    assert resp.status_code == 400
    assert 'provider' in resp.get_json()['error'].lower()


def test_a_token_is_required(client, db, google_enabled):
    resp = client.post(URL, json={'provider': 'google'})
    assert resp.status_code == 400


def test_an_unconfigured_provider_is_refused(client, db, monkeypatch):
    monkeypatch.delenv('GOOGLE_CLIENT_ID', raising=False)
    resp = client.post(URL, json={'provider': 'google', 'id_token': 'stub'})
    assert resp.status_code == 403
    assert 'not enabled' in resp.get_json()['error'].lower()


def test_an_unknown_provider_is_refused(client, db, google_enabled):
    resp = client.post(URL, json={'provider': 'facebook', 'id_token': 'stub'})
    assert resp.status_code == 403


def test_a_rejected_token_is_a_401_not_a_500(client, db, google_enabled, monkeypatch):
    def _boom(provider, id_token):
        raise native.OidcVerificationError('This sign-in token has expired')
    monkeypatch.setattr(native, 'verify_id_token', _boom)

    resp = client.post(URL, json={'provider': 'google', 'id_token': 'stub'})

    assert resp.status_code == 401
    assert 'expired' in resp.get_json()['error']


def test_a_server_misconfiguration_is_503_not_401(client, db, google_enabled, monkeypatch):
    """A config error is the operator's problem. Reporting it as 401 sends the
    user hunting for a bad token that does not exist."""
    def _boom(provider, id_token):
        raise native.OidcConfigError('Google sign-in is not configured')
    monkeypatch.setattr(native, 'verify_id_token', _boom)

    resp = client.post(URL, json={'provider': 'google', 'id_token': 'stub'})
    assert resp.status_code == 503


def test_an_access_token_uses_the_userinfo_path(client, db, google_enabled, monkeypatch):
    """Google's native SDKs often return an access_token rather than an id_token."""
    called = []

    def _userinfo(provider, access_token):
        called.append((provider, access_token))
        return {'sub': 'userinfo-sub', 'email': 'ui@example.com',
                'email_verified': True}

    monkeypatch.setattr(native, 'fetch_userinfo', _userinfo)

    resp = client.post(URL, json={'provider': 'google', 'access_token': 'at-123'})

    assert resp.status_code == 200, resp.get_json()
    assert called == [('google', 'at-123')]
    assert User.query.filter_by(id='ui@example.com').first() is not None


def test_the_auth_config_advertises_native_providers(client, db, google_enabled):
    """A login screen needs the client ID to render a Google button at all."""
    resp = client.get('/api/v1/auth/config')
    assert resp.status_code == 200
    body = resp.get_json()
    assert body['google_client_id'] == GOOGLE_CLIENT
    assert body['google_signin_enabled'] is True
    # The pre-existing keys must survive: mobile builds already read them.
    assert 'oidc_enabled' in body
    assert 'apple_signin_enabled' in body
