"""Recurring Transactions API endpoints"""
from flask import request
from flask_restx import Namespace, Resource, fields
from flask_jwt_extended import jwt_required, get_jwt_identity
from src.services.recurring.service import RecurringService
from src.models.recurring import RecurringExpense
from src.extensions import db
from schemas import recurring_schema, recurrings_schema
from schemas.input_schemas import recurring_input
from src.utils.validation import validate_request, validation_error_response
import logging
from src.models.personal_access_token import SCOPE_READ
from src.utils.api_auth import api_auth_required

logger = logging.getLogger(__name__)

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
    # Backs the MCP get_recurring_transactions tool.
    @api_auth_required(scope=SCOPE_READ)
    def get(self):
        """Get all recurring transactions for current user"""
        current_user_id = get_jwt_identity()

        try:
            recurring_expenses = recurring_service.get_all_recurring(current_user_id)

            # Serialize
            result = recurrings_schema.dump(recurring_expenses)

            return {
                'success': True,
                'recurring': result
            }, 200

        except Exception as e:
            logger.exception("Failed to list recurring transactions")
            return {'success': False, 'error': 'Internal server error', 'recurring': []}, 500

    @ns.doc('create_recurring', security='Bearer')
    @ns.expect(recurring_model)
    @jwt_required()
    def post(self):
        """Create a new recurring transaction"""
        current_user_id = get_jwt_identity()
        data = request.get_json()

        validated, errors = validate_request(recurring_input, data)
        if errors:
            return validation_error_response(errors)

        try:
            success, message, recurring = recurring_service.add_recurring(
                user_id=current_user_id,
                description=validated['description'],
                amount=validated['amount'],
                frequency=validated['frequency'],
                category_id=validated.get('category_id'),
                start_date=validated.get('start_date'),
                account_id=validated.get('account_id'),
                currency_code=validated.get('currency_code'),
                # #133: declared on RecurringInput and validated, then left out of this
                # call, so an income rule was stored with the model's 'expense' default.
                transaction_type=validated.get('transaction_type'),
                destination_account_id=validated.get('destination_account_id')
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
            # Logged, not swallowed: this handler used to discard the exception
            # entirely, so a 500 reached the user as a bare "Internal server
            # error" with NOTHING in the container log. See #124.
            logger.exception('RecurringList.post failed')
            return {
                'success': False,
                'error': 'Internal server error'
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
        data = request.get_json() or {}
        if not data:
            return {'success': False, 'error': 'Request body required'}, 400

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
            # Logged, not swallowed: this handler used to discard the exception
            # entirely, so a 500 reached the user as a bare "Internal server
            # error" with NOTHING in the container log. See #124.
            logger.exception('RecurringDetail.put failed')
            return {
                'success': False,
                'error': 'Internal server error'
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
            # Logged, not swallowed: this handler used to discard the exception
            # entirely, so a 500 reached the user as a bare "Internal server
            # error" with NOTHING in the container log. See #124.
            logger.exception('RecurringDetail.delete failed')
            return {
                'success': False,
                'error': 'Internal server error'
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
            # Logged, not swallowed: this handler used to discard the exception
            # entirely, so a 500 reached the user as a bare "Internal server
            # error" with NOTHING in the container log. See #124.
            logger.exception('RecurringToggle.post failed')
            return {
                'success': False,
                'error': 'Internal server error'
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
            # Logged, not swallowed: this handler used to discard the exception
            # entirely, so a 500 reached the user as a bare "Internal server
            # error" with NOTHING in the container log. See #124.
            logger.exception('RecurringDetect.get failed')
            return {
                'success': False,
                'error': 'Internal server error',
                'patterns': []
            }, 500


ignore_pattern_model = ns.model('IgnorePattern', {
    'pattern_key': fields.String(required=True, description='Key of the detected pattern to ignore'),
})

create_from_pattern_model = ns.model('CreateFromPattern', {
    'pattern_key': fields.String(required=True, description='Key of the detected pattern'),
    # The rest override what the detector inferred; all optional.
    'description': fields.String(required=False, description='Override the description'),
    'amount': fields.Float(required=False, description='Override the amount'),
    'frequency': fields.String(required=False, description='Override the frequency'),
    'start_date': fields.String(required=False, description='Override the start date (YYYY-MM-DD)'),
    'category_id': fields.Integer(required=False, description='Override the category'),
})


@ns.route('/ignore')
class RecurringIgnore(Resource):
    @ns.doc('ignore_pattern', security='Bearer')
    @ns.expect(ignore_pattern_model)
    @jwt_required()
    def post(self):
        """Ignore a detected recurring pattern"""
        current_user_id = get_jwt_identity()
        data = request.get_json() or {}

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
            # Logged, not swallowed: this handler used to discard the exception
            # entirely, so a 500 reached the user as a bare "Internal server
            # error" with NOTHING in the container log. See #124.
            logger.exception('RecurringIgnore.post failed')
            return {
                'success': False,
                'error': 'Internal server error'
            }, 400


@ns.route('/create-from-pattern')
class RecurringFromPattern(Resource):
    @ns.doc('create_from_pattern', security='Bearer')
    @ns.expect(create_from_pattern_model)
    @jwt_required()
    def post(self):
        """Create recurring transaction from detected pattern"""
        current_user_id = get_jwt_identity()
        data = request.get_json() or {}

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
                start_date=pattern.get('start_date'),
                # The detector already puts a transaction_type in the pattern dict; this
                # call dropped it, so a detected INCOME series became an expense rule.
                # This is web-ui's only create path (D-80), which is what makes #133
                # every client's bug rather than mobile's.
                transaction_type=pattern.get('transaction_type')
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
            # Logged, not swallowed: this handler used to discard the exception
            # entirely, so a 500 reached the user as a bare "Internal server
            # error" with NOTHING in the container log. See #124.
            logger.exception('RecurringFromPattern.post failed')
            return {
                'success': False,
                'error': 'Internal server error'
            }, 400
