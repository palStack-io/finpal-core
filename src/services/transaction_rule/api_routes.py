"""
API Routes for Transaction Rules
JWT-based endpoints for managing auto-categorization rules
"""

from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from src.models.transaction_rule import TransactionRule
from src.extensions import db
import json

# Create API Blueprint
api_bp = Blueprint('transaction_rule_api', __name__, url_prefix='/api/v1/transaction-rules')


@api_bp.route('', methods=['GET'])
@jwt_required()
def get_rules():
    """Get all transaction rules for the current user"""
    try:
        identity = get_jwt_identity()

        # Get all rules, ordered by priority (highest first)
        rules = TransactionRule.query.filter_by(
            user_id=identity
        ).order_by(
            TransactionRule.priority.desc(),
            TransactionRule.created_at.desc()
        ).all()

        return jsonify({
            'rules': [rule.to_dict() for rule in rules]
        }), 200

    except Exception as e:
        return jsonify({'error': str(e)}), 500


@api_bp.route('/<int:rule_id>', methods=['GET'])
@jwt_required()
def get_rule(rule_id):
    """Get a single transaction rule by ID"""
    try:
        identity = get_jwt_identity()

        rule = TransactionRule.query.filter_by(id=rule_id, user_id=identity).first()

        if not rule:
            return jsonify({'error': 'Rule not found'}), 404

        return jsonify(rule.to_dict()), 200

    except Exception as e:
        return jsonify({'error': str(e)}), 500


@api_bp.route('', methods=['POST'])
@jwt_required()
def create_rule():
    """Create a new transaction rule"""
    try:
        identity = get_jwt_identity()
        data = request.get_json()

        if not data:
            return jsonify({'error': 'Request body is required'}), 400

        # Validate required fields
        if not data.get('name'):
            return jsonify({'error': 'Rule name is required'}), 400
        if not data.get('pattern'):
            return jsonify({'error': 'Pattern is required'}), 400

        # Create rule
        rule = TransactionRule(
            user_id=identity,
            name=data['name'],
            pattern=data['pattern'],
            pattern_field=data.get('pattern_field', 'description'),
            is_regex=data.get('is_regex', False),
            case_sensitive=data.get('case_sensitive', False),
            auto_category_id=data.get('auto_category_id'),
            auto_account_id=data.get('auto_account_id'),
            auto_transaction_type=data.get('auto_transaction_type'),
            auto_tags=json.dumps(data['auto_tags']) if data.get('auto_tags') else None,
            auto_notes=data.get('auto_notes'),
            priority=data.get('priority', 0),
            active=data.get('active', True)
        )

        db.session.add(rule)
        db.session.commit()

        return jsonify({
            'message': 'Rule created successfully',
            'rule_id': rule.id,
            'rule': rule.to_dict()
        }), 201

    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 500


@api_bp.route('/<int:rule_id>', methods=['PUT', 'PATCH'])
@jwt_required()
def update_rule(rule_id):
    """Update a transaction rule"""
    try:
        identity = get_jwt_identity()
        data = request.get_json()

        if not data:
            return jsonify({'error': 'Request body is required'}), 400

        rule = TransactionRule.query.filter_by(id=rule_id, user_id=identity).first()

        if not rule:
            return jsonify({'error': 'Rule not found'}), 404

        # Update fields
        if 'name' in data:
            rule.name = data['name']
        if 'pattern' in data:
            rule.pattern = data['pattern']
        if 'pattern_field' in data:
            rule.pattern_field = data['pattern_field']
        if 'is_regex' in data:
            rule.is_regex = data['is_regex']
        if 'case_sensitive' in data:
            rule.case_sensitive = data['case_sensitive']
        if 'auto_category_id' in data:
            rule.auto_category_id = data['auto_category_id']
        if 'auto_account_id' in data:
            rule.auto_account_id = data['auto_account_id']
        if 'auto_transaction_type' in data:
            rule.auto_transaction_type = data['auto_transaction_type']
        if 'auto_tags' in data:
            rule.auto_tags = json.dumps(data['auto_tags']) if data['auto_tags'] else None
        if 'auto_notes' in data:
            rule.auto_notes = data['auto_notes']
        if 'priority' in data:
            rule.priority = data['priority']
        if 'active' in data:
            rule.active = data['active']

        db.session.commit()

        return jsonify({
            'message': 'Rule updated successfully',
            'rule': rule.to_dict()
        }), 200

    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 500


@api_bp.route('/<int:rule_id>', methods=['DELETE'])
@jwt_required()
def delete_rule(rule_id):
    """Delete a transaction rule"""
    try:
        identity = get_jwt_identity()

        rule = TransactionRule.query.filter_by(id=rule_id, user_id=identity).first()

        if not rule:
            return jsonify({'error': 'Rule not found'}), 404

        db.session.delete(rule)
        db.session.commit()

        return jsonify({'message': 'Rule deleted successfully'}), 200

    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 500


@api_bp.route('/test', methods=['POST'])
@jwt_required()
def test_rule():
    """Test a rule against sample transaction data"""
    try:
        identity = get_jwt_identity()
        data = request.get_json()

        if not data:
            return jsonify({'error': 'Request body is required'}), 400

        rule_id = data.get('rule_id')
        transaction_data = data.get('transaction_data', {})

        if not rule_id:
            return jsonify({'error': 'rule_id is required'}), 400

        rule = TransactionRule.query.filter_by(id=rule_id, user_id=identity).first()

        if not rule:
            return jsonify({'error': 'Rule not found'}), 404

        # Test if rule matches
        matches = rule.matches(transaction_data)

        # If it matches, show what would be applied
        result = {
            'matches': matches,
            'rule': rule.to_dict()
        }

        if matches:
            applied_data = rule.apply(transaction_data.copy())
            result['applied_changes'] = applied_data

        return jsonify(result), 200

    except Exception as e:
        return jsonify({'error': str(e)}), 500
