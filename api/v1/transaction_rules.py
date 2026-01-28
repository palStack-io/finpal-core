"""Transaction Rules API endpoints"""
from flask import request
from flask_restx import Namespace, Resource, fields
from flask_jwt_extended import jwt_required, get_jwt_identity
from src.models.transaction_rule import TransactionRule
from src.models.category import Category
from src.extensions import db
from src.utils.rule_engine import bulk_apply_rules, suggest_rule_from_edit
from datetime import datetime

# Create namespace
ns = Namespace('transaction-rules', description='Transaction rule operations')

# Define request/response models
rule_model = ns.model('TransactionRule', {
    'name': fields.String(required=True, description='Rule name'),
    'pattern': fields.String(required=True, description='Pattern to match'),
    'pattern_field': fields.String(description='Field to match (default: description)'),
    'is_regex': fields.Boolean(description='Whether pattern is regex'),
    'case_sensitive': fields.Boolean(description='Case sensitive matching'),
    'amount_min': fields.Float(description='Minimum amount to match'),
    'amount_max': fields.Float(description='Maximum amount to match'),
    'transaction_type_filter': fields.String(description='Transaction type filter'),
    'auto_category_id': fields.Integer(description='Auto-assign category ID'),
    'auto_account_id': fields.Integer(description='Auto-assign account ID'),
    'auto_transaction_type': fields.String(description='Auto-assign transaction type'),
    'auto_tags': fields.List(fields.String, description='Auto-assign tags'),
    'auto_notes': fields.String(description='Auto-append notes'),
    'priority': fields.Integer(description='Rule priority (higher = runs first)'),
    'active': fields.Boolean(description='Whether rule is active'),
})


@ns.route('')
class TransactionRuleList(Resource):
    @ns.doc('list_transaction_rules', security='Bearer')
    @jwt_required()
    def get(self):
        """Get all transaction rules for current user"""
        current_user_id = get_jwt_identity()

        # Get all rules for user
        rules = TransactionRule.query.filter_by(
            user_id=current_user_id
        ).order_by(TransactionRule.priority.desc(), TransactionRule.created_at.desc()).all()

        # Serialize
        result = [rule.to_dict() for rule in rules]

        return {
            'success': True,
            'rules': result,
            'count': len(result)
        }, 200

    @ns.doc('create_transaction_rule', security='Bearer')
    @ns.expect(rule_model)
    @jwt_required()
    def post(self):
        """Create a new transaction rule"""
        current_user_id = get_jwt_identity()
        data = request.get_json()

        try:
            # Validate required fields
            if not data.get('name') or not data.get('pattern'):
                return {
                    'success': False,
                    'error': 'Name and pattern are required'
                }, 400

            # Create new rule
            new_rule = TransactionRule(
                user_id=current_user_id,
                name=data['name'],
                pattern=data['pattern'],
                pattern_field=data.get('pattern_field', 'description'),
                is_regex=data.get('is_regex', False),
                case_sensitive=data.get('case_sensitive', False),
                amount_min=data.get('amount_min'),
                amount_max=data.get('amount_max'),
                transaction_type_filter=data.get('transaction_type_filter'),
                auto_category_id=data.get('auto_category_id'),
                auto_account_id=data.get('auto_account_id'),
                auto_transaction_type=data.get('auto_transaction_type'),
                auto_tags=data.get('auto_tags'),
                auto_notes=data.get('auto_notes'),
                priority=data.get('priority', 50),
                active=data.get('active', True)
            )

            db.session.add(new_rule)
            db.session.commit()

            return {
                'success': True,
                'rule': new_rule.to_dict(),
                'message': 'Rule created successfully'
            }, 201

        except Exception as e:
            db.session.rollback()
            return {
                'success': False,
                'error': str(e)
            }, 400


@ns.route('/<int:id>')
@ns.param('id', 'Rule ID')
class TransactionRuleDetail(Resource):
    @ns.doc('get_transaction_rule', security='Bearer')
    @jwt_required()
    def get(self, id):
        """Get a specific transaction rule"""
        current_user_id = get_jwt_identity()

        rule = TransactionRule.query.filter_by(
            id=id,
            user_id=current_user_id
        ).first()

        if not rule:
            return {'success': False, 'error': 'Rule not found'}, 404

        return {
            'success': True,
            'rule': rule.to_dict()
        }, 200

    @ns.doc('update_transaction_rule', security='Bearer')
    @ns.expect(rule_model)
    @jwt_required()
    def put(self, id):
        """Update a transaction rule"""
        current_user_id = get_jwt_identity()

        rule = TransactionRule.query.filter_by(
            id=id,
            user_id=current_user_id
        ).first()

        if not rule:
            return {'success': False, 'error': 'Rule not found'}, 404

        data = request.get_json()

        try:
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
            if 'amount_min' in data:
                rule.amount_min = data['amount_min']
            if 'amount_max' in data:
                rule.amount_max = data['amount_max']
            if 'transaction_type_filter' in data:
                rule.transaction_type_filter = data['transaction_type_filter']
            if 'auto_category_id' in data:
                rule.auto_category_id = data['auto_category_id']
            if 'auto_account_id' in data:
                rule.auto_account_id = data['auto_account_id']
            if 'auto_transaction_type' in data:
                rule.auto_transaction_type = data['auto_transaction_type']
            if 'auto_tags' in data:
                rule.auto_tags = data['auto_tags']
            if 'auto_notes' in data:
                rule.auto_notes = data['auto_notes']
            if 'priority' in data:
                rule.priority = data['priority']
            if 'active' in data:
                rule.active = data['active']

            rule.updated_at = datetime.utcnow()

            db.session.commit()

            return {
                'success': True,
                'rule': rule.to_dict(),
                'message': 'Rule updated successfully'
            }, 200

        except Exception as e:
            db.session.rollback()
            return {
                'success': False,
                'error': str(e)
            }, 400

    @ns.doc('delete_transaction_rule', security='Bearer')
    @jwt_required()
    def delete(self, id):
        """Delete a transaction rule"""
        current_user_id = get_jwt_identity()

        rule = TransactionRule.query.filter_by(
            id=id,
            user_id=current_user_id
        ).first()

        if not rule:
            return {'success': False, 'error': 'Rule not found'}, 404

        try:
            db.session.delete(rule)
            db.session.commit()

            return {
                'success': True,
                'message': 'Rule deleted successfully'
            }, 200

        except Exception as e:
            db.session.rollback()
            return {
                'success': False,
                'error': str(e)
            }, 400


