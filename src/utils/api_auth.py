"""Authenticate a request by personal access token, falling back to JWT.

A token-authenticated request is made to look exactly like a session request to
everything downstream, so the ~70 existing `get_jwt_identity()` call sites need
no changes. The alternative — introducing a new identity helper and editing every
site — fails silently if one is missed, attributing data to the wrong user.
"""
import logging
from datetime import datetime, timedelta
from functools import wraps

from flask import g, jsonify, request
from flask_jwt_extended import create_access_token, decode_token, verify_jwt_in_request

from src.extensions import db
from src.models.personal_access_token import (
    SCOPE_READ,
    TOKEN_PREFIX,
    PersonalAccessToken,
)

logger = logging.getLogger(__name__)

LAST_USED_THROTTLE_SECONDS = 300


def current_pat():
    """The PersonalAccessToken behind this request, or None for a human."""
    return getattr(g, 'pat', None)


def _presented_token():
    """The token value from X-API-Key or a Bearer header, if it looks like ours."""
    header = request.headers.get('X-API-Key', '').strip()
    if header.startswith(TOKEN_PREFIX):
        return header
    auth = request.headers.get('Authorization', '').strip()
    if auth.startswith('Bearer '):
        candidate = auth[len('Bearer '):].strip()
        if candidate.startswith(TOKEN_PREFIX):
            return candidate
    return None


def _install_identity(user_id, token):
    """Make flask-jwt-extended believe a valid access token was presented.

    Uses the same request-context attributes verify_jwt_in_request() sets. This
    is library internals by necessity; test_get_jwt_identity_works_under_token_auth
    fails loudly if a version bump moves them.

    The `loaded_user` key is the one flask_jwt_extended.utils.get_current_user()
    reads (4.6.0). Nothing registers a `user_lookup_loader` here so nothing reads
    it today, but spelling it correctly means `current_user` returns None rather
    than raising KeyError the day someone does.
    """
    minted = create_access_token(
        identity=user_id,
        additional_claims={'pat_id': token.id, 'scopes': token.scopes},
    )
    decoded = decode_token(minted)
    g._jwt_extended_jwt = decoded
    g._jwt_extended_jwt_header = {}
    g._jwt_extended_jwt_user = {'loaded_user': None}
    g._jwt_extended_jwt_location = 'headers'


def _touch(token):
    """Record use, at most once per LAST_USED_THROTTLE_SECONDS."""
    now = datetime.utcnow()
    if (token.last_used_at is not None
            and now - token.last_used_at < timedelta(
                seconds=LAST_USED_THROTTLE_SECONDS)):
        return
    try:
        token.last_used_at = now
        db.session.commit()
    except Exception:
        db.session.rollback()
        logger.exception('Failed to record token last_used_at')


def api_auth_required(scope=SCOPE_READ):
    """Accept a personal access token, or fall through to a JWT session."""
    def decorator(fn):
        @wraps(fn)
        def wrapper(*args, **kwargs):
            presented = _presented_token()
            if presented is None:
                # No token offered: this is a human session (or an error, which
                # flask-jwt-extended reports in its own vocabulary).
                verify_jwt_in_request()
                g.pat = None
                return fn(*args, **kwargs)

            token = PersonalAccessToken.find_by_plaintext(presented)
            if token is None:
                return jsonify({'error': 'invalid_token'}), 401
            if token.is_revoked:
                return jsonify({'error': 'token_revoked'}), 401
            if token.is_expired:
                return jsonify({'error': 'token_expired'}), 401
            if not token.has_scope(scope):
                return jsonify({'error': 'insufficient_scope'}), 403

            _install_identity(token.user_id, token)
            g.pat = token
            _touch(token)
            return fn(*args, **kwargs)
        return wrapper
    return decorator
