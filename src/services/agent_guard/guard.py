"""Apply the write tiers to a route.

Sits inside @api_auth_required, which has already resolved the caller and set
g.pat. A human session has g.pat None and passes straight through: this
machinery exists for non-interactive callers only.
"""
import logging
from functools import wraps

from flask import jsonify, request

from src.extensions import db
from src.models.agent_action import STATUS_APPLIED, STATUS_PENDING, AgentAction
from src.services.agent_guard.tiers import GATED, tier_for
from src.utils.api_auth import current_pat

logger = logging.getLogger(__name__)


def _requested_payload(kwargs):
    """What the caller asked for: the JSON body plus the view's URL arguments.

    A body that is not a JSON object (a bare list, say) is discarded rather than
    merged, because the URL arguments still have to survive.
    """
    payload = request.get_json(silent=True)
    if not isinstance(payload, dict):
        payload = {}
    payload.update({k: v for k, v in kwargs.items()})
    return payload


def record_applied(action, target_ref=None, undo_state=None, payload=None):
    """Audit a SAFE write that has just been applied by a token caller.

    No-op for a human session, so handlers can call it unconditionally.

    `payload` is not decoration: src/services/agent_guard/revert.py locates the
    row to restore from it, so an applied action recorded with an empty payload
    reverts to nothing while still reporting success.
    """
    pat = current_pat()
    if pat is None:
        return None
    row = AgentAction.record(
        user_id=pat.user_id, token_id=pat.id, action=action,
        payload=payload or {}, status=STATUS_APPLIED, undo_state=undo_state,
        target_ref=target_ref)
    db.session.commit()
    return row


def guarded_write(action, undo_state=None):
    """Gate a write according to the action's tier.

    `undo_state` is an optional callable receiving the view's kwargs and
    returning a JSON-serialisable dict of the values a reversal needs. It is
    evaluated BEFORE the handler runs, because afterwards the prior values are
    gone.
    """
    def decorator(fn):
        @wraps(fn)
        def wrapper(*args, **kwargs):
            pat = current_pat()
            if pat is None:
                return fn(*args, **kwargs)  # human session

            tier = tier_for(action)
            if tier is None:
                return jsonify({'error': 'action_not_permitted',
                                'action': action}), 403

            if tier == GATED:
                payload = _requested_payload(kwargs)
                row = AgentAction.record(
                    user_id=pat.user_id, token_id=pat.id, action=action,
                    payload=payload, status=STATUS_PENDING)
                db.session.commit()
                return jsonify({
                    'status': STATUS_PENDING,
                    'agent_action_id': row.id,
                    'message': ('This change needs your approval. Review it in '
                                'Settings > Integrations > Agent Access.'),
                }), 202

            # SAFE: capture the prior state, then let the handler run.
            captured = None
            if undo_state is not None:
                try:
                    captured = undo_state(**kwargs)
                except Exception:
                    logger.exception(
                        'Failed to capture undo_state for %s', action)
            requested = _requested_payload(kwargs)
            result = fn(*args, **kwargs)
            record_applied(action, undo_state=captured, payload=requested)
            return result
        return wrapper
    return decorator
