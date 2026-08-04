"""Every write an API-token caller attempted: applied, or awaiting approval.

One table rather than a separate proposal queue and audit log — same lifecycle,
one Settings view, one story.
"""
from datetime import datetime, timedelta

from src.extensions import db

STATUS_APPLIED = 'applied'
STATUS_PENDING = 'pending'
STATUS_APPROVED = 'approved'
STATUS_REJECTED = 'rejected'
STATUS_EXPIRED = 'expired'
STATUS_REVERTED = 'reverted'

# A stale proposal must not be approvable into effect days later.
PROPOSAL_TTL_HOURS = 24


class AgentAction(db.Model):
    __tablename__ = 'agent_actions'

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.String(120), db.ForeignKey('users.id'), nullable=False,
                        index=True)
    # Nullable so a revoked token's history survives. Note there is no
    # ondelete='SET NULL': tokens are *soft* revoked (revoked_at), never
    # deleted. A hard DELETE of a token row would raise IntegrityError on
    # Postgres — if one is ever wanted, add ondelete='SET NULL' first.
    token_id = db.Column(db.Integer,
                         db.ForeignKey('personal_access_tokens.id'), nullable=True)
    action = db.Column(db.String(40), nullable=False)
    payload = db.Column(db.JSON, nullable=False, default=dict)
    # Prior values needed to reverse the action. `payload` records what was
    # asked for, which is not enough: undoing a recategorisation needs the
    # category the row had BEFORE.
    undo_state = db.Column(db.JSON, nullable=True)
    status = db.Column(db.String(20), nullable=False, index=True)
    target_ref = db.Column(db.String(80), nullable=True)
    created_at = db.Column(db.DateTime, nullable=False, default=datetime.utcnow)
    decided_at = db.Column(db.DateTime, nullable=True)
    reverted_at = db.Column(db.DateTime, nullable=True)
    expires_at = db.Column(db.DateTime, nullable=False)

    @classmethod
    def record(cls, user_id, token_id, action, payload, status,
               undo_state=None, target_ref=None):
        row = cls(
            user_id=user_id, token_id=token_id, action=action,
            payload=payload or {}, status=status, undo_state=undo_state,
            target_ref=target_ref,
            expires_at=datetime.utcnow() + timedelta(hours=PROPOSAL_TTL_HOURS),
        )
        db.session.add(row)
        return row

    @property
    def is_pending(self):
        return self.status == STATUS_PENDING

    @property
    def is_expired(self):
        return self.expires_at is not None and self.expires_at <= datetime.utcnow()