@ns.route('/bulk-apply')
class BulkApplyRules(Resource):
    @ns.doc('bulk_apply_rules', security='Bearer')
    @jwt_required()
    def post(self):
        """Apply rules to all existing transactions"""
        current_user_id = get_jwt_identity()
        data = request.get_json() or {}

        rule_ids = data.get('rule_ids')  # Optional: specific rules to apply

        try:
            result = bulk_apply_rules(current_user_id, rule_ids)
            return result, 200 if result['success'] else 400

        except Exception as e:
            return {
                'success': False,
                'error': str(e)
            }, 400


@ns.route('/test')
class TestRule(Resource):
    @ns.doc('test_rule', security='Bearer')
    @jwt_required()
    def post(self):
        """Test a rule against sample transaction data"""
        current_user_id = get_jwt_identity()
        data = request.get_json()

        try:
            # Create temporary rule (don't save to DB)
            temp_rule = TransactionRule(
                user_id=current_user_id,
                name=data.get('name', 'Test Rule'),
                pattern=data['pattern'],
                pattern_field=data.get('pattern_field', 'description'),
                is_regex=data.get('is_regex', False),
                case_sensitive=data.get('case_sensitive', False),
                amount_min=data.get('amount_min'),
                amount_max=data.get('amount_max'),
                transaction_type_filter=data.get('transaction_type_filter'),
                auto_category_id=data.get('auto_category_id'),
                priority=data.get('priority', 50),
                active=True
            )

            # Test transaction data
            test_data = data.get('test_transaction', {})

            # Check if rule matches
            matches = temp_rule.matches(test_data)

            # If matches, show what would be applied
            result_data = None
            if matches:
                result_data = temp_rule.apply(test_data.copy())

            return {
                'success': True,
                'matches': matches,
                'test_transaction': test_data,
                'result': result_data if matches else None
            }, 200

        except Exception as e:
            return {
                'success': False,
                'error': str(e)
            }, 400


@ns.route('/suggest')
class SuggestRule(Resource):
    @ns.doc('suggest_rule_from_edit', security='Bearer')
    @jwt_required()
    def post(self):
        """Suggest a rule based on transaction edit"""
        current_user_id = get_jwt_identity()
        data = request.get_json()

        try:
            transaction_id = data.get('transaction_id')
            new_category_id = data.get('new_category_id')

            if not transaction_id or not new_category_id:
                return {
                    'success': False,
                    'error': 'transaction_id and new_category_id required'
                }, 400

            # Get transaction
            from src.models.transaction import Expense
            transaction = Expense.query.filter_by(
                id=transaction_id,
                user_id=current_user_id
            ).first()

            if not transaction:
                return {'success': False, 'error': 'Transaction not found'}, 404

            # Generate suggestion
            suggestion = suggest_rule_from_edit(
                transaction,
                new_category_id,
                current_user_id
            )

            if suggestion:
                return {
                    'success': True,
                    'suggestion': suggestion
                }, 200
            else:
                return {
                    'success': False,
                    'message': 'No suggestion available for this transaction'
                }, 200

        except Exception as e:
            return {
                'success': False,
                'error': str(e)
            }, 400


@ns.route('/stats')
class RuleStats(Resource):
    @ns.doc('get_rule_stats', security='Bearer')
    @jwt_required()
    def get(self):
        """Get statistics about rule usage"""
        current_user_id = get_jwt_identity()

        rules = TransactionRule.query.filter_by(user_id=current_user_id).all()

        total_rules = len(rules)
        active_rules = sum(1 for r in rules if r.active)
        total_matches = sum(r.match_count for r in rules)

        # Find most used rules
        most_used = sorted(rules, key=lambda r: r.match_count, reverse=True)[:5]

        return {
            'success': True,
            'stats': {
                'total_rules': total_rules,
                'active_rules': active_rules,
                'inactive_rules': total_rules - active_rules,
                'total_matches': total_matches,
                'most_used_rules': [
                    {
                        'id': r.id,
                        'name': r.name,
                        'match_count': r.match_count,
                        'last_matched': r.last_matched.isoformat() if r.last_matched else None
                    } for r in most_used
                ]
            }
        }, 200
