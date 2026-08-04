"""Native provider ID token verification.

The security properties here are the point: a token that is expired, meant for a
different app, signed by an unknown key, or minted by an unexpected issuer must
be refused. pantryPal's version — which this was ported from — verifies audience
but NOT issuer, so any provider whose audience happened to match would be
accepted.
"""
import time

import jwt as pyjwt
import pytest
from cryptography.hazmat.primitives.asymmetric import rsa

from integrations.oidc import native


@pytest.fixture(autouse=True)
def _clean(monkeypatch):
    native.clear_jwks_cache()
    monkeypatch.setenv('GOOGLE_CLIENT_ID', 'test-google-client.apps.googleusercontent.com')
    monkeypatch.setenv('APPLE_CLIENT_ID', 'io.palstack.finpal')
    monkeypatch.setenv('APPLE_SIGNIN_ENABLED', 'true')
    yield
    native.clear_jwks_cache()


def _key():
    return rsa.generate_private_key(public_exponent=65537, key_size=2048)


def _jwk(private_key, kid='k1'):
    from jwt.algorithms import RSAAlgorithm
    import json
    pub = json.loads(RSAAlgorithm.to_jwk(private_key.public_key()))
    pub['kid'] = kid
    pub['alg'] = 'RS256'
    pub['use'] = 'sig'
    return pub


def _token(private_key, kid='k1', **overrides):
    claims = {
        'sub': 'provider-subject-123',
        'aud': 'test-google-client.apps.googleusercontent.com',
        'iss': 'https://accounts.google.com',
        'email': 'user@example.com',
        'email_verified': True,
        'exp': int(time.time()) + 600,
        'iat': int(time.time()),
    }
    claims.update(overrides)
    return pyjwt.encode(claims, private_key, algorithm='RS256',
                        headers={'kid': kid})


def _stub_jwks(monkeypatch, jwks_keys, counter=None):
    """Stand in for the two network calls _fetch_jwks makes."""
    class _Resp:
        def __init__(self, payload):
            self._payload = payload

        def raise_for_status(self):
            pass

        def json(self):
            return self._payload

    def _get(url, **kwargs):
        if counter is not None:
            counter.append(url)
        if 'well-known' in url:
            return _Resp({'jwks_uri': 'https://provider.test/jwks'})
        return _Resp({'keys': jwks_keys})

    monkeypatch.setattr(native.requests, 'get', _get)


# --- the happy path -------------------------------------------------------

def test_a_valid_google_token_is_accepted(monkeypatch):
    key = _key()
    _stub_jwks(monkeypatch, [_jwk(key)])
    claims = native.verify_id_token(native.GOOGLE, _token(key))
    assert claims['sub'] == 'provider-subject-123'
    assert claims['email'] == 'user@example.com'


def test_an_apple_token_is_accepted_with_its_own_audience(monkeypatch):
    key = _key()
    _stub_jwks(monkeypatch, [_jwk(key)])
    token = _token(key, aud='io.palstack.finpal',
                   iss='https://appleid.apple.com')
    claims = native.verify_id_token(native.APPLE, token)
    assert claims['sub'] == 'provider-subject-123'


def test_googles_bare_issuer_spelling_is_accepted(monkeypatch):
    """Google mints under both 'accounts.google.com' and the https form."""
    key = _key()
    _stub_jwks(monkeypatch, [_jwk(key)])
    claims = native.verify_id_token(
        native.GOOGLE, _token(key, iss='accounts.google.com'))
    assert claims['sub'] == 'provider-subject-123'


# --- refusals -------------------------------------------------------------

def test_a_token_for_another_app_is_refused(monkeypatch):
    key = _key()
    _stub_jwks(monkeypatch, [_jwk(key)])
    with pytest.raises(native.OidcVerificationError, match='different app'):
        native.verify_id_token(native.GOOGLE, _token(key, aud='some-other-app'))


def test_a_token_from_an_unexpected_issuer_is_refused(monkeypatch):
    """pantryPal's version does not check this at all."""
    key = _key()
    _stub_jwks(monkeypatch, [_jwk(key)])
    with pytest.raises(native.OidcVerificationError, match='issuer'):
        native.verify_id_token(
            native.GOOGLE, _token(key, iss='https://evil.example.com'))


def test_an_expired_token_is_refused(monkeypatch):
    key = _key()
    _stub_jwks(monkeypatch, [_jwk(key)])
    stale = _token(key, exp=int(time.time()) - 60, iat=int(time.time()) - 600)
    with pytest.raises(native.OidcVerificationError, match='expired'):
        native.verify_id_token(native.GOOGLE, stale)


def test_a_token_signed_by_the_wrong_key_is_refused(monkeypatch):
    """The provider's real key is published; the token is signed by another."""
    provider_key = _key()
    attacker_key = _key()
    _stub_jwks(monkeypatch, [_jwk(provider_key)])
    with pytest.raises(native.OidcVerificationError):
        native.verify_id_token(native.GOOGLE, _token(attacker_key))


def test_an_unsigned_token_is_refused(monkeypatch):
    """alg=none must never be honoured — the algorithm is pinned."""
    key = _key()
    _stub_jwks(monkeypatch, [_jwk(key)])
    unsigned = pyjwt.encode(
        {'sub': 'x', 'aud': 'test-google-client.apps.googleusercontent.com',
         'iss': 'https://accounts.google.com'},
        key=None, algorithm='none')
    with pytest.raises(native.OidcVerificationError):
        native.verify_id_token(native.GOOGLE, unsigned)


