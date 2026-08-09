"""Budgets API endpoints"""
from flask import request
from flask_restx import Namespace, Resource, fields
from flask_jwt_extended import jwt_required, get_jwt_identity
from src.models.budget import Budget
from src.extensions import db
from schemas import budget_schema, budgets_schema
from schemas.input_schemas import budget_input
from src.utils.validation import validate_request, validation_error_response
from src.services.budget.service import BudgetService
from datetime import datetime
import logging
from src.models.personal_access_token import SCOPE_READ
from src.utils.api_auth import api_auth_required

logger = logging.getLogger(__name__)

# Create namespace
ns = Namespace('budgets', description='Budget operations')

# Define request/response models
budget_model = ns.model('Budget', {
    'name': fields.String(required=True, description='Budget name'),
    'amount': fields.Float(required=True, description='Budget amount'),
    'period': fields.String(required=True, description='Budget period (monthly, weekly, yearly)'),
    'category_id': fields.Integer(description='Category ID'),
    'start_date': fields.Date(description='Start date'),
    'end_date': fields.Date(description='End date'),
    'is_active': fields.Boolean(description='Whether budget is active'),
})


@ns.route('/')
class BudgetList(Resource):
    @ns.doc('list_budgets', security='Bearer')
    # Accepts a personal access token as well as a session, so an MCP
    # client or script can read. Reads need authentication only; the
    # write tiering is separate and unchanged.
    @api_auth_required(scope=SCOPE_READ)
    def get(self):
        """Get all budgets for household"""
        from src.utils.household import get_all_user_ids
        current_user_id = get_jwt_identity()

        try:
            # Get all budgets for the household
            budgets = Budget.query.filter(Budget.user_id.in_(get_all_user_ids())).all()

            # Serialize
            result = budgets_schema.dump(budgets)

            return {
                'success': True,
                'budgets': result
            }, 200
        except Exception as e:
            logger.exception("Failed to list budgets")
            return {'success': False, 'error': 'Internal server error'}, 500

    @ns.doc('create_budget', security='Bearer')
    @ns.expect(budget_model)
    @jwt_required()
    def post(self):
        """Create a new budget"""
        current_user_id = get_jwt_identity()
        data = request.get_json()

        validated, errors = validate_request(budget_input, data)
        if errors:
            return validation_error_response(errors)

        svc = BudgetService()
        success, message, new_budget = svc.add_budget(
            user_id=current_user_id,
            category_id=validated.get('category_id'),
            amount=validated['amount'],
            period=validated['period'],
            name=validated['name'],
            start_date=validated.get('start_date'),
            include_subcategories=validated.get('include_subcategories', True),
            rollover=validated.get('rollover', False),
            transaction_types=data.get('transaction_types', 'expense'),
            active=validated.get('is_active', True),
        )

        if not success:
            return {'success': False, 'error': message}, 400

        result = budget_schema.dump(new_budget)
        return {'success': True, 'budget': result, 'message': 'Budget created successfully'}, 201


def _household_budget(budget_id):
    """A budget by id, if it belongs to this household.

    *** THE LIST AND THE PERMISSIONS HAVE TO AGREE. *** The collection endpoint
    has always been household-wide ("Get all budgets for household"), while
    these four routes were `filter_by(user_id=current_user_id)` — so a member
    saw every household budget and got a 404 opening, editing or deleting any
    but their own. That is "a row you can see becomes a row you cannot edit",
    which is the exact failure D-20 called out and fixed for categories; budgets
    were the sibling nobody swept.

    `household_user_ids()`, not `get_all_user_ids()` — the latter includes demo
    accounts by its own docstring, and D-42 is the row where that leaked.
    """
    from src.utils.household import household_user_ids

    return Budget.query.filter(
        Budget.id == budget_id,
        Budget.user_id.in_(household_user_ids()),
    ).first()

