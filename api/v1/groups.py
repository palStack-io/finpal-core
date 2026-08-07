"""Groups API endpoints - Bill splitting and group management"""
from flask import request
from flask_restx import Namespace, Resource, fields
from flask_jwt_extended import jwt_required, get_jwt_identity
from werkzeug.exceptions import HTTPException

from src.models.group import Group
from src.models.user import User
from src.models.associations import group_users
from src.extensions import db
from src.services.group.service import GroupService

import logging

logger = logging.getLogger(__name__)


# Create namespace
ns = Namespace('groups', description='Group and bill splitting operations')

group_service = GroupService()

# GroupList, GroupDetail and GroupBalances are BACK, at the bottom of this file,
# and this time they are the live handlers — the `group_api` blueprint is deleted
# and its handler bodies moved here, so the groups API appears in swagger for the
# first time. They delegate to `GroupService` exactly as the blueprint did; the
# response shapes are pinned field-for-field by
# tests/integration/test_groups_rules_contract.py, which was captured against the
# blueprint and passes against these unchanged.
#
# The history below is why they were deleted in #45, and is kept because it
# explains the shapes these handlers must reproduce.
#
# ---
#
# They shadowed the legacy `group_api` blueprint
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


group_input = ns.model('GroupInput', {
    'name': fields.String(required=True, description='Group name'),
    'description': fields.String(description='Free-text description'),
    'member_ids': fields.List(
        fields.String,
        description='User ids to add. A user id IS the email address — this was '
                    'declared as a list of integers before #45 and never worked.'),
    'default_split_method': fields.String(
        description='How expenses divide by default',
        enum=['equal', 'percentage', 'custom'], default='equal'),
    'default_payer': fields.String(description='User id who pays by default'),
    'auto_include_all': fields.Boolean(
        description='Add every household member to new expenses', default=False),
    'default_split_values': fields.Raw(
        description='Per-member shares when the method is not "equal"'),
})

group_member_input = ns.model('GroupMemberInput', {
    'email': fields.String(required=True, description='User id / email to add'),
})


def _member_rows(group, balances=None):
    """`id` and `email` are the same value: `User.id` IS the email address."""
    rows = []
    for member in group.members:
        row = {
            'id': member.id,
            'email': member.id,
            'name': member.name if hasattr(member, 'name') else member.id,
        }
        if balances is not None:
            row['balance'] = float(balances.get(member.id, 0))
        rows.append(row)
    return rows


@ns.route('/')
class GroupList(Resource):
    @ns.doc('list_groups', security='Bearer')
    @ns.response(200, 'Every group the caller is a member of')
    @jwt_required()
    def get(self):
        """List the caller's groups.

        Carries `created_at` and `member_count`, which the single-group route
        does not — an asymmetry the contract tests pin.
        """
        try:
            identity = get_jwt_identity()

            groups_data = []
            for group in group_service.get_all_groups(identity):
                groups_data.append({
                    'id': group.id,
                    'name': group.name,
                    'description': group.description,
                    'created_by': group.created_by,
                    'default_split_method': group.default_split_method,
                    'default_payer': group.default_payer,
                    'auto_include_all': group.auto_include_all,
                    'created_at': (group.created_at.isoformat()
                                   if group.created_at else None),
                    'member_count': len(group.members),
                    'members': _member_rows(group),
                })

            return {'groups': groups_data}, 200

        except HTTPException:
            raise
        except Exception:
            logger.exception('Unhandled error')
            return {'error': 'An internal error occurred'}, 500

    @ns.doc('create_group', security='Bearer')
    @ns.expect(group_input)
    @ns.response(201, 'Created; answers the new id, not the group object')
    @ns.response(400, 'Missing body or a value the service refused')
    @jwt_required()
    def post(self):
        """Create a group"""
        try:
            identity = get_jwt_identity()
            data = request.get_json()

            if not data:
                return {'error': 'Request body is required'}, 400

            success, message, group = group_service.create_group(
                identity,
                data.get('name'),
                data.get('description', ''),
                data.get('member_ids', []),
                data.get('default_split_method', 'equal'),
                data.get('default_payer'),
                data.get('auto_include_all', False),
                data.get('default_split_values'),
            )

            if success:
                return {'message': message, 'group_id': group.id}, 201
            return {'error': message}, 400

        except HTTPException:
            raise
        except Exception:
            db.session.rollback()
            logger.exception('Unhandled error')
            return {'error': 'An internal error occurred'}, 500


