"""Team / Household API endpoints"""
import os
from flask import request
from flask_restx import Namespace, Resource, fields
from flask_jwt_extended import jwt_required, get_jwt_identity
from src.models.user import User
from src.models.invitation import Invitation
from src.extensions import db

# Create namespace
ns = Namespace('team', description='Household collaboration operations')


def _require_admin():
    """Return the current user if admin, otherwise None."""
    identity = get_jwt_identity()
    user = User.query.filter_by(id=identity).first()
    if not user or not user.is_admin:
        return None
    return user


@ns.route('/invite')
class Invite(Resource):
    @ns.doc('invite_user')
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

        # Check for existing pending invitation
        existing = Invitation.query.filter_by(email=email, status='pending').first()
        if existing:
            return {'message': 'A pending invitation already exists for this email'}, 400

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

        return {
            'id': invitation.id,
            'email': invitation.email,
            'role': invitation.role,
            'status': invitation.status,
            'sentAt': invitation.created_at.isoformat(),
            'expiresAt': '',
            'invitedBy': admin.name or admin.id,
        }, 201


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
            {
                'id': inv.id,
                'email': inv.email,
                'role': inv.role,
                'status': inv.status,
                'sentAt': inv.created_at.isoformat(),
                'expiresAt': '',
                'invitedBy': inv.inviter.name if inv.inviter else inv.invited_by,
            }
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

        invitation = Invitation.query.get(invitation_id)
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

        invitation = Invitation.query.get(invitation_id)
        if not invitation:
            return {'message': 'Invitation not found'}, 404

        if invitation.status != 'pending':
            return {'message': 'Only pending invitations can be resent'}, 400

        try:
            from src.services.email_service import email_service
            app_url = os.getenv('APP_URL', 'http://localhost:3000')
            invite_link = f"{app_url}/register?invite={invitation.token}"
            email_service.send_invite_email(
                to_email=invitation.email,
                inviter_name=admin.name or admin.id,
                invite_link=invite_link,
            )
        except Exception as e:
            return {'message': f'Failed to resend email: {e}'}, 500

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

        db.session.delete(target)
        db.session.commit()

        return {'message': 'Member removed'}, 200


@ns.route('/members/<path:member_id>/role')
class MemberRole(Resource):
    @ns.doc('update_member_role')
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

        if invitation.status != 'pending':
            return {'message': 'Invitation is not valid'}, 400

        invitation.status = 'accepted'
        db.session.commit()

        return {'message': 'Invitation accepted'}, 200
