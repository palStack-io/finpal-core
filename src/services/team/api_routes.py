"""
API Routes for Team / Household management
Invite users, list members, manage roles
"""

import os
from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from src.models.user import User
from src.models.invitation import Invitation
from src.extensions import db

api_bp = Blueprint('team_api', __name__, url_prefix='/api/v1/team')


def _require_admin():
    """Return the current user if admin, otherwise None."""
    identity = get_jwt_identity()
    user = User.query.filter_by(id=identity).first()
    if not user or not user.is_admin:
        return None
    return user


# ── Invite ────────────────────────────────────────────────

@api_bp.route('/invite', methods=['POST'])
@jwt_required()
def invite_user():
    """Admin creates an invitation and sends an email."""
    admin = _require_admin()
    if not admin:
        return jsonify({'error': 'Admin access required'}), 403

    data = request.get_json()
    email = (data or {}).get('email', '').strip().lower()
    role = (data or {}).get('role', 'member')

    if not email:
        return jsonify({'error': 'Email is required'}), 400

    if role not in ('member', 'admin', 'viewer'):
        return jsonify({'error': 'Invalid role'}), 400

    # Check if user already exists
    if User.query.filter_by(id=email).first():
        return jsonify({'error': 'A user with this email already exists'}), 400

    # Check for existing pending invitation
    existing = Invitation.query.filter_by(email=email, status='pending').first()
    if existing:
        return jsonify({'error': 'A pending invitation already exists for this email'}), 400

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

    return jsonify({
        'id': invitation.id,
        'email': invitation.email,
        'role': invitation.role,
        'status': invitation.status,
        'sentAt': invitation.created_at.isoformat(),
        'expiresAt': '',  # no hard expiry for now
        'invitedBy': admin.name or admin.id,
    }), 201


# ── Invitations ───────────────────────────────────────────

@api_bp.route('/invitations', methods=['GET'])
@jwt_required()
def list_invitations():
    """List all invitations (admin only)."""
    admin = _require_admin()
    if not admin:
        return jsonify({'error': 'Admin access required'}), 403

    invitations = Invitation.query.order_by(Invitation.created_at.desc()).all()
    return jsonify([
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
    ]), 200


@api_bp.route('/invitations/<int:invitation_id>', methods=['DELETE'])
@jwt_required()
def cancel_invitation(invitation_id):
    """Cancel a pending invitation."""
    admin = _require_admin()
    if not admin:
        return jsonify({'error': 'Admin access required'}), 403

    invitation = Invitation.query.get(invitation_id)
    if not invitation:
        return jsonify({'error': 'Invitation not found'}), 404

    if invitation.status != 'pending':
        return jsonify({'error': 'Only pending invitations can be cancelled'}), 400

    invitation.status = 'cancelled'
    db.session.commit()

    return jsonify({'message': 'Invitation cancelled'}), 200


@api_bp.route('/invitations/<int:invitation_id>/resend', methods=['POST'])
@jwt_required()
def resend_invitation(invitation_id):
    """Resend invite email for a pending invitation."""
    admin = _require_admin()
    if not admin:
        return jsonify({'error': 'Admin access required'}), 403

    invitation = Invitation.query.get(invitation_id)
    if not invitation:
        return jsonify({'error': 'Invitation not found'}), 404

    if invitation.status != 'pending':
        return jsonify({'error': 'Only pending invitations can be resent'}), 400

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
        return jsonify({'error': f'Failed to resend email: {e}'}), 500

    return jsonify({'message': 'Invitation resent'}), 200


# ── Members ───────────────────────────────────────────────

@api_bp.route('/members', methods=['GET'])
@jwt_required()
def list_members():
    """List all users on this instance."""
    identity = get_jwt_identity()
    user = User.query.filter_by(id=identity).first()
    if not user:
        return jsonify({'error': 'Unauthorized'}), 401

    users = User.query.filter_by(is_demo_user=False).order_by(User.created_at.asc()).all()
    return jsonify([
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
    ]), 200


@api_bp.route('/members/<path:member_id>', methods=['DELETE'])
@jwt_required()
def remove_member(member_id):
    """Admin removes a user from the instance."""
    admin = _require_admin()
    if not admin:
        return jsonify({'error': 'Admin access required'}), 403

    if member_id == admin.id:
        return jsonify({'error': 'Cannot remove yourself'}), 400

    target = User.query.filter_by(id=member_id).first()
    if not target:
        return jsonify({'error': 'User not found'}), 404

    if target.is_admin:
        return jsonify({'error': 'Cannot remove another admin'}), 400

    db.session.delete(target)
    db.session.commit()

    return jsonify({'message': 'Member removed'}), 200


@api_bp.route('/members/<path:member_id>/role', methods=['PUT'])
@jwt_required()
def update_member_role(member_id):
    """Admin updates a user's role (is_admin flag)."""
    admin = _require_admin()
    if not admin:
        return jsonify({'error': 'Admin access required'}), 403

    if member_id == admin.id:
        return jsonify({'error': 'Cannot change your own role'}), 400

    target = User.query.filter_by(id=member_id).first()
    if not target:
        return jsonify({'error': 'User not found'}), 404

    data = request.get_json()
    new_role = (data or {}).get('role', 'member')

    target.is_admin = (new_role == 'admin')
    db.session.commit()

    return jsonify({'message': f'Role updated to {new_role}'}), 200
