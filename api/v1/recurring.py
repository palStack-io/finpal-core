"""Recurring Transactions API endpoints"""
from flask import request
from flask_restx import Namespace, Resource, fields
from flask_jwt_extended import jwt_required, get_jwt_identity
from src.services.recurring.service import RecurringService
from src.models.recurring import RecurringExpense
from src.extensions import db
from schemas import recurring_schema, recurrings_schema

# Create namespace
ns = Namespace('recurring', description='Recurring transaction operations')

# Initialize service
recurring_service = RecurringService()

# Define request/response models
recurring_model = ns.model('RecurringExpense', {
    'description': fields.String(required=True, description='Transaction description'),
    'amount': fields.Float(required=True, description='Transaction amount'),
    'frequency': fields.String(required=True, description='Frequency: daily, weekly, monthly, yearly'),
    'start_date': fields.String(required=True, description='Start date (YYYY-MM-DD)'),
    'end_date': fields.String(description='End date (YYYY-MM-DD)'),
    'category_id': fields.Integer(description='Category ID'),
    'account_id': fields.Integer(description='Account ID'),
    'transaction_type': fields.String(description='Transaction type: expense, income, transfer'),
    'currency_code': fields.String(description='Currency code'),
})


@ns.route('/')
class RecurringList(Resource):
    @ns.doc('list_recurring', security='Bearer')
    @jwt_required()
    def get(self):
        """Get all recurring transactions for current user"""
        current_user_id = get_jwt_identity()

        recurring_expenses = recurring_service.get_all_recurring(current_user_id)

        # Serialize
        result = recurrings_schema.dump(recurring_expenses)

        return {
            'success': True,
            'recurring': result
        }, 200

    @ns.doc('create_recurring', security='Bearer')
    @ns.expect(recurring_model)
    @jwt_required()
    def post(self):
        """Create a new recurring transaction"""
        current_user_id = get_jwt_identity()
        data = request.get_json()

        try:
            success, message, recurring = recurring_service.add_recurring(
                user_id=current_user_id,
                description=data.get('description'),
                amount=data.get('amount'),
                frequency=data.get('frequency'),
                category_id=data.get('category_id'),
                start_date=data.get('start_date'),
                account_id=data.get('account_id'),
                currency_code=data.get('currency_code')
            )

            if not success:
                return {
                    'success': False,
                    'error': message
                }, 400

            result = recurring_schema.dump(recurring)

            return {
                'success': True,
                'recurring': result,
                'message': message
            }, 201

        except Exception as e:
            return {
                'success': False,
                'error': str(e)
            }, 400


@ns.route('/<int:id>')
@ns.param('id', 'Recurring transaction ID')
class RecurringDetail(Resource):
    @ns.doc('get_recurring', security='Bearer')
    @jwt_required()
    def get(self, id):
        """Get a specific recurring transaction by ID"""
        current_user_id = get_jwt_identity()

        recurring = recurring_service.get_recurring(id, current_user_id)

        if not recurring:
            return {'success': False, 'error': 'Recurring transaction not found or access denied'}, 404

        result = recurring_schema.dump(recurring)

        return {
            'success': True,
            'recurring': result
        }, 200

    @ns.doc('update_recurring', security='Bearer')
    @ns.expect(recurring_model)
    @jwt_required()
    def put(self, id):
        """Update a recurring transaction"""
        current_user_id = get_jwt_identity()
        data = request.get_json()

        try:
            success, message = recurring_service.update_recurring(
                recurring_id=id,
                user_id=current_user_id,
                **data
            )

            if not success:
                return {
                    'success': False,
                    'error': message
                }, 400

            recurring = recurring_service.get_recurring(id, current_user_id)
            result = recurring_schema.dump(recurring)

            return {
                'success': True,
                'recurring': result,
                'message': message
            }, 200

        except Exception as e:
            return {
                'success': False,
                'error': str(e)
            }, 400

    @ns.doc('delete_recurring', security='Bearer')
    @jwt_required()
    def delete(self, id):
        """Delete a recurring transaction"""
        current_user_id = get_jwt_identity()

        try:
            success, message = recurring_service.delete_recurring(id, current_user_id)

            if not success:
                return {
                    'success': False,
                    'error': message
                }, 404

            return {
                'success': True,
                'message': message
            }, 200

        except Exception as e:
            return {
                'success': False,
                'error': str(e)
            }, 400


@ns.route('/<int:id>/toggle')
@ns.param('id', 'Recurring transaction ID')
class RecurringToggle(Resource):
    @ns.doc('toggle_recurring', security='Bearer')
    @jwt_required()
    def post(self, id):
        """Toggle active status of recurring transaction"""
        current_user_id = get_jwt_identity()

        try:
            success, message, active = recurring_service.toggle_recurring(id, current_user_id)

            if not success:
                return {
                    'success': False,
                    'error': message
                }, 400

            return {
                'success': True,
                'active': active,
                'message': message
            }, 200

        except Exception as e:
            return {
                'success': False,
                'error': str(e)
            }, 400


@ns.route('/detect')
class RecurringDetect(Resource):
    @ns.doc('detect_patterns', security='Bearer')
    @jwt_required()
    def get(self):
        """Detect recurring transaction patterns"""
        current_user_id = get_jwt_identity()

        try:
            patterns = recurring_service.detect_recurring_patterns(current_user_id)

            return {
                'success': True,
                'patterns': patterns
            }, 200

        except Exception as e:
            return {
                'success': False,
                'error': str(e),
                'patterns': []
            }, 500


@ns.route('/ignore')
class RecurringIgnore(Resource):
    @ns.doc('ignore_pattern', security='Bearer')
    @jwt_required()
    def post(self):
        """Ignore a detected recurring pattern"""
        current_user_id = get_jwt_identity()
        data = request.get_json()

        pattern_key = data.get('pattern_key')
        if not pattern_key:
            return {
                'success': False,
                'error': 'Pattern key is required'
            }, 400

        try:
            success, message = recurring_service.ignore_pattern(current_user_id, pattern_key)

            if not success:
                return {
                    'success': False,
                    'error': message
                }, 400

            return {
                'success': True,
                'message': message
            }, 200

        except Exception as e:
            return {
                'success': False,
                'error': str(e)
            }, 400


@ns.route('/create-from-pattern')
class RecurringFromPattern(Resource):
    @ns.doc('create_from_pattern', security='Bearer')
    @jwt_required()
    def post(self):
        """Create recurring transaction from detected pattern"""
        current_user_id = get_jwt_identity()
        data = request.get_json()

        pattern_key = data.get('pattern_key')
        if not pattern_key:
            return {
                'success': False,
                'error': 'Pattern key is required'
            }, 400

        try:
            # Get the detected patterns to find the matching one
            patterns = recurring_service.detect_recurring_patterns(current_user_id)
            pattern = next((p for p in patterns if p.get('pattern_key') == pattern_key), None)

            if not pattern:
                return {
                    'success': False,
                    'error': 'Pattern not found'
                }, 404

            # Create recurring from pattern
            success, message, recurring = recurring_service.add_recurring(
                user_id=current_user_id,
                description=pattern.get('description'),
                amount=pattern.get('amount'),
                frequency=pattern.get('frequency'),
                category_id=pattern.get('category_id'),
                start_date=pattern.get('start_date')
            )

            if not success:
                return {
                    'success': False,
                    'error': message
                }, 400

            result = recurring_schema.dump(recurring)

            return {
                'success': True,
                'recurring': result,
                'message': 'Recurring transaction created from pattern successfully'
            }, 201

        except Exception as e:
            return {
                'success': False,
                'error': str(e)
            }, 400
