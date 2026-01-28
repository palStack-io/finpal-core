"""
API Routes for Groups
JWT-based group endpoints for React frontend
"""

from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from src.services.group.service import GroupService
from src.extensions import db

# Create API Blueprint
api_bp = Blueprint('group_api', __name__, url_prefix='/api/v1/groups')

# Initialize service
group_service = GroupService()


@api_bp.route('', methods=['GET'])
@jwt_required()
def get_groups():
    """Get all groups for the current user"""
    try:
        identity = get_jwt_identity()

        # Get all groups
        groups = group_service.get_all_groups(identity)

        # Format groups for API response
        groups_data = []
        for group in groups:
            group_data = {
                'id': group.id,
                'name': group.name,
                'description': group.description,
                'created_by': group.created_by,
                'default_split_method': group.default_split_method,
                'default_payer': group.default_payer,
                'auto_include_all': group.auto_include_all,
                'members': [
                    {
                        'id': member.id,
                        'email': member.id,  # User.id is the email
                        'name': member.name if hasattr(member, 'name') else member.id
                    }
                    for member in group.members
                ]
            }
            groups_data.append(group_data)

        return jsonify({'groups': groups_data}), 200

    except Exception as e:
        return jsonify({'error': str(e)}), 500


@api_bp.route('/<int:group_id>', methods=['GET'])
@jwt_required()
def get_group(group_id):
    """Get a single group by ID"""
    try:
        identity = get_jwt_identity()

        success, message, group = group_service.get_group(group_id, identity)

        if not success:
            return jsonify({'error': message}), 404

        # Calculate balances for members
        balance_data = group_service.calculate_group_balances(group_id)
        member_balances = balance_data.get('member_balances', {})

        group_data = {
            'id': group.id,
            'name': group.name,
            'description': group.description,
            'created_by': group.created_by,
            'default_split_method': group.default_split_method,
            'default_payer': group.default_payer,
            'auto_include_all': group.auto_include_all,
            'members': [
                {
                    'id': member.id,
                    'email': member.id,  # User.id is the email
                    'name': member.name if hasattr(member, 'name') else member.id,
                    'balance': float(member_balances.get(member.id, 0))
                }
                for member in group.members
            ]
        }

        return jsonify({'group': group_data}), 200

    except Exception as e:
        return jsonify({'error': str(e)}), 500


@api_bp.route('', methods=['POST'])
@jwt_required()
def create_group():
    """Create a new group"""
    try:
        identity = get_jwt_identity()
        data = request.get_json()

        if not data:
            return jsonify({'error': 'Request body is required'}), 400

        name = data.get('name')
        description = data.get('description', '')
        member_ids = data.get('member_ids', [])
        default_split_method = data.get('default_split_method', 'equal')
        default_payer = data.get('default_payer')
        auto_include_all = data.get('auto_include_all', False)
        default_split_values = data.get('default_split_values')

        success, message, group = group_service.create_group(
            identity,
            name,
            description,
            member_ids,
            default_split_method,
            default_payer,
            auto_include_all,
            default_split_values
        )

        if success:
            return jsonify({
                'message': message,
                'group_id': group.id
            }), 201
        else:
            return jsonify({'error': message}), 400

    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 500


@api_bp.route('/<int:group_id>', methods=['PUT', 'PATCH'])
@jwt_required()
def update_group(group_id):
    """Update a group"""
    try:
        identity = get_jwt_identity()
        data = request.get_json()

        if not data:
            return jsonify({'error': 'Request body is required'}), 400

        success, message = group_service.update_group(
            group_id,
            identity,
            name=data.get('name'),
            description=data.get('description'),
            default_split_method=data.get('default_split_method'),
            default_payer=data.get('default_payer'),
            auto_include_all=data.get('auto_include_all'),
            default_split_values=data.get('default_split_values')
        )

        if success:
            return jsonify({'message': message}), 200
        else:
            return jsonify({'error': message}), 400

    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 500


@api_bp.route('/<int:group_id>', methods=['DELETE'])
@jwt_required()
def delete_group(group_id):
    """Delete a group"""
    try:
        identity = get_jwt_identity()

        success, message = group_service.delete_group(group_id, identity)

        if success:
            return jsonify({'message': message}), 200
        else:
            return jsonify({'error': message}), 400

    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 500


@api_bp.route('/<int:group_id>/balances', methods=['GET'])
@jwt_required()
def get_group_balances(group_id):
    """Get IOU balances within a group"""
    try:
        identity = get_jwt_identity()

        # Verify user is a member of the group
        success, message, group = group_service.get_group(group_id, identity)
        if not success:
            return jsonify({'error': message}), 404

        # Calculate balances
        balance_data = group_service.calculate_group_balances(group_id)

        return jsonify({'balances': balance_data.get('simplified_debts', [])}), 200

    except Exception as e:
        return jsonify({'error': str(e)}), 500


@api_bp.route('/<int:group_id>/members', methods=['POST'])
@jwt_required()
def add_group_member(group_id):
    """Add a member to a group"""
    try:
        identity = get_jwt_identity()
        data = request.get_json()

        if not data or 'email' not in data:
            return jsonify({'error': 'Email is required'}), 400

        email = data.get('email')

        # Verify user is a member of the group
        success, message, group = group_service.get_group(group_id, identity)
        if not success:
            return jsonify({'error': message}), 404

        # Add member
        success, message = group_service.add_member(group_id, identity, email)

        if success:
            return jsonify({'message': message}), 200
        else:
            return jsonify({'error': message}), 400

    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 500
