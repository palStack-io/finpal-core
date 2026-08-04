"""Personal access tokens for non-interactive API clients.

Long-lived, scoped, revocable credentials for scripts and MCP servers. JWTs are
unsuitable: a 24-hour access token cannot be pasted into a config file once, and
a background process cannot perform the refresh dance.
"""
import hashlib
import secrets
from datetime import datetime, timedelta

from src.extensions import db

TOKEN_PREFIX = 'fp_live_'
PREFIX_DISPLAY_CHARS = 4          # how much of the random part to show in the UI
SCOPE_READ = 'read'
SCOPE_READ_WRITE = 'read_write'
VALID_SCOPES = (SCOPE_READ, SCOPE_READ_WRITE)
DEFAULT_LIFETIME_DAYS = 90
MAX_LIFETIME_DAYS = 365


def hash_token(plaintext):
    """sha256 of the token.

    Deliberately a fast hash, not bcrypt. These are ~192 bits of `secrets`
    randomness, not user-chosen passwords, so there is no dictionary or
    brute-force surface for a slow hash to defend against — and a slow hash on
    every API request would be a self-inflicted denial of service. This is the
    standard treatment for API tokens; it only looks wrong if you pattern-match
    on password storage.
    """
    return hashlib.sha256(plaintext.encode('utf-8')).hexdigest()


class PersonalAccessToken(db.Model):
    __tablename__ = 'personal_access_tokens'

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.String(120), db.ForeignKey('users.id'), nullable=False,
                        index=True)
    name = db.Column(db.String(120), nullable=False)
    # Shown in the UI so a token is identifiable without revealing it.
    token_prefix = db.Column(db.String(20), nullable=False)
    # See hash_token() for why sha256 is correct here.
    token_hash = db.Column(db.String(64), nullable=False, unique=True, index=True)
    scopes = db.Column(db.String(40), nullable=False, default=SCOPE_READ)
    # Mandatory: a forgotten token with unlimited life is the most common way a
    # credential like this becomes a permanent hole.
    expires_at = db.Column(db.DateTime, nullable=False)
    last_used_at = db.Column(db.DateTime, nullable=True)
    created_at = db.Column(db.DateTime, nullable=False, default=datetime.utcnow)
    revoked_at = db.Column(db.DateTime, nullable=True)

    @classmethod
    def generate(cls, user_id, name, scopes, expires_at):
        """Create a token, returning (row, plaintext). Plaintext is shown once."""
        if scopes not in VALID_SCOPES:
            raise ValueError(
                'unknown scope %r; expected one of %s' % (scopes, VALID_SCOPES))
        if not expires_at:
            raise ValueError('expires_at is required')
        max_allowed = datetime.utcnow() + timedelta(days=MAX_LIFETIME_DAYS)
        if expires_at > max_allowed:
            raise ValueError(
                'token lifetime cannot exceed %d days' % MAX_LIFETIME_DAYS)

        random_part = secrets.token_urlsafe(32)
        plaintext = TOKEN_PREFIX + random_part
        token = cls(
            user_id=user_id,
            name=name,
            token_prefix=TOKEN_PREFIX + random_part[:PREFIX_DISPLAY_CHARS],
            token_hash=hash_token(plaintext),
            scopes=scopes,
            expires_at=expires_at,
        )
        db.session.add(token)
        return token, plaintext

    @classmethod
    def find_by_plaintext(cls, plaintext):
        """Look a token up by its presented value, or None."""
        if not plaintext or not plaintext.startswith(TOKEN_PREFIX):
            return None
        return cls.query.filter_by(token_hash=hash_token(plaintext)).first()

    @property
    def is_expired(self):
        return self.expires_at is not None and self.expires_at <= datetime.utcnow()

    @property
    def is_revoked(self):
        return self.revoked_at is not None

    @property
    def is_usable(self):
        return not self.is_expired and not self.is_revoked

    def has_scope(self, required):
        """read_write implies read; otherwise an agent needs two tokens."""
        if self.scopes == SCOPE_READ_WRITE:
            return required in VALID_SCOPES
        return self.scopes == required
