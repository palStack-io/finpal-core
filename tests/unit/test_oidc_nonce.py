"""Unit tests for OIDC ID-token nonce verification.

The nonce was generated and sent in the auth request but never stored or
compared, so it provided none of the replay protection its comment claimed.
These cover the comparison itself, which is a pure function and so testable
without a live provider.
"""
import jwt as pyjwt
import pytest

from integrations.oidc.auth import NonceMismatchError, verify_id_token_nonce


def _token(claims):
    """An unsigned-path token: HS256, verified only when a jwks_uri is given."""
    return pyjwt.encode(claims, 'irrelevant-for-the-unsigned-path', algorithm='HS256')


def test_matching_nonce_passes():
    token = _token({'sub': 'u1', 'nonce': 'abc123'})
    assert verify_id_token_nonce(token, 'abc123') is True


def test_mismatched_nonce_is_rejected():
    token = _token({'sub': 'u1', 'nonce': 'attacker-value'})
    with pytest.raises(NonceMismatchError, match='did not match'):
        verify_id_token_nonce(token, 'abc123')


def test_token_without_a_nonce_claim_is_rejected():
    """A replayed token from another flow typically has no nonce at all."""
    token = _token({'sub': 'u1'})
    with pytest.raises(NonceMismatchError, match='no nonce claim'):
        verify_id_token_nonce(token, 'abc123')


def test_missing_stored_nonce_is_rejected():
    """Session lost the nonce — fail closed rather than skipping the check."""
    token = _token({'sub': 'u1', 'nonce': 'abc123'})
    with pytest.raises(NonceMismatchError, match='No nonce was stored'):
        verify_id_token_nonce(token, None)


def test_absent_id_token_is_rejected():
    with pytest.raises(NonceMismatchError, match='no ID token'):
        verify_id_token_nonce(None, 'abc123')


def test_unparseable_token_is_rejected():
    with pytest.raises(NonceMismatchError, match='could not be validated'):
        verify_id_token_nonce('not-a-jwt', 'abc123')


def test_never_returns_false_so_callers_cannot_ignore_it():
    """Every failure path raises. A falsy return would be easy to drop."""
    for args in (('not-a-jwt', 'abc'), (_token({'sub': 'u'}), 'abc'), (None, 'abc')):
        with pytest.raises(NonceMismatchError):
            verify_id_token_nonce(*args)


def test_unreachable_jwks_is_rejected_rather_than_skipped():
    """If we were told to verify signatures, failing to do so must not pass."""
    token = _token({'sub': 'u1', 'nonce': 'abc123'})
    with pytest.raises(NonceMismatchError, match='could not be validated'):
        verify_id_token_nonce(
            token, 'abc123', jwks_uri='https://example.invalid/jwks.json')


def _rsa_key():
    from cryptography.hazmat.primitives.asymmetric import rsa
    return rsa.generate_private_key(public_exponent=65537, key_size=2048)


def test_a_correctly_signed_token_with_the_right_nonce_passes(monkeypatch):
    key = _rsa_key()
    token = pyjwt.encode({'sub': 'u1', 'nonce': 'abc123'}, key, algorithm='RS256')

    class _Client:
        def __init__(self, uri):
            pass

        def get_signing_key_from_jwt(self, _token):
            return type('K', (), {'key': key.public_key()})()

    monkeypatch.setattr(pyjwt, 'PyJWKClient', _Client)
    assert verify_id_token_nonce(
        token, 'abc123', jwks_uri='https://provider.example/jwks.json') is True


def test_a_token_signed_by_the_wrong_key_is_rejected(monkeypatch):
    """The real signature assertion: right nonce, wrong signer, must still fail."""
    attacker_key = _rsa_key()
    provider_key = _rsa_key()
    forged = pyjwt.encode({'sub': 'u1', 'nonce': 'abc123'}, attacker_key, algorithm='RS256')

    class _Client:
        def __init__(self, uri):
            pass

        def get_signing_key_from_jwt(self, _token):
            return type('K', (), {'key': provider_key.public_key()})()

    monkeypatch.setattr(pyjwt, 'PyJWKClient', _Client)
    with pytest.raises(NonceMismatchError, match='could not be validated'):
        verify_id_token_nonce(
            forged, 'abc123', jwks_uri='https://provider.example/jwks.json')
