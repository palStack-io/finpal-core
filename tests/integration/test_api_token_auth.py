"""Token auth must be indistinguishable from a session to existing handlers."""
from datetime import datetime, timedelta

from src.extensions import db
from src.models.personal_access_token import (
    SCOPE_READ,
    SCOPE_READ_WRITE,
    PersonalAccessToken,
)
from tests.factories import UserFactory


def _token(user, scopes=SCOPE_READ, days=30):
    token, plaintext = PersonalAccessToken.generate(
        user_id=user.id, name='test', scopes=scopes,
        expires_at=datetime.utcnow() + timedelta(days=days))
    db.session.commit()
    return token, plaintext


def _probe_route(app):
    """Register a throwaway route that reports who the caller is.

    Idempotent: the `app` fixture is session-scoped, so the second test to call
    this would otherwise raise "the name 'probe_auth' is already registered".
    """
    if 'probe_auth' in app.blueprints:
        return

    from flask import Blueprint, jsonify
    from flask_jwt_extended import get_jwt_identity

    from src.utils.api_auth import api_auth_required, current_pat

    bp = Blueprint('probe_auth', __name__)

    @bp.route('/__probe/whoami')
    @api_auth_required(scope=SCOPE_READ)
    def whoami():
        pat = current_pat()
        return jsonify({'identity': get_jwt_identity(),
                        'via_token': pat is not None,
                        'scopes': pat.scopes if pat else None})

    @bp.route('/__probe/needs-write', methods=['POST'])
    @api_auth_required(scope=SCOPE_READ_WRITE)
    def needs_write():
        return jsonify({'ok': True})

    app.register_blueprint(bp)


def test_get_jwt_identity_works_under_token_auth(client, db, app):
    """The shim's whole purpose: ~70 existing call sites keep working."""
    _probe_route(app)
    user = UserFactory()
    _, plaintext = _token(user)

    resp = client.get('/__probe/whoami',
                      headers={'X-API-Key': plaintext})
    assert resp.status_code == 200
    body = resp.get_json()
    assert body['identity'] == user.id
    assert body['via_token'] is True
    assert body['scopes'] == SCOPE_READ


def test_bearer_header_also_accepted(client, db, app):
    _probe_route(app)
    user = UserFactory()
    _, plaintext = _token(user)

    resp = client.get('/__probe/whoami',
                      headers={'Authorization': 'Bearer ' + plaintext})
    assert resp.status_code == 200
    assert resp.get_json()['identity'] == user.id


def test_a_jwt_session_still_works_on_the_same_route(client, db, app, auth_headers):
    """Humans must be unaffected; current_pat() is None for them."""
    _probe_route(app)
    user = UserFactory()

    resp = client.get('/__probe/whoami', headers=auth_headers(user))
    assert resp.status_code == 200
    body = resp.get_json()
    assert body['identity'] == user.id
    assert body['via_token'] is False


def test_each_rejection_has_its_own_code(client, db, app):
    """An agent that cannot tell 'expired' from 'wrong token' cannot tell its
    operator what to fix."""
    _probe_route(app)
    user = UserFactory()

    unknown = client.get('/__probe/whoami',
                         headers={'X-API-Key': 'fp_live_totallymadeup'})
    assert unknown.status_code == 401
    assert unknown.get_json()['error'] == 'invalid_token'

    revoked_tok, revoked_pt = _token(user)
    revoked_tok.revoked_at = datetime.utcnow()
    db.session.commit()
    revoked = client.get('/__probe/whoami', headers={'X-API-Key': revoked_pt})
    assert revoked.status_code == 401
    assert revoked.get_json()['error'] == 'token_revoked'

    expired_tok, expired_pt = _token(user)
    expired_tok.expires_at = datetime.utcnow() - timedelta(seconds=1)
    db.session.commit()
    expired = client.get('/__probe/whoami', headers={'X-API-Key': expired_pt})
    assert expired.status_code == 401
    assert expired.get_json()['error'] == 'token_expired'


def test_read_scope_cannot_reach_a_write_scoped_route(client, db, app):
    _probe_route(app)
    user = UserFactory()
    _, read_pt = _token(user, scopes=SCOPE_READ)

    resp = client.post('/__probe/needs-write', headers={'X-API-Key': read_pt})
    assert resp.status_code == 403
    assert resp.get_json()['error'] == 'insufficient_scope'


def test_read_write_scope_reaches_a_write_scoped_route(client, db, app):
    _probe_route(app)
    user = UserFactory()
    _, write_pt = _token(user, scopes=SCOPE_READ_WRITE)

    resp = client.post('/__probe/needs-write', headers={'X-API-Key': write_pt})
    assert resp.status_code == 200


def test_last_used_at_is_throttled(client, db, app):
    """A read-only workload must not cause a write on every call."""
    _probe_route(app)
    user = UserFactory()
    token, plaintext = _token(user)

    client.get('/__probe/whoami', headers={'X-API-Key': plaintext})
    db.session.refresh(token)
    first = token.last_used_at
    assert first is not None

    client.get('/__probe/whoami', headers={'X-API-Key': plaintext})
    db.session.refresh(token)
    assert token.last_used_at == first, 'last_used_at was written twice in a row'


def test_a_token_never_appears_in_a_response(client, db, app):
    _probe_route(app)
    user = UserFactory()
    _, plaintext = _token(user)

    resp = client.get('/__probe/whoami', headers={'X-API-Key': plaintext})
    assert plaintext not in resp.get_data(as_text=True)


def test_a_plain_jwt_required_endpoint_rejects_a_token(client, db):
    """Default deny: only endpoints that opt in accept tokens.

    /api/v1/auth/me uses @jwt_required(), so a PAT is not a decodable JWT and is
    refused. Asserted as "not 2xx" rather than a specific code because
    flask-jwt-extended answers 422 for an undecodable token, not 401.
    """
    user = UserFactory()
    _, plaintext = _token(user)
    resp = client.get('/api/v1/auth/me',
                      headers={'Authorization': 'Bearer ' + plaintext})
    assert resp.status_code >= 400
    assert resp.status_code != 200