@ns.route('/<int:id>')
@ns.param('id', 'Budget ID')
class BudgetDetail(Resource):
    @ns.doc('get_budget', security='Bearer')
    @jwt_required()
    def get(self, id):
        """Get a specific budget by ID"""
        current_user_id = get_jwt_identity()

        budget = _household_budget(id)

        if not budget:
            return {'success': False, 'error': 'Budget not found'}, 404

        result = budget_schema.dump(budget)

        return {
            'success': True,
            'budget': result
        }, 200

    @ns.doc('update_budget', security='Bearer')
    @ns.expect(budget_model)
    @jwt_required()
    def put(self, id):
        """Update a budget"""
        current_user_id = get_jwt_identity()

        budget = _household_budget(id)

        if not budget:
            return {'success': False, 'error': 'Budget not found'}, 404

        data = request.get_json() or {}
        if not data:
            return {'success': False, 'error': 'Request body required'}, 400

        try:
            if 'name' in data:
                budget.name = data['name']
            if 'amount' in data:
                budget.amount = data['amount']
            if 'period' in data:
                budget.period = data['period']
            if 'category_id' in data:
                budget.category_id = data['category_id']
            if 'active' in data:
                budget.active = data['active']
            if 'is_recurring' in data:
                budget.is_recurring = data['is_recurring']
            if 'include_subcategories' in data:
                budget.include_subcategories = data['include_subcategories']
            if 'transaction_types' in data:
                budget.transaction_types = data['transaction_types']
            if 'start_date' in data:
                if isinstance(data['start_date'], str):
                    budget.start_date = datetime.fromisoformat(data['start_date'])
                else:
                    budget.start_date = data['start_date']
            if 'rollover' in data:
                budget.rollover = data['rollover']
            if 'rollover_amount' in data:
                budget.rollover_amount = data['rollover_amount']

            db.session.commit()

            result = budget_schema.dump(budget)

            return {
                'success': True,
                'budget': result,
                'message': 'Budget updated successfully'
            }, 200

        except Exception as e:
            db.session.rollback()
            return {
                'success': False,
                'error': 'Internal server error'
            }, 400

    @ns.doc('delete_budget', security='Bearer')
    @jwt_required()
    def delete(self, id):
        """Delete a budget"""
        current_user_id = get_jwt_identity()

        budget = _household_budget(id)

        if not budget:
            return {'success': False, 'error': 'Budget not found'}, 404

        try:
            db.session.delete(budget)
            db.session.commit()

            return {
                'success': True,
                'message': 'Budget deleted successfully'
            }, 200

        except Exception as e:
            db.session.rollback()
            return {
                'success': False,
                'error': 'Internal server error'
            }, 400


@ns.route('/overview')
class BudgetOverview(Resource):
    @ns.doc('get_budget_overview', security='Bearer')
    @jwt_required()
    def get(self):
        """Get budget overview with total budget, spent, and remaining"""
        from src.utils.household import get_all_user_ids
        current_user_id = get_jwt_identity()

        try:
            budgets = Budget.query.filter(Budget.user_id.in_(get_all_user_ids()), Budget.active == True).all()

            total_budget = 0
            total_spent = 0
            budget_details = []

            for budget in budgets:
                spent = budget.get_spent() if hasattr(budget, 'get_spent') else 0
                remaining = budget.get_remaining() if hasattr(budget, 'get_remaining') else budget.amount
                percentage = budget.get_percentage() if hasattr(budget, 'get_percentage') else 0

                total_budget += budget.amount
                total_spent += spent

                # Serialize budget with additional spending info
                budget_dict = budget_schema.dump(budget)
                budget_dict['spent'] = spent
                budget_dict['remaining'] = remaining
                budget_dict['percentage'] = percentage

                budget_details.append(budget_dict)

            total_remaining = total_budget - total_spent

            return {
                'success': True,
                'total_budget': total_budget,
                'total_spent': total_spent,
                'total_remaining': total_remaining,
                'percentage_used': (total_spent / total_budget * 100) if total_budget > 0 else 0,
                'budget_count': len(budgets),
                'budgets': budget_details
            }, 200

        except Exception as e:
            return {'success': False, 'error': 'Internal server error'}, 500


@ns.route('/<int:id>/progress')
@ns.param('id', 'Budget ID')
class BudgetProgress(Resource):
    @ns.doc('get_budget_progress', security='Bearer')
    @jwt_required()
    def get(self, id):
        """Get budget progress and spending details"""
        current_user_id = get_jwt_identity()

        budget = _household_budget(id)

        if not budget:
            return {'success': False, 'error': 'Budget not found'}, 404

        # Calculate spending if methods exist
        spent = budget.get_spent() if hasattr(budget, 'get_spent') else 0
        remaining = budget.get_remaining() if hasattr(budget, 'get_remaining') else budget.amount
        percentage = budget.get_percentage() if hasattr(budget, 'get_percentage') else 0

        return {
            'success': True,
            'budget_id': budget.id,
            'budget_name': budget.name,
            'budget_amount': budget.amount,
            'spent': spent,
            'remaining': remaining,
            'percentage': percentage,
            'status': 'over_budget' if spent > budget.amount else 'on_track' if percentage < 80 else 'warning'
        }, 200
