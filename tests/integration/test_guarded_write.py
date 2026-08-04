"""The central behaviour: a GATED write changes nothing and returns a proposal."""
from datetime import datetime, timedelta

from flask import Blueprint, jsonify
from flask_jwt_extended import get_jwt_identity

from src.extensions import db
from src.models.agent_action import STATUS_APPLIED, STATUS_PENDING, AgentAction
from src.models.category import Category
from src.models.personal_access_token import (
    SCOPE_READ_WRITE,
    PersonalAccessToken,
)
from src.utils.api_auth import api_auth_required
from tests.factories import UserFactory


def _write_token(user):
    token, plaintext = PersonalAccessToken.generate(
        user_id=user.id, name='agent', scopes=SCOPE_READ_WRITE,
        expires_at=datetime.utcnow() + timedelta(days=1))
    db.session.commit()
    return token, plaintext


def _guarded_routes(app):
    """Register throwaway routes exercising each tier.

    Idempotent: the `app` fixture is session-scoped, so a second call would
    raise "the name 'probe_guard' is already registered".
    """
    if 'probe_guard' in app.blueprints:
        return

    from src.services.agent_guard.guard import guarded_write

    bp = Blueprint('probe_guard', __name__)

    # NOTE decorator order: @api_auth_required runs first and sets g.pat, which
    # @guarded_write then reads. Listing them the other way round would make the
    # guard see every caller as a human.

    @bp.route('/__probe/safe', methods=['POST'])
    @api_auth_required(scope=SCOPE_READ_WRITE)
    @guarded_write(action='create_category')
    def safe_write():
        cat = Category(name='Made by agent', user_id=get_jwt_identity())
        db.session.add(cat)
        db.session.commit()
        return jsonify({'created': True})

    @bp.route('/__probe/gated', methods=['POST'])
    @api_auth_required(scope=SCOPE_READ_WRITE)
    @guarded_write(action='create_transaction')
    def gated_write():
        # Must never run for a token caller.
        cat = Category(name='SHOULD NOT EXIST', user_id=get_jwt_identity())
        db.session.add(cat)
        db.session.commit()
        return jsonify({'created': True})

    @bp.route('/__probe/untiered', methods=['POST'])
    @api_auth_required(scope=SCOPE_READ_WRITE)
    @guarded_write(action='delete_category')
    def untiered_write():
        return jsonify({'created': True})

    # Flask 2.2 refuses setup calls once the app has served a request, and the
    # `app` fixture is session-scoped: by the time this module runs, earlier
    # test files have already made requests. Registering a throwaway probe
    # blueprint after that point is safe, so the flag is restored immediately.
    served = app._got_first_request
    app._got_first_request = False
    try:
        app.register_blueprint(bp)
    finally:
        app._got_first_request = served


def test_gated_write_returns_202_and_changes_nothing(client, db, app):
    """The single most important test in this feature."""
    _guarded_routes(app)
    user = UserFactory()
    _, plaintext = _write_token(user)
    before = Category.query.count()

    resp = client.post('/__probe/gated', headers={'X-API-Key': plaintext})

    assert resp.status_code == 202
    body = resp.get_json()
    assert body['status'] == STATUS_PENDING
    assert isinstance(body['agent_action_id'], int)
    assert Category.query.count() == before, (
        'the handler ran despite being GATED — the guard did not stop it')

    row = AgentAction.query.get(body['agent_action_id'])
    assert row.status == STATUS_PENDING
    assert row.action == 'create_transaction'
    assert row.user_id == user.id


def test_safe_write_applies_and_is_audited(client, db, app):
    _guarded_routes(app)
    user = UserFactory()
    token, plaintext = _write_token(user)

    resp = client.post('/__probe/safe', headers={'X-API-Key': plaintext})

    assert resp.status_code == 200
    row = AgentAction.query.filter_by(action='create_category').first()
    assert row is not None, 'a SAFE write was not audited'
    assert row.status == STATUS_APPLIED
    assert row.token_id == token.id


def test_an_untiered_action_is_refused(client, db, app):
    _guarded_routes(app)
    user = UserFactory()
    _, plaintext = _write_token(user)

    resp = client.post('/__probe/untiered', headers={'X-API-Key': plaintext})

    assert resp.status_code == 403
    assert resp.get_json()['error'] == 'action_not_permitted'
    assert AgentAction.query.count() == 0


def test_a_human_session_is_not_gated_or_audited(client, db, app, auth_headers):
    """Humans clicking in the browser must be unaffected."""
    _guarded_routes(app)
    user = UserFactory()

    resp = client.post('/__probe/gated', headers=auth_headers(user))

    assert resp.status_code == 200, 'a human was gated'
    assert AgentAction.query.count() == 0, 'a human write was audited'
    assert Category.query.filter_by(name='SHOULD NOT EXIST').first() is not None
