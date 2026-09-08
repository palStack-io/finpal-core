"""Team / Household API endpoints"""
import os
from flask import request
from flask_restx import Namespace, Resource, fields
from sqlalchemy import or_
from flask_jwt_extended import jwt_required, get_jwt_identity
from datetime import datetime, timedelta

from src.models.user import User
from src.models.invitation import Invitation, INVITATION_TTL_DAYS
from src.extensions import db

import logging

logger = logging.getLogger(__name__)


# Create namespace
ns = Namespace('team', description='Household collaboration operations')


def _invitation_json(invitation, invited_by_label):
    """One invitation, as the clients read it.

    *** BOTH SENDER SITES USED TO HARDCODE `'expiresAt': ''`, AND THAT IS #143. ***
    `TeamManagement.tsx:445` renders `new Date(invitation.expiresAt)
    .toLocaleDateString()` with no guard, and `new Date('')` is `Invalid Date` — so
    the UI was not mis-formatting a date, it was formatting a field that did not
    exist. Written once here because there were two copies of the bug in one file,
    which is how it stayed wrong in the list view as well as the create response.

    An invitation predating the `expires_at` column sends `''` again, deliberately:
    it genuinely has no expiry (see the model's note on why NULL is not "expired"),
    and inventing one for display would claim a fact the row does not hold.
    """
    return {
        'id': invitation.id,
        'email': invitation.email,
        'role': invitation.role,
        'status': invitation.status,
        'sentAt': invitation.created_at.isoformat() if invitation.created_at else '',
        'expiresAt': invitation.expires_at.isoformat() if invitation.expires_at else '',
        'invitedBy': invited_by_label,
    }


#: What a member can own that has a NOT NULL foreign key to `users.id`. Every one of
#: these blocks a delete, and the list is the reason `MemberDetail.delete` refuses
#: instead of trying — see its comment.
_OWNED_RELATIONS = (
    ('accounts', 'account'),
    ('expenses', 'transaction'),
    ('budgets', 'budget'),
    ('categories', 'category'),
    ('portfolios', 'investment portfolio'),
    ('transaction_rules', 'transaction rule'),
    ('recurring_expenses', 'recurring transaction'),
    ('import_sources', 'import source'),
    ('personal_access_tokens', 'access token'),
)


def _owned_counts(user_id):
    """`[(label, count)]` for everything `user_id` owns that would block a delete.

    Counted with raw SQL over a fixed list rather than by walking the mapper, so a
    table with no model relationship configured cannot be silently skipped — and a
    table that does not exist on an older instance is tolerated rather than fatal.
    """
    from sqlalchemy import text

    found = []
    for table, label in _OWNED_RELATIONS:
        try:
            count = db.session.execute(
                text(f'SELECT COUNT(*) FROM {table} WHERE user_id = :uid'),
                {'uid': user_id}).scalar() or 0
        except Exception:
            db.session.rollback()
            continue
        if count:
            found.append((label, count))
    return found


def _require_admin():
    """Return the current user if admin, otherwise None."""
    identity = get_jwt_identity()
    user = User.query.filter_by(id=identity).first()
    if not user or not user.is_admin:
        return None
    return user


team_invite_model = ns.model('TeamInvite', {
    'email': fields.String(required=True, description='Address to invite'),
    'role': fields.String(required=False, description="Role to grant; defaults to 'member'"),
})

member_role_model = ns.model('MemberRole', {
    # Optional on purpose: `(data or {}).get('role', 'member')`. A body with no
    # role is accepted and demotes the member to 'member'.
    'role': fields.String(required=False, description="New role; defaults to 'member'"),
})

transfer_ownership_model = ns.model('TransferOwnership', {
    'memberId': fields.String(required=True, description='User id (an email) to transfer ownership to'),
})

accept_invitation_model = ns.model('AcceptInvitation', {
    'token': fields.String(required=True, description='Token from the invitation email'),
})


