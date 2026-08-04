"""Mint and revoke personal access tokens.

JWT-only by design: a token that could mint another token would let a leaked
read credential escalate to a write one. Do not add @api_auth_required here.
"""
import logging
from datetime import datetime, timedelta

from flask import request
from flask_jwt_extended import get_jwt_identity, jwt_required
from flask_restx import Namespace, Resource

from src.extensions import db
from src.models.agent_action import STATUS_PENDING, STATUS_REJECTED, AgentAction
from src.models.personal_access_token import (
    DEFAULT_LIFETIME_DAYS,
    MAX_LIFETIME_DAYS,
    VALID_SCOPES,
    PersonalAccessToken,
)
from src.utils.decorators import demo_restricted

logger = logging.getLogger(__name__)

ns = Namespace('access-tokens', description='Personal access tokens for API clients')


def _serialize(token):
    """Never includes the plaintext or the hash."""
    return {
        'id': token.id,
        'name': token.name,
        'token_prefix': token.token_prefix,
        'scopes': token.scopes,
        'expires_at': token.expires_at.isoformat() if token.expires_at else None,
        'last_used_at': (token.last_used_at.isoformat()
                         if token.last_used_at else None),
        'created_at': token.created_at.isoformat() if token.created_at else None,
        'revoked_at': token.revoked_at.isoformat() if token.revoked_at else None,
    }


@ns.route('')
class AccessTokenList(Resource):
    @jwt_required()
    def get(self):
        user_id = get_jwt_identity()
        tokens = (PersonalAccessToken.query
                  .filter_by(user_id=user_id)
                  .order_by(PersonalAccessToken.created_at.desc()).all())
        return {'tokens': [_serialize(t) for t in tokens]}, 200

    @jwt_required()
    @demo_restricted
    def post(self):
        user_id = get_jwt_identity()
        data = request.get_json() or {}
        name = (data.get('name') or '').strip()
        if not name:
            return {'error': 'name is required'}, 400

        scopes = data.get('scopes') or 'read'
        if scopes not in VALID_SCOPES:
            return {'error': 'scopes must be one of %s' % (VALID_SCOPES,)}, 400

        try:
            days = int(data.get('expires_in_days') or DEFAULT_LIFETIME_DAYS)
        except (TypeError, ValueError):
            return {'error': 'expires_in_days must be a number'}, 400
        if days < 1 or days > MAX_LIFETIME_DAYS:
            return {'error': 'expires_in_days must be between 1 and %d'
                             % MAX_LIFETIME_DAYS}, 400

        try:
            token, plaintext = PersonalAccessToken.generate(
                user_id=user_id, name=name[:120], scopes=scopes,
                expires_at=datetime.utcnow() + timedelta(days=days))
            db.session.commit()
        except ValueError as exc:
            db.session.rollback()
            # ValueError here carries an authored message from generate(), not
            # arbitrary exception text.
            return {'error': str(exc)}, 400
        except Exception:
            db.session.rollback()
            logger.exception('Failed to create access token')
            return {'error': 'Failed to create the token'}, 500

        # The only time the plaintext is ever returned.
        return {'token': plaintext, 'token_info': _serialize(token)}, 201


@ns.route('/<int:token_id>')
class AccessTokenItem(Resource):
    @jwt_required()
    @demo_restricted
    def delete(self, token_id):
        user_id = get_jwt_identity()
        token = PersonalAccessToken.query.filter_by(
            id=token_id, user_id=user_id).first()
        if not token:
            return {'error': 'Token not found'}, 404

        token.revoked_at = datetime.utcnow()
        # A withdrawn credential's proposals must not remain approvable.
        stale = AgentAction.query.filter_by(
            token_id=token.id, status=STATUS_PENDING).all()
        for row in stale:
            row.status = STATUS_REJECTED
            row.decided_at = datetime.utcnow()
        db.session.commit()
        return {'revoked': True, 'rejected_pending': len(stale)}, 200
