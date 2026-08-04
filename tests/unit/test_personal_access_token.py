"""Personal access tokens: hashing, scopes, expiry, revocation."""
from datetime import datetime, timedelta

import pytest

from src.extensions import db
from src.models.personal_access_token import (
    DEFAULT_LIFETIME_DAYS,
    MAX_LIFETIME_DAYS,
    SCOPE_READ,
    SCOPE_READ_WRITE,
    TOKEN_PREFIX,
    PersonalAccessToken,
)
from tests.factories import UserFactory


def _expiry(days=30):
    return datetime.utcnow() + timedelta(days=days)


def test_generate_returns_plaintext_once_and_stores_only_a_hash(db):
    user = UserFactory()
    token, plaintext = PersonalAccessToken.generate(
        user_id=user.id, name='Claude Desktop', scopes=SCOPE_READ,
        expires_at=_expiry())
    db.session.commit()

    assert plaintext.startswith(TOKEN_PREFIX)
    assert len(plaintext) > len(TOKEN_PREFIX) + 20
    # The plaintext must not be recoverable from the row.
    assert plaintext not in (token.token_hash or '')
    assert token.token_hash != plaintext
    assert len(token.token_hash) == 64  # sha256 hex
    assert plaintext.startswith(token.token_prefix)


def test_find_by_plaintext_matches_the_generated_token(db):
    user = UserFactory()
    token, plaintext = PersonalAccessToken.generate(
        user_id=user.id, name='n', scopes=SCOPE_READ, expires_at=_expiry())
    db.session.commit()

    assert PersonalAccessToken.find_by_plaintext(plaintext).id == token.id
    assert PersonalAccessToken.find_by_plaintext(TOKEN_PREFIX + 'nonsense') is None
    assert PersonalAccessToken.find_by_plaintext('') is None
    assert PersonalAccessToken.find_by_plaintext(None) is None


def test_expiry_is_mandatory_and_capped(db):
    user = UserFactory()
    with pytest.raises(ValueError, match='expires_at is required'):
        PersonalAccessToken.generate(
            user_id=user.id, name='n', scopes=SCOPE_READ, expires_at=None)

    with pytest.raises(ValueError, match='cannot exceed'):
        PersonalAccessToken.generate(
            user_id=user.id, name='n', scopes=SCOPE_READ,
            expires_at=_expiry(MAX_LIFETIME_DAYS + 1))


def test_usability_reflects_expiry_and_revocation(db):
    user = UserFactory()
    live, _ = PersonalAccessToken.generate(
        user_id=user.id, name='live', scopes=SCOPE_READ, expires_at=_expiry())
    expired, _ = PersonalAccessToken.generate(
        user_id=user.id, name='expired', scopes=SCOPE_READ, expires_at=_expiry())
    expired.expires_at = datetime.utcnow() - timedelta(seconds=1)
    revoked, _ = PersonalAccessToken.generate(
        user_id=user.id, name='revoked', scopes=SCOPE_READ, expires_at=_expiry())
    revoked.revoked_at = datetime.utcnow()
    db.session.commit()

    assert live.is_usable is True
    assert expired.is_expired is True and expired.is_usable is False
    assert revoked.is_revoked is True and revoked.is_usable is False


def test_scope_check_is_not_merely_string_equality(db):
    user = UserFactory()
    read, _ = PersonalAccessToken.generate(
        user_id=user.id, name='r', scopes=SCOPE_READ, expires_at=_expiry())
    write, _ = PersonalAccessToken.generate(
        user_id=user.id, name='w', scopes=SCOPE_READ_WRITE, expires_at=_expiry())
    db.session.commit()

    assert read.has_scope(SCOPE_READ) is True
    assert read.has_scope(SCOPE_READ_WRITE) is False
    # read_write implies read — otherwise every write token needs two tokens.
    assert write.has_scope(SCOPE_READ) is True
    assert write.has_scope(SCOPE_READ_WRITE) is True


def test_invalid_scope_is_rejected(db):
    user = UserFactory()
    with pytest.raises(ValueError, match='unknown scope'):
        PersonalAccessToken.generate(
            user_id=user.id, name='n', scopes='admin', expires_at=_expiry())


def test_default_lifetime_is_ninety_days():
    assert DEFAULT_LIFETIME_DAYS == 90
    assert MAX_LIFETIME_DAYS == 365