@ns.route('/invite')
class Invite(Resource):
    @ns.doc('invite_user')
    @ns.expect(team_invite_model)
    @jwt_required()
    def post(self):
        """Admin creates an invitation and sends an email"""
        admin = _require_admin()
        if not admin:
            return {'message': 'Admin access required'}, 403

        data = request.get_json()
        email = (data or {}).get('email', '').strip().lower()
        role = (data or {}).get('role', 'member')

        if not email:
            return {'message': 'Email is required'}, 400

        if role not in ('member', 'admin', 'viewer'):
            return {'message': 'Invalid role'}, 400

        # Check if user already exists
        if User.query.filter_by(id=email).first():
            return {'message': 'A user with this email already exists'}, 400

        # *** `is_usable`, NOT `status == 'pending'` — AND THIS IS A REGRESSION THE
        # EXPIRY ITSELF INTRODUCED. *** Once #143 gave invitations an expiry, "pending"
        # stopped implying "usable": an expired invitation keeps `status='pending'`
        # forever, because nothing sweeps it. So with a bare status check the admin
        # was trapped between two refusals — the invitee's registration refused
        # because the invitation had expired, and the admin's attempt to send a new
        # one refused because "a pending invitation already exists" — for an
        # invitation that could not be used by anybody. The escape hatch (cancel, then
        # re-invite) existed but nothing pointed at it.
        #
        # A stale row is cancelled rather than reused: `token` is unique and the whole
        # point of re-inviting is a fresh link, so extending the old one would email a
        # token that may already have leaked, which is what the expiry exists to stop.
        existing = Invitation.query.filter_by(email=email, status='pending').all()
        for stale in existing:
            if stale.is_usable:
                return {'message': 'A pending invitation already exists for this '
                                   'email'}, 400
            stale.status = 'cancelled'

        invitation = Invitation(
            email=email,
            role=role,
            invited_by=admin.id,
        )
        db.session.add(invitation)
        db.session.commit()

        # Send invite email
        try:
            from src.services.email_service import email_service
            app_url = os.getenv('APP_URL', 'http://localhost:3000')
            invite_link = f"{app_url}/register?invite={invitation.token}"
            email_service.send_invite_email(
                to_email=email,
                inviter_name=admin.name or admin.id,
                invite_link=invite_link,
            )
        except Exception as e:
            print(f"Failed to send invite email: {e}")

        return _invitation_json(invitation, admin.name or admin.id), 201


@ns.route('/invitations')
class Invitations(Resource):
    @ns.doc('get_invitations')
    @jwt_required()
    def get(self):
        """List all invitations (admin only)"""
        admin = _require_admin()
        if not admin:
            return {'message': 'Admin access required'}, 403

        invitations = Invitation.query.order_by(Invitation.created_at.desc()).all()
        return [
            _invitation_json(
                inv, inv.inviter.name if inv.inviter else inv.invited_by)
            for inv in invitations
        ], 200


@ns.route('/invitations/<int:invitation_id>')
class InvitationDetail(Resource):
    @ns.doc('cancel_invitation')
    @jwt_required()
    def delete(self, invitation_id):
        """Cancel a pending invitation"""
        admin = _require_admin()
        if not admin:
            return {'message': 'Admin access required'}, 403

        invitation = db.session.get(Invitation, invitation_id)
        if not invitation:
            return {'message': 'Invitation not found'}, 404

        if invitation.status != 'pending':
            return {'message': 'Only pending invitations can be cancelled'}, 400

        invitation.status = 'cancelled'
        db.session.commit()

        return {'message': 'Invitation cancelled'}, 200


@ns.route('/invitations/<int:invitation_id>/resend')
class ResendInvitation(Resource):
    @ns.doc('resend_invitation')
    @jwt_required()
    def post(self, invitation_id):
        """Resend invite email for a pending invitation"""
        admin = _require_admin()
        if not admin:
            return {'message': 'Admin access required'}, 403

        invitation = db.session.get(Invitation, invitation_id)
        if not invitation:
            return {'message': 'Invitation not found'}, 404

        if invitation.status != 'pending':
            return {'message': 'Only pending invitations can be resent'}, 400

        # *** RESEND IS THE THIRD DOOR ONTO THIS TOKEN AND IT MUST NOT MAIL A DEAD
        # LINK. *** With only a status check it would happily re-send an expired
        # invitation, and the recipient would follow it to a refusal — the worst of
        # the available behaviours, because the admin is told it worked.
        #
        # The expiry is EXTENDED rather than the resend refused: "resend" means "try
        # again", and an admin who has just chosen to chase somebody is expressing
        # exactly the intent the window is for. Refusing would make them cancel and
        # re-invite to achieve the same thing.
        #
        # *** THE COMMIT IS INSIDE A `try` AND THAT IS NOT DEFENSIVE PADDING — THE
        # FIRST VERSION OF THIS CHANGE PUT IT OUTSIDE, AND
        # `test_service_errors_never_leak.py` CAUGHT IT. *** That guard patches
        # `db.session.commit` to raise with a fake `psycopg2` payload in the message
        # and asserts none of it reaches the client; a bare commit here propagated
        # the raw database error straight into the response body, which is the S-07 /
        # S-13 leak this project has fixed twice. A separate `try` from the send
        # below, with its own message, because "could not extend the invitation" and
        # "could not send the email" are different things to tell an admin.
        try:
            invitation.expires_at = (
                datetime.utcnow() + timedelta(days=INVITATION_TTL_DAYS))
            db.session.commit()
        except Exception:
            db.session.rollback()
            logger.exception('Could not extend invitation %s', invitation_id)
            return {'message': 'Could not update the invitation. Please try '
                               'again.'}, 500

        try:
            from src.services.email_service import email_service
            app_url = os.getenv('APP_URL', 'http://localhost:3000')
            invite_link = f"{app_url}/register?invite={invitation.token}"
            email_service.send_invite_email(
                to_email=invitation.email,
                inviter_name=admin.name or admin.id,
                invite_link=invite_link,
            )
        except Exception:
            # An SMTP failure's text carries the mail host, the port and the
            # server's own refusal reason. It belongs in the log, not the body.
            logger.exception('Failed to resend invitation %s', invitation_id)
            return {'message': 'Could not send the invitation email. Check the '
                               'mail settings and try again.'}, 500

        return {'message': 'Invitation resent'}, 200


