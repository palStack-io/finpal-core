"""Team collaboration API endpoints"""
from flask import request
from flask_restx import Namespace, Resource, fields
from flask_jwt_extended import jwt_required, get_jwt_identity
from src.models.user import User
from src.extensions import db
from datetime import datetime, timedelta
import secrets

# Create namespace
ns = Namespace('team', description='Team collaboration operations')

# Define request/response models
invite_user_model = ns.model('InviteUser', {
    'email': fields.String(required=True, description='Email to invite'),
    'role': fields.String(required=True, description='Role to assign', enum=['owner', 'admin', 'member', 'viewer']),
})

update_role_model = ns.model('UpdateRole', {
    'role': fields.String(required=True, description='New role', enum=['owner', 'admin', 'member', 'viewer']),
})

transfer_ownership_model = ns.model('TransferOwnership', {
    'memberId': fields.Integer(required=True, description='Member ID to transfer ownership to'),
})

accept_invitation_model = ns.model('AcceptInvitation', {
    'token': fields.String(required=True, description='Invitation token'),
})

team_member_model = ns.model('TeamMember', {
    'id': fields.Integer(description='Member ID'),
    'name': fields.String(description='Member name'),
    'email': fields.String(description='Member email'),
    'role': fields.String(description='Member role'),
    'joinedAt': fields.DateTime(description='Join date'),
    'lastActive': fields.DateTime(description='Last active date'),
    'avatar': fields.String(description='Avatar URL'),
})

invitation_model = ns.model('Invitation', {
    'id': fields.Integer(description='Invitation ID'),
    'email': fields.String(description='Invited email'),
    'role': fields.String(description='Role'),
    'sentAt': fields.DateTime(description='Sent date'),
    'expiresAt': fields.DateTime(description='Expiration date'),
    'status': fields.String(description='Status', enum=['pending', 'accepted', 'expired', 'cancelled']),
    'invitedBy': fields.String(description='Inviter name'),
})


# Temporary in-memory storage for invitations
# In production, this would be in the database
team_invitations = []
team_members = []


@ns.route('/invite')
class Invite(Resource):
    @ns.doc('invite_user')
    @jwt_required()
    @ns.expect(invite_user_model)
    def post(self):
        """Send invitation to join team"""
        user_id = get_jwt_identity()
        user = User.query.filter_by(id=user_id).first()

        if not user:
            return {'message': 'User not found'}, 404

        data = request.get_json()
        email = data.get('email')
        role = data.get('role')

        if not email or not role:
            return {'message': 'Email and role required'}, 400

        # Validate role
        valid_roles = ['owner', 'admin', 'member', 'viewer']
        if role not in valid_roles:
            return {'message': 'Invalid role'}, 400

        # Check if user already invited
        existing = next((inv for inv in team_invitations if inv['email'] == email and inv['status'] == 'pending'), None)
        if existing:
            return {'message': 'User already invited'}, 400

        # Create invitation
        invitation = {
            'id': len(team_invitations) + 1,
            'email': email,
            'role': role,
            'sentAt': datetime.utcnow().isoformat(),
            'expiresAt': (datetime.utcnow() + timedelta(days=7)).isoformat(),
            'status': 'pending',
            'invitedBy': user.name,
            'token': secrets.token_urlsafe(32),
        }

        team_invitations.append(invitation)

        # In production, send invitation email here

        return {
            'id': invitation['id'],
            'email': invitation['email'],
            'role': invitation['role'],
            'sentAt': invitation['sentAt'],
            'expiresAt': invitation['expiresAt'],
            'status': invitation['status'],
            'invitedBy': invitation['invitedBy'],
        }, 201


@ns.route('/invitations')
class Invitations(Resource):
    @ns.doc('get_invitations')
    @jwt_required()
    def get(self):
        """Get all pending invitations"""
        user_id = get_jwt_identity()

        # Filter out expired invitations
        current_time = datetime.utcnow()
        active_invitations = []

        for inv in team_invitations:
            expires_at = datetime.fromisoformat(inv['expiresAt'])
            if inv['status'] == 'pending' and expires_at < current_time:
                inv['status'] = 'expired'

            active_invitations.append({
                'id': inv['id'],
                'email': inv['email'],
                'role': inv['role'],
                'sentAt': inv['sentAt'],
                'expiresAt': inv['expiresAt'],
                'status': inv['status'],
                'invitedBy': inv.get('invitedBy'),
            })

        return active_invitations, 200


@ns.route('/invitations/<int:invitation_id>')
class InvitationDetail(Resource):
    @ns.doc('cancel_invitation')
    @jwt_required()
    def delete(self, invitation_id):
        """Cancel a pending invitation"""
        user_id = get_jwt_identity()

        invitation = next((inv for inv in team_invitations if inv['id'] == invitation_id), None)

        if not invitation:
            return {'message': 'Invitation not found'}, 404

        if invitation['status'] != 'pending':
            return {'message': 'Cannot cancel non-pending invitation'}, 400

        invitation['status'] = 'cancelled'

        return {'message': 'Invitation cancelled'}, 200


