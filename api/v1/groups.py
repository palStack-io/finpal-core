"""Groups API endpoints - Bill splitting and group management"""
from flask import request
from flask_restx import Namespace, Resource
from flask_jwt_extended import jwt_required, get_jwt_identity
from src.models.group import Group
from src.models.user import User
from src.models.associations import group_users
from src.extensions import db

import logging

logger = logging.getLogger(__name__)


# Create namespace
ns = Namespace('groups', description='Group and bill splitting operations')

# GroupList, GroupDetail and GroupBalances used to live here and have been
# retired. They shadowed the legacy `group_api` blueprint
# (src/services/group/api_routes.py), which registers first and therefore wins —
# but only for the spelling *without* a trailing slash. Because this app sets
# `url_map.strict_slashes = False`, the blueprint's slash-less rule and these
# slashed rules each matched one spelling, so web-ui (which omits the slash) and
# mobile (which includes it) were served *different implementations of the same
# endpoint*.
#
# They were not equivalent, and the blueprint is the more complete side, so the
# duplicates are removed rather than the blueprint:
#
#   * `GroupSchema` has no `default_split_method`, `default_payer` or
#     `auto_include_all`. mobile declares all three (`groupService.ts:14-16`) and
#     renders `group.default_split_method` (`groups.tsx:165`), so it was showing
#     nothing there, and `GroupForm` read the group's split settings back as
#     `undefined` when opening the edit sheet — saving then reset them.
#   * `GroupList.post` built the Group from `name` and `description` only and
#     returned 201, silently discarding the `default_split_method` and
#     `auto_include_all` that mobile's GroupForm sends.
#   * `group_model` declared `member_ids` as `fields.List(fields.Integer)`, while
#     user ids are email strings.
#   * `GroupDetail` and `GroupBalances` never served a request under either
#     spelling — the blueprint claims `/<int:group_id>` and `/<int:group_id>/
#     balances`, which match the same URLs as `<int:id>`; the converter variable
#     name is not part of matching. Deleting them is a no-op for both clients.
#
# Removing them needs no client change: with `strict_slashes = False` and no
# slashed rule left here, the blueprint's rule matches both spellings. This is
# the same mechanism PR #42 used to retire the legacy transactions list, and it
# is asserted in tests/integration/test_route_shadowing.py by comparing the
# payload of both spellings, not the status code.
#
# What mobile loses is `created_at` and `member_count`; it reads neither
# (`groups.tsx:175` counts `group.members.length`). What it gains is the three
# split fields, plus a `POST` response that finally matches the
# `{message, group_id}` its own `create()` already declared.
#
# GroupMembers (GET) and GroupInvite stay: the blueprint claims POST on
# /members and nothing at all on /invite, so neither collides.


@ns.route('/<int:id>/members')
@ns.param('id', 'Group ID')
class GroupMembers(Resource):
    @ns.doc('get_group_members', security='Bearer')
    @jwt_required()
    def get(self, id):
        """Get all members of a group"""
        current_user_id = get_jwt_identity()

        # Check if user is a member
        group = Group.query.join(group_users).filter(
            Group.id == id,
            group_users.c.user_id == current_user_id
        ).first()

        if not group:
            return {'success': False, 'error': 'Group not found or access denied'}, 404

        # Get members
        from schemas import users_schema
        members = group.members

        result = users_schema.dump(members)

        return {
            'success': True,
            'members': result
        }, 200


@ns.route('/<int:id>/invite')
@ns.param('id', 'Group ID')
class GroupInvite(Resource):
    @ns.doc('invite_to_group', security='Bearer')
    @jwt_required()
    def post(self, id):
        """Invite a user to join a group by email"""
        current_user_id = get_jwt_identity()
        data = request.get_json()

        # Check if user is a member of the group
        group = Group.query.join(group_users).filter(
            Group.id == id,
            group_users.c.user_id == current_user_id
        ).first()

        if not group:
            return {'success': False, 'error': 'Group not found or access denied'}, 404

        try:
            invite_email = data.get('email')
            if not invite_email:
                return {'success': False, 'error': 'Email is required'}, 400

            # Check if user already exists
            invited_user = User.query.filter_by(id=invite_email).first()

            if invited_user:
                # Check if already a member
                if invited_user in group.members:
                    return {'success': False, 'error': 'User is already a member of this group'}, 400

                # Add as member directly
                group.members.append(invited_user)
                db.session.commit()

                message = f'{invited_user.id} added to group successfully'
            else:
                # User doesn't exist yet - create a household invitation so they can register,
                # then send the group invite email
                from src.services.email_service import email_service
                from src.models.invitation import Invitation
                import os

                current_user = User.query.get(current_user_id)
                inviter_name = getattr(current_user, 'name', current_user_id) if current_user else 'Someone'

                # Create a household invitation if one doesn't already exist
                existing_invitation = Invitation.query.filter_by(email=invite_email, status='pending').first()
                if not existing_invitation:
                    invitation = Invitation(
                        email=invite_email,
                        role='member',
                        invited_by=current_user_id,
                    )
                    db.session.add(invitation)
                    db.session.commit()

                # Generate invite link pointing to register page
                app_url = os.getenv('APP_URL', request.host_url.rstrip('/'))
                invite_link = f"{app_url}/register?group_invite={id}&email={invite_email}"

                success = email_service.send_group_invite(
                    to_email=invite_email,
                    inviter_name=inviter_name,
                    group_name=group.name,
                    group_id=id,
                    invite_link=invite_link
                )

                if success:
                    message = f'Invitation sent to {invite_email}'
                else:
                    return {'success': False, 'error': 'Failed to send invitation email'}, 500

            return {
                'success': True,
                'message': message
            }, 200

        except Exception as e:
            db.session.rollback()
            return {
                'success': False,
                'error': 'Internal server error'
            }, 400