@ns.route('/members')
class Members(Resource):
    @ns.doc('get_members')
    @jwt_required()
    def get(self):
        """List all users on this instance"""
        identity = get_jwt_identity()
        user = User.query.filter_by(id=identity).first()
        if not user:
            return {'message': 'Unauthorized'}, 401

        users = User.query.filter_by(is_demo_user=False).order_by(User.created_at.asc()).all()
        return [
            {
                'id': u.id,
                'name': u.name or u.id.split('@')[0],
                'email': u.id,
                'role': 'owner' if u.is_admin else 'member',
                'joinedAt': u.created_at.isoformat() if u.created_at else '',
                'lastActive': u.last_login.isoformat() if u.last_login else None,
                'avatar': u.profile_emoji,
            }
            for u in users
        ], 200


@ns.route('/members/<path:member_id>')
class MemberDetail(Resource):
    @ns.doc('remove_member')
    @jwt_required()
    def delete(self, member_id):
        """Admin removes a user from the instance"""
        admin = _require_admin()
        if not admin:
            return {'message': 'Admin access required'}, 403

        if member_id == admin.id:
            return {'message': 'Cannot remove yourself'}, 400

        target = User.query.filter_by(id=member_id).first()
        if not target:
            return {'message': 'User not found'}, 404

        if target.is_admin:
            return {'message': 'Cannot remove another admin'}, 400

        # *** THIS USED TO ANSWER 500 FOR ANY MEMBER WHO OWNED ANYTHING, WHICH IS
        # EVERY REAL MEMBER. ***
        #
        # Found while fixing #141 and proven behaviourally: every user-keyed table in
        # finPal declares `user_id ... nullable=False`, and NO relationship declares a
        # cascade or `ondelete`. So SQLAlchemy's default on `db.session.delete(user)`
        # is to NULL the child's foreign key, and the NOT NULL constraint then raises
        # `IntegrityError: NOT NULL constraint failed: accounts.user_id`. That is
        # engine-independent — it is the ORM's behaviour, not Postgres being strict —
        # and it is why #141's reporter saw removal work: their throwaway account
        # owned nothing. A freshly registered user owns nothing either (measured), so
        # the happy path was the only path anybody had tried.
        #
        # **Refuse rather than delete — owner decision, 2026-09-08.** The alternative
        # was calling `_delete_all_user_data` (which exists in `api/v1/users.py` and
        # is what /users/delete-all-data uses), and that would let one admin click
        # erase a housemate's entire financial history irreversibly. Reassigning to
        # the removing admin was also rejected: it silently rewrites attribution,
        # which D-18 deliberately settled as the account's owner.
        #
        # So removing a member who has data is still unsupported — but it now SAYS SO
        # and names what is in the way, instead of answering 500.
        owned = _owned_counts(member_id)
        if owned:
            detail = ', '.join(f'{count} {label}{"s" if count != 1 else ""}'
                               for label, count in owned)
            return {'message': f'{target.name or member_id} still owns {detail}. '
                               f'Reassign or delete that data first — removing the '
                               f'member would not remove it, and finPal will not '
                               f'delete somebody else\'s records for you.'}, 409

        # *** #141: DELETING THE USER LEFT THEIR EMAIL ADDRESS IN `invitations`. ***
        # The reporter invited a local user, deleted it, invited again, and the
        # address kept appearing on the household page — because
        # `GET /team/invitations` lists invitations of EVERY status and the accepted
        # one was still there, naming an account that no longer existed. They framed
        # it as a GDPR question and they are right: the address really was still
        # stored, and removing the account did not remove it.
        #
        # Two clauses, and the second is a latent 500 rather than a display bug:
        #
        #   email == member_id      the invitations sent TO them. This is #141.
        #   invited_by == member_id the invitations sent BY them. `invited_by` is
        #                           NOT NULL with a FK to `users.id`, so a row
        #                           CANNOT outlive its inviter — on Postgres this
        #                           DELETE raises a foreign-key violation and the
        #                           handler answers 500. Reachable today: demote an
        #                           admin with `PUT /members/<id>/role`, then remove
        #                           them. **SQLite does not enforce foreign keys by
        #                           default, so the suite would never have shown
        #                           this** — that is D-123's shape, where every
        #                           over-long value was accepted silently by SQLite
        #                           and failed only on Postgres.
        #
        # Removing rather than reassigning: an invitation is a person vouching for
        # an address, so once that person is off the instance the vouch is gone.
        # Reassigning `invited_by` to whoever ran the removal would put a name
        # against an invitation they never sent.
        Invitation.query.filter(
            or_(Invitation.email == member_id,
                Invitation.invited_by == member_id)
        ).delete(synchronize_session=False)

        db.session.delete(target)
        db.session.commit()

        return {'message': 'Member removed'}, 200