@ns.route('/invitations/<int:invitation_id>/resend')
class ResendInvitation(Resource):
    @ns.doc('resend_invitation')
    @jwt_required()
    def post(self, invitation_id):
        """Resend an invitation"""
        user_id = get_jwt_identity()

        invitation = next((inv for inv in team_invitations if inv['id'] == invitation_id), None)

        if not invitation:
            return {'message': 'Invitation not found'}, 404

        if invitation['status'] != 'pending':
            return {'message': 'Can only resend pending invitations'}, 400

        # Update expiration date
        invitation['expiresAt'] = (datetime.utcnow() + timedelta(days=7)).isoformat()
        invitation['sentAt'] = datetime.utcnow().isoformat()

        # In production, resend invitation email here

        return {'message': 'Invitation resent'}, 200


@ns.route('/members')
class Members(Resource):
    @ns.doc('get_members')
    @jwt_required()
    def get(self):
        """Get all team members"""
        user_id = get_jwt_identity()
        user = User.query.filter_by(id=user_id).first()

        if not user:
            return {'message': 'User not found'}, 404

        # In production, this would query team members from database
        # For now, return current user as the only member
        members = [{
            'id': 1,
            'name': user.name,
            'email': user.id,
            'role': 'owner',
            'joinedAt': user.created_at.isoformat() if user.created_at else datetime.utcnow().isoformat(),
            'lastActive': datetime.utcnow().isoformat(),
            'avatar': getattr(user, 'avatar', None),
        }]

        # Add any accepted team members
        members.extend(team_members)

        return members, 200


@ns.route('/members/<int:member_id>')
class MemberDetail(Resource):
    @ns.doc('remove_member')
    @jwt_required()
    def delete(self, member_id):
        """Remove a member from the team"""
        user_id = get_jwt_identity()

        # Check if user has permission (admin or owner)
        # In production, verify role permissions

        member = next((m for m in team_members if m['id'] == member_id), None)

        if not member:
            return {'message': 'Member not found'}, 404

        if member['role'] == 'owner':
            return {'message': 'Cannot remove owner'}, 403

        team_members.remove(member)

        return {'message': 'Member removed'}, 200


@ns.route('/members/<int:member_id>/role')
class MemberRole(Resource):
    @ns.doc('update_member_role')
    @jwt_required()
    @ns.expect(update_role_model)
    def put(self, member_id):
        """Update a member's role"""
        user_id = get_jwt_identity()

        # Check if user has permission (admin or owner)
        # In production, verify role permissions

        data = request.get_json()
        new_role = data.get('role')

        if not new_role:
            return {'message': 'Role required'}, 400

        # Validate role
        valid_roles = ['admin', 'member', 'viewer']
        if new_role not in valid_roles:
            return {'message': 'Invalid role'}, 400

        member = next((m for m in team_members if m['id'] == member_id), None)

        if not member:
            return {'message': 'Member not found'}, 404

        if member['role'] == 'owner':
            return {'message': 'Cannot change owner role'}, 403

        member['role'] = new_role

        return {'message': 'Role updated successfully'}, 200


@ns.route('/transfer-ownership')
class TransferOwnership(Resource):
    @ns.doc('transfer_ownership')
    @jwt_required()
    @ns.expect(transfer_ownership_model)
    def post(self):
        """Transfer ownership to another member"""
        user_id = get_jwt_identity()

        # Check if user is owner
        # In production, verify current user is owner

        data = request.get_json()
        member_id = data.get('memberId')

        if not member_id:
            return {'message': 'Member ID required'}, 400

        member = next((m for m in team_members if m['id'] == member_id), None)

        if not member:
            return {'message': 'Member not found'}, 404

        # Transfer ownership
        member['role'] = 'owner'

        # Current owner becomes admin
        # This would update database in production

        return {'message': 'Ownership transferred successfully'}, 200


@ns.route('/leave')
class LeaveTeam(Resource):
    @ns.doc('leave_team')
    @jwt_required()
    def post(self):
        """Leave the team"""
        user_id = get_jwt_identity()

        # Check if user is owner
        # Owners cannot leave without transferring ownership first

        # Remove user from team
        # This would update database in production

        return {'message': 'Left team successfully'}, 200


@ns.route('/accept-invitation')
class AcceptInvitation(Resource):
    @ns.doc('accept_invitation')
    @jwt_required()
    @ns.expect(accept_invitation_model)
    def post(self):
        """Accept an invitation to join team"""
        user_id = get_jwt_identity()
        user = User.query.filter_by(id=user_id).first()

        if not user:
            return {'message': 'User not found'}, 404

        data = request.get_json()
        token = data.get('token')

        if not token:
            return {'message': 'Token required'}, 400

        # Find invitation by token
        invitation = next((inv for inv in team_invitations if inv.get('token') == token), None)

        if not invitation:
            return {'message': 'Invalid invitation'}, 404

        if invitation['status'] != 'pending':
            return {'message': 'Invitation is not valid'}, 400

        # Check if expired
        expires_at = datetime.fromisoformat(invitation['expiresAt'])
        if expires_at < datetime.utcnow():
            invitation['status'] = 'expired'
            return {'message': 'Invitation has expired'}, 400

        # Accept invitation
        invitation['status'] = 'accepted'

        # Add user to team
        team_members.append({
            'id': len(team_members) + 2,  # Start from 2 (1 is owner)
            'name': user.name,
            'email': user.id,
            'role': invitation['role'],
            'joinedAt': datetime.utcnow().isoformat(),
            'lastActive': datetime.utcnow().isoformat(),
            'avatar': getattr(user, 'avatar', None),
        })

        return {'message': 'Invitation accepted'}, 200
