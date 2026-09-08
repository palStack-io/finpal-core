"""
Invitation model for household invite system
"""

from datetime import datetime, timedelta
import secrets
from src.extensions import db

#: How long an invite link stays usable. Chosen at 7 days (owner, 2026-09-08) when
#: `expires_at` was added for palStack-io/finpal-core#143 — long enough that an
#: invitee can get to it over a weekend, short enough that a link leaked into a chat
#: log or a forwarded email stops being a registration credential.
INVITATION_TTL_DAYS = 7


class Invitation(db.Model):
    __tablename__ = 'invitations'

    id = db.Column(db.Integer, primary_key=True)
    email = db.Column(db.String(120), nullable=False)
    role = db.Column(db.String(20), default='member')  # member/admin/viewer
    invited_by = db.Column(db.String(120), db.ForeignKey('users.id'), nullable=False)
    token = db.Column(db.String(100), unique=True, nullable=False)
    status = db.Column(db.String(20), default='pending')  # pending/accepted/cancelled
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    #: *** NULLABLE ON PURPOSE, AND NULL DOES NOT MEAN EXPIRED. ***
    #:
    #: Added 2026-09-08 for #143, where the UI rendered
    #: `new Date(invitation.expiresAt).toLocaleDateString()` against a field the model
    #: did not have — so "Expires: Invalid Date" was not a formatting bug, it was a
    #: column that never existed. An invite token was therefore valid forever, which
    #: is the more serious half of that issue.
    #:
    #: It has to be nullable so D-121's boot-time reconcile can add it to a table
    #: that already has rows (`src/utils/schema_reconcile.py` adds a declared column
    #: only when it is nullable or carries a default). That means every invitation
    #: already pending on an upgrading self-hoster's instance arrives holding NULL —
    #: and reading NULL as "expired" would invalidate all of them at boot, turning a
    #: display fix into an outage for anybody mid-invite. So **NULL means "predates
    #: this column" and does not expire**; the state disappears on its own as those
    #: invitations are accepted or cancelled.
    expires_at = db.Column(db.DateTime, nullable=True)

    # Relationship
    inviter = db.relationship('User', backref=db.backref('invitations_sent', lazy=True))

    def __init__(self, **kwargs):
        if 'token' not in kwargs:
            kwargs['token'] = secrets.token_urlsafe(32)
        if 'expires_at' not in kwargs:
            # Set here rather than as a column `default=`, because the window is
            # relative to now and a column default cannot see `created_at` (which
            # SQLAlchemy has not applied yet at this point).
            kwargs['expires_at'] = (
                datetime.utcnow() + timedelta(days=INVITATION_TTL_DAYS))
        super().__init__(**kwargs)

    @property
    def is_expired(self):
        """Whether this invitation may no longer be used.

        **One predicate, because there are THREE doors onto the same token** —
        `POST /auth/register` (an invitee who follows the emailed link),
        `POST /team/accept-invitation`, and `POST /team/invitations/<id>/resend`,
        which does not refuse but EXTENDS the window so it cannot mail a dead link.
        #143's fix is worthless if only one of them checks, and D-99's rule is exactly
        this: a refusal in one client is not a refusal until the server refuses.
        `Invite.post` is a fourth reader — it asks whether a stale row still blocks a
        re-invite, which is the regression the expiry itself created.

        `None` is False, not True — see the note on the column.
        """
        if self.expires_at is None:
            return False
        return datetime.utcnow() > self.expires_at

    @property
    def is_usable(self):
        """Pending AND not expired. What both doors actually need to ask."""
        return self.status == 'pending' and not self.is_expired