@ns.route('/members/<path:member_id>/role')
class MemberRole(Resource):
    @ns.doc('update_member_role')
    @ns.expect(member_role_model)
    @jwt_required()
    def put(self, member_id):
        """Admin updates a user's role"""
        admin = _require_admin()
        if not admin:
            return {'message': 'Admin access required'}, 403

        if member_id == admin.id:
            return {'message': 'Cannot change your own role'}, 400

        target = User.query.filter_by(id=member_id).first()
        if not target:
            return {'message': 'User not found'}, 404

        data = request.get_json()
        new_role = (data or {}).get('role', 'member')

        target.is_admin = (new_role == 'admin')
        db.session.commit()

        return {'message': f'Role updated to {new_role}'}, 200


@ns.route('/transfer-ownership')
class TransferOwnership(Resource):
    @ns.doc('transfer_ownership')
    @ns.expect(transfer_ownership_model)
    @jwt_required()
    def post(self):
        """Transfer admin status to another member"""
        admin = _require_admin()
        if not admin:
            return {'message': 'Admin access required'}, 403

        data = request.get_json()
        member_id = (data or {}).get('memberId')

        if not member_id:
            return {'message': 'Member ID required'}, 400

        target = User.query.filter_by(id=member_id).first()
        if not target:
            return {'message': 'Member not found'}, 404

        target.is_admin = True
        admin.is_admin = False
        db.session.commit()

        return {'message': 'Ownership transferred successfully'}, 200


@ns.route('/leave')
class LeaveTeam(Resource):
    @ns.doc('leave_team')
    @jwt_required()
    def post(self):
        """Leave the household"""
        return {'message': 'Left team successfully'}, 200


@ns.route('/accept-invitation')
class AcceptInvitation(Resource):
    @ns.doc('accept_invitation')
    @ns.expect(accept_invitation_model)
    @jwt_required()
    def post(self):
        """Accept an invitation to join household"""
        identity = get_jwt_identity()

        data = request.get_json()
        token = (data or {}).get('token')

        if not token:
            return {'message': 'Token required'}, 400

        invitation = Invitation.query.filter_by(token=token).first()
        if not invitation:
            return {'message': 'Invalid invitation'}, 404

        # `is_usable` rather than a bare status check: this is one of TWO doors onto
        # the same token (the other is POST /auth/register), and #143's expiry is
        # worthless if only one of them asks. D-99's rule — a refusal in one client
        # is not a refusal until the server refuses.
        if not invitation.is_usable:
            if invitation.is_expired and invitation.status == 'pending':
                return {'message': 'This invitation has expired. Ask your '
                                   'household admin to send a new one.'}, 400
            return {'message': 'Invitation is not valid'}, 400

        invitation.status = 'accepted'
        db.session.commit()

        return {'message': 'Invitation accepted'}, 200