@ns.route('/<int:group_id>')
@ns.param('group_id', 'Group ID')
class GroupDetail(Resource):
    @ns.doc('get_group', security='Bearer')
    @ns.response(200, 'The group, with a per-member balance')
    @ns.response(404, 'No such group, or the caller is not a member')
    @jwt_required()
    def get(self, group_id):
        """Fetch one group.

        Unlike the list, this carries no `created_at` or `member_count` but adds
        a `balance` per member.
        """
        try:
            identity = get_jwt_identity()

            success, message, group = group_service.get_group(group_id, identity)
            if not success:
                return {'error': message}, 404

            balance_data = group_service.calculate_group_balances(group_id)
            member_balances = balance_data.get('member_balances', {})

            return {'group': {
                'id': group.id,
                'name': group.name,
                'description': group.description,
                'created_by': group.created_by,
                'default_split_method': group.default_split_method,
                'default_payer': group.default_payer,
                'auto_include_all': group.auto_include_all,
                'members': _member_rows(group, member_balances),
            }}, 200

        except HTTPException:
            raise
        except Exception:
            logger.exception('Unhandled error')
            return {'error': 'An internal error occurred'}, 500

    @ns.doc('update_group', security='Bearer')
    @ns.expect(group_input)
    @ns.response(200, 'Updated')
    @ns.response(400, 'Refused — including when the caller is not the creator')
    @jwt_required()
    def put(self, group_id):
        """Update a group. Only the fields named in the body are touched.

        Creator-only, inherited from `GroupService.update_settings` — see
        AUDIT D-39, which is also why this route works at all.
        """
        try:
            identity = get_jwt_identity()
            data = request.get_json()

            if not data:
                return {'error': 'Request body is required'}, 400

            success, message = group_service.update_group(
                group_id,
                identity,
                name=data.get('name'),
                description=data.get('description'),
                default_split_method=data.get('default_split_method'),
                default_payer=data.get('default_payer'),
                auto_include_all=data.get('auto_include_all'),
                default_split_values=data.get('default_split_values'),
            )

            if success:
                return {'message': message}, 200
            return {'error': message}, 400

        except HTTPException:
            raise
        except Exception:
            db.session.rollback()
            logger.exception('Unhandled error')
            return {'error': 'An internal error occurred'}, 500

    @ns.doc('patch_group', security='Bearer')
    @ns.expect(group_input)
    @jwt_required()
    def patch(self, group_id):
        """Alias of PUT.

        The blueprint served both verbs from one decorator; restx needs each
        spelled out, and an absent verb is what no duplicate-route guard sees.
        """
        return self.put(group_id)

    @ns.doc('delete_group', security='Bearer')
    @ns.response(200, 'Deleted; its expenses are detached, not deleted')
    @ns.response(400, 'Refused — only the creator may delete')
    @jwt_required()
    def delete(self, group_id):
        """Delete a group"""
        try:
            identity = get_jwt_identity()

            success, message = group_service.delete_group(group_id, identity)

            if success:
                return {'message': message}, 200
            return {'error': message}, 400

        except HTTPException:
            raise
        except Exception:
            db.session.rollback()
            logger.exception('Unhandled error')
            return {'error': 'An internal error occurred'}, 500


@ns.route('/<int:group_id>/balances')
@ns.param('group_id', 'Group ID')
class GroupBalances(Resource):
    @ns.doc('get_group_balances', security='Bearer')
    @ns.response(200, 'Simplified debts: who owes whom, netted down')
    @ns.response(404, 'No such group, or the caller is not a member')
    @jwt_required()
    def get(self, group_id):
        """Who owes whom within the group"""
        try:
            identity = get_jwt_identity()

            success, message, group = group_service.get_group(group_id, identity)
            if not success:
                return {'error': message}, 404

            balance_data = group_service.calculate_group_balances(group_id)

            # Keyed `balances`, sourced from `simplified_debts`.
            return {'balances': balance_data.get('simplified_debts', [])}, 200

        except HTTPException:
            raise
        except Exception:
            logger.exception('Unhandled error')
            return {'error': 'An internal error occurred'}, 500


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

    @ns.doc('add_group_member', security='Bearer')
    @ns.expect(group_member_input)
    @ns.response(200, 'Added — 200, not 201')
    @ns.response(400, 'Email missing, or the service refused')
    @ns.response(404, 'No such group, or the caller is not a member')
    @jwt_required()
    def post(self, id):
        """Add a member to a group.

        Merged into this Resource rather than given its own, because restx
        already owned `GET` on this exact path — two Resources would be the
        duplicate the route guard forbids, and the converter's variable name
        (`id` here, `group_id` on the blueprint) plays no part in matching.

        Answers **200**, not 201, which is what the blueprint has always done and
        what the contract tests pin. Note the sibling `get` above uses the
        `{'success', 'members'}` convention; this one deliberately does not.
        """
        try:
            identity = get_jwt_identity()
            data = request.get_json()

            if not data or 'email' not in data:
                return {'error': 'Email is required'}, 400

            success, message, group = group_service.get_group(id, identity)
            if not success:
                return {'error': message}, 404

            success, message = group_service.add_member(id, identity,
                                                        data.get('email'))

            if success:
                return {'message': message}, 200
            return {'error': message}, 400

        except HTTPException:
            raise
        except Exception:
            db.session.rollback()
            logger.exception('Unhandled error')
            return {'error': 'An internal error occurred'}, 500


group_invite_model = ns.model('GroupInviteInput', {
    'email': fields.String(required=True, description='Address to invite to the group'),
})


@ns.route('/<int:id>/invite')
@ns.param('id', 'Group ID')
class GroupInvite(Resource):
    @ns.doc('invite_to_group', security='Bearer')
    @ns.expect(group_invite_model)
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
