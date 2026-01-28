"""
API Routes for Categories
JWT-based category endpoints for React frontend
"""

from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from src.services.category.service import CategoryService
from src.extensions import db

# Create API Blueprint
api_bp = Blueprint('category_api', __name__, url_prefix='/api/v1/categories')

# Initialize service
category_service = CategoryService()


@api_bp.route('', methods=['GET'])
@jwt_required()
def get_categories():
    """Get all categories for the current user"""
    try:
        identity = get_jwt_identity()

        # Get all categories
        categories = category_service.get_all_categories(identity)

        # Format categories for API response
        categories_data = []
        for category in categories:
            category_data = {
                'id': category.id,
                'name': category.name,
                'icon': category.icon,
                'color': category.color,
                'parent_id': category.parent_id,
                'is_system': category.is_system
            }
            categories_data.append(category_data)

        return jsonify({'categories': categories_data}), 200

    except Exception as e:
        return jsonify({'error': str(e)}), 500


@api_bp.route('/<int:category_id>', methods=['GET'])
@jwt_required()
def get_category(category_id):
    """Get a single category by ID"""
    try:
        identity = get_jwt_identity()

        category = category_service.get_category(category_id)

        if not category:
            return jsonify({'error': 'Category not found'}), 404

        if category.user_id != identity:
            return jsonify({'error': 'Unauthorized'}), 403

        category_data = {
            'id': category.id,
            'name': category.name,
            'icon': category.icon,
            'color': category.color,
            'parent_id': category.parent_id,
            'is_system': category.is_system
        }

        return jsonify(category_data), 200

    except Exception as e:
        return jsonify({'error': str(e)}), 500


@api_bp.route('', methods=['POST'])
@jwt_required()
def create_category():
    """Create a new category"""
    try:
        identity = get_jwt_identity()
        data = request.get_json()

        if not data:
            return jsonify({'error': 'Request body is required'}), 400

        name = data.get('name')
        icon = data.get('icon', 'fa-tag')
        color = data.get('color', '#6c757d')
        parent_id = data.get('parent_id')

        success, message, category = category_service.add_category(
            identity, name, icon, color, parent_id
        )

        if success:
            return jsonify({
                'message': message,
                'category_id': category.id
            }), 201
        else:
            return jsonify({'error': message}), 400

    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 500


@api_bp.route('/<int:category_id>', methods=['PUT', 'PATCH'])
@jwt_required()
def update_category(category_id):
    """Update a category"""
    try:
        identity = get_jwt_identity()
        data = request.get_json()

        if not data:
            return jsonify({'error': 'Request body is required'}), 400

        success, message = category_service.update_category(
            category_id,
            identity,
            name=data.get('name'),
            icon=data.get('icon'),
            color=data.get('color')
        )

        if success:
            return jsonify({'message': message}), 200
        else:
            return jsonify({'error': message}), 400

    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 500


@api_bp.route('/<int:category_id>', methods=['DELETE'])
@jwt_required()
def delete_category(category_id):
    """Delete a category"""
    try:
        identity = get_jwt_identity()

        success, message = category_service.delete_category(category_id, identity)

        if success:
            return jsonify({'message': message}), 200
        else:
            return jsonify({'error': message}), 400

    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 500
