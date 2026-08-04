"""Human review of writes an API-token caller proposed.

Every route here is JWT-only, deliberately: @jwt_required() cannot be satisfied
by a personal access token, so an agent cannot approve its own proposals. Do not
add @api_auth_required to anything in this file.
"""
import logging
from datetime import datetime

from flask import request
from flask_jwt_extended import get_jwt_identity, jwt_required
from flask_restx import Namespace, Resource

from src.extensions import db
from src.models.agent_action import (
    STATUS_APPROVED,
    STATUS_EXPIRED,
    STATUS_PENDING,
    STATUS_REJECTED,
    STATUS_REVERTED,
    AgentAction,
)
from src.services.agent_guard.apply import (
    ProposalNoLongerValid, UnsupportedAction, apply_action)
from src.utils.decorators import demo_restricted

logger = logging.getLogger(__name__)

ns = Namespace('agent-actions', description='Review writes proposed by API clients')


def _serialize(row):
    return {
        'id': row.id,
        'action': row.action,
        'payload': row.payload,
        'status': row.status,
        'target_ref': row.target_ref,
        'token_id': row.token_id,
        'created_at': row.created_at.isoformat() if row.created_at else None,
        'decided_at': row.decided_at.isoformat() if row.decided_at else None,
        'expires_at': row.expires_at.isoformat() if row.expires_at else None,
        'reverted_at': row.reverted_at.isoformat() if row.reverted_at else None,
    }


def _owned(action_id, user_id):
    return AgentAction.query.filter_by(id=action_id, user_id=user_id).first()


@ns.route('')
class AgentActionList(Resource):
    @jwt_required()
    def get(self):
        user_id = get_jwt_identity()
        status = request.args.get('status')
        query = AgentAction.query.filter_by(user_id=user_id)
        if status:
            query = query.filter_by(status=status)
        rows = query.order_by(AgentAction.created_at.desc()).limit(100).all()
        return {'actions': [_serialize(r) for r in rows]}, 200


@ns.route('/<int:action_id>/approve')
class AgentActionApprove(Resource):
    @jwt_required()
    @demo_restricted
    def post(self, action_id):
        user_id = get_jwt_identity()
        row = _owned(action_id, user_id)
        if not row:
            return {'error': 'Agent action not found'}, 404
        if row.status != STATUS_PENDING:
            return {'error': 'Action is already %s' % row.status}, 409
        if row.is_expired:
            row.status = STATUS_EXPIRED
            db.session.commit()
            return {'error': 'Action expired before it was approved'}, 409

        try:
            row.target_ref = apply_action(row)
        except ProposalNoLongerValid as exc:
            db.session.rollback()
            # Reachable by design: guarded_write records a proposal before the
            # handler's validation runs, so a malformed one reaches the queue.
            return {'error': 'This proposal is not valid and cannot be applied',
                    'details': exc.errors}, 422
        except UnsupportedAction:
            db.session.rollback()
            logger.exception('No apply implementation for %s', row.action)
            return {'error': 'This action can no longer be applied'}, 422
        except Exception:
            db.session.rollback()
            logger.exception('Failed to apply agent action %s', action_id)
            return {'error': 'Failed to apply the change'}, 500

        row.status = STATUS_APPROVED
        row.decided_at = datetime.utcnow()
        db.session.commit()
        return {'action': _serialize(row)}, 200


@ns.route('/<int:action_id>/reject')
class AgentActionReject(Resource):
    @jwt_required()
    @demo_restricted
    def post(self, action_id):
        user_id = get_jwt_identity()
        row = _owned(action_id, user_id)
        if not row:
            return {'error': 'Agent action not found'}, 404
        if row.status != STATUS_PENDING:
            return {'error': 'Action is already %s' % row.status}, 409
        row.status = STATUS_REJECTED
        row.decided_at = datetime.utcnow()
        db.session.commit()
        return {'action': _serialize(row)}, 200


@ns.route('/<int:action_id>')
class AgentActionItem(Resource):
    @jwt_required()
    @demo_restricted
    def delete(self, action_id):
        """Reverse an applied action."""
        user_id = get_jwt_identity()
        row = _owned(action_id, user_id)
        if not row:
            return {'error': 'Agent action not found'}, 404
        if row.status == STATUS_REVERTED:
            return {'error': 'Action was already reverted'}, 409
        if not row.undo_state and not row.target_ref:
            return {'error': 'Nothing recorded to reverse this action'}, 409

        from src.services.agent_guard.revert import NotReversible, revert_action
        try:
            revert_action(row)
        except NotReversible:
            return {'error': 'Nothing recorded lets this action be reversed'}, 409
        except Exception:
            db.session.rollback()
            logger.exception('Failed to revert agent action %s', action_id)
            return {'error': 'Failed to reverse the change'}, 500

        row.status = STATUS_REVERTED
        row.reverted_at = datetime.utcnow()
        db.session.commit()
        return {'action': _serialize(row)}, 200