def test_a_malformed_token_is_refused(monkeypatch):
    _stub_jwks(monkeypatch, [])
    with pytest.raises(native.OidcVerificationError, match='Malformed'):
        native.verify_id_token(native.GOOGLE, 'not-a-jwt')


def test_an_empty_token_is_refused():
    with pytest.raises(native.OidcVerificationError):
        native.verify_id_token(native.GOOGLE, '')


# --- configuration --------------------------------------------------------

def test_an_unconfigured_provider_raises_a_config_error(monkeypatch):
    """Distinct from a verification failure: this is the operator's problem, not
    the caller's, and the two must not both become 401."""
    monkeypatch.delenv('GOOGLE_CLIENT_ID', raising=False)
    with pytest.raises(native.OidcConfigError, match='not configured'):
        native.verify_id_token(native.GOOGLE, 'anything')


def test_an_unknown_provider_raises_a_config_error():
    with pytest.raises(native.OidcConfigError, match='Unknown'):
        native.verify_id_token('facebook', 'anything')


def test_client_ids_are_read_from_the_environment(monkeypatch):
    """pantryPal hardcodes its bundle ID, which breaks for the second app."""
    monkeypatch.setenv('APPLE_CLIENT_ID', 'io.example.other')
    assert native.apple_client_id() == 'io.example.other'
    assert 'finpal' not in native.apple_client_id()


def test_public_config_exposes_what_a_login_screen_needs(monkeypatch):
    cfg = native.public_config()
    assert cfg['google_client_id'] == 'test-google-client.apps.googleusercontent.com'
    assert cfg['google_signin_enabled'] is True
    assert cfg['apple_signin_enabled'] is True


def test_public_config_reports_disabled_when_unconfigured(monkeypatch):
    monkeypatch.delenv('GOOGLE_CLIENT_ID', raising=False)
    monkeypatch.setenv('APPLE_SIGNIN_ENABLED', 'false')
    cfg = native.public_config()
    assert cfg['google_client_id'] == ''
    assert cfg['google_signin_enabled'] is False
    assert cfg['apple_signin_enabled'] is False


def test_apple_needs_both_the_flag_and_a_client_id(monkeypatch):
    monkeypatch.setenv('APPLE_SIGNIN_ENABLED', 'true')
    monkeypatch.delenv('APPLE_CLIENT_ID', raising=False)
    assert native.native_signin_enabled(native.APPLE) is False


# --- caching, which is the performance half of the roadmap item ------------

def test_jwks_is_fetched_once_and_then_cached(monkeypatch):
    key = _key()
    calls = []
    _stub_jwks(monkeypatch, [_jwk(key)], counter=calls)

    for _ in range(3):
        native.verify_id_token(native.GOOGLE, _token(key))

    # Two calls for the first verification (discovery + jwks), none after.
    assert len(calls) == 2, (
        'expected the keys to be cached; saw %d requests' % len(calls))


def test_an_expired_cache_entry_is_refetched(monkeypatch):
    key = _key()
    calls = []
    _stub_jwks(monkeypatch, [_jwk(key)], counter=calls)
    native.verify_id_token(native.GOOGLE, _token(key))
    assert len(calls) == 2

    # Age the entry past its TTL.
    keys, _expiry = native._jwks_cache[native.GOOGLE_DISCOVERY_URL]
    native._jwks_cache[native.GOOGLE_DISCOVERY_URL] = (keys, time.time() - 1)

    native.verify_id_token(native.GOOGLE, _token(key))
    assert len(calls) == 4


def test_an_unknown_kid_forces_one_refetch_then_gives_up(monkeypatch):
    """Providers rotate keys. Without a forced refetch a rotation would lock
    every user out until the TTL expired."""
    key = _key()
    calls = []
    _stub_jwks(monkeypatch, [_jwk(key, kid='old-key')], counter=calls)

    with pytest.raises(native.OidcVerificationError, match='known key'):
        native.verify_id_token(native.GOOGLE, _token(key, kid='rotated-key'))

    # Discovery+jwks twice: the cached attempt, then the forced refetch.
    assert len(calls) == 4


def test_a_rotated_key_succeeds_after_the_forced_refetch(monkeypatch):
    key = _key()
    state = {'rotated': False}

    class _Resp:
        def __init__(self, payload):
            self._payload = payload

        def raise_for_status(self):
            pass

        def json(self):
            return self._payload

    def _get(url, **kwargs):
        if 'well-known' in url:
            return _Resp({'jwks_uri': 'https://provider.test/jwks'})
        if not state['rotated']:
            state['rotated'] = True
            return _Resp({'keys': [_jwk(key, kid='stale')]})
        return _Resp({'keys': [_jwk(key, kid='current')]})

    monkeypatch.setattr(native.requests, 'get', _get)
    claims = native.verify_id_token(native.GOOGLE, _token(key, kid='current'))
    assert claims['sub'] == 'provider-subject-123'


def test_a_provider_outage_is_reported_as_such(monkeypatch):
    """Distinguishable from a bad token, so an operator knows where to look."""
    key = _key()

    def _boom(url, **kwargs):
        raise OSError('connection refused')

    monkeypatch.setattr(native.requests, 'get', _boom)
    # A well-formed token, so the failure is provably the fetch and not parsing.
    with pytest.raises(native.OidcVerificationError, match='Could not reach'):
        native.verify_id_token(native.GOOGLE, _token(key))
