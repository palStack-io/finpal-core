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
from src.services.budget.pace import pace_applies, pace_for
from datetime import datetime
import logging
from src.models.personal_access_token import SCOPE_READ
from src.utils.api_auth import api_auth_required
from src.models.transaction import Expense
from src.services.analytics.service import AnalyticsService
from src.services.category.spending_type import VALID_SPENDING_TYPES

#: The same three human labels the two clients hold in `spendingGroups.ts`.
#: 'Non-Monthly' for a person; 'non_monthly' for the database.
GROUP_LABELS = {
    'fixed': 'Fixed',
    'flexible': 'Flexible',
    'non_monthly': 'Non-Monthly',
}

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
        # `visible_user_ids(caller)`, NOT `get_all_user_ids()` — the latter includes
        # demo accounts by its own docstring, and pairing it with a detail route built
        # from a narrower helper is D-43/D-66: a row on screen its viewer cannot open.
        from src.utils.household import visible_user_ids
        current_user_id = get_jwt_identity()

        try:
            # Every budget this caller may see — the household for a member, itself
            # alone for a demo account.
            budgets = Budget.query.filter(
                Budget.user_id.in_(visible_user_ids(current_user_id))).all()

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
            # D-78: `.get`, because `name` is now optional -- the web form has no name
            # input and omitting the key entirely is a valid body. Indexing it raised
            # KeyError, which this handler's `except` would have reported as another
            # opaque 400.
            name=validated.get('name'),
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

    *** AND IT MUST BE THE CALLER'S SCOPE, NOT "THE HOUSEHOLD'S". *** This read
    `household_user_ids()` — right about demo accounts, wrong about *whose* view it
    is answering. That helper EXCLUDES demo accounts, so a demo caller 404'd on its
    own budget while the collection (built from `get_all_user_ids()`) cheerfully
    listed the whole instance's. Both halves of D-66: the list was too wide and the
    detail too narrow, and they failed past each other.

    `visible_user_ids(caller)` is the one helper that answers both — the household
    for a member, the caller alone for a demo account — and the module docstring in
    `src/utils/household.py` prescribes it for exactly this pairing.
    """
    from flask_jwt_extended import get_jwt_identity
    from src.utils.household import visible_user_ids

    return Budget.query.filter(
        Budget.id == budget_id,
        Budget.user_id.in_(visible_user_ids(get_jwt_identity())),
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
            # Logged, not swallowed: this handler used to discard the exception
            # entirely, so a 500 reached the user as a bare "Internal server
            # error" with NOTHING in the container log. See #124.
            logger.exception('BudgetDetail.put failed')
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
            # Logged, not swallowed: this handler used to discard the exception
            # entirely, so a 500 reached the user as a bare "Internal server
            # error" with NOTHING in the container log. See #124.
            logger.exception('BudgetDetail.delete failed')
            db.session.rollback()
            return {
                'success': False,
                'error': 'Internal server error'
            }, 400


def _f(value):
    """Coerce to float for arithmetic.

    `Budget.amount` is a float and `calculate_spent_amount()` returns a
    `Decimal`, so summing them raw raises `TypeError: unsupported operand
    type(s) for -: 'float' and 'decimal.Decimal'`. The pre-existing totals never
    hit it because they only ever ADD to an int accumulator; subtracting one
    from the other is new here.
    """
    return float(value or 0)


def _effective_spending_type(category, by_id):
    """A category's own group, or its parent's, or None.

    *** ONE LEVEL AND NO MORE, MIRRORING `budget.py:72`. *** That rollup reads
    `filter_by(parent_id=self.category_id)` with no recursion, so a budget on a
    grandchild never counts its grandparent's other children. Inheriting across
    two levels here would put that budget in a group whose subtotal the rollup
    never computed, and the page would disagree with the arithmetic underneath
    it. The same rule, and the same one-level limit, as the clients'
    `spendingGroups.ts`.
    """
    if category is None:
        return None
    if category.spending_type in VALID_SPENDING_TYPES:
        return category.spending_type
    if not category.parent_id or category.parent_id == category.id:
        return None
    parent = by_id.get(category.parent_id)
    if parent is None:
        return None
    return parent.spending_type if parent.spending_type in VALID_SPENDING_TYPES else None


def _group_by_spending_type(budgets, budget_details, scope_ids):
    """Split the budgets into the three groups, and report unbudgeted spending.

    *** THE SERVER OWNS THESE TOTALS (D-101). *** Two clients summing
    independently is two chances to disagree with each other and with the
    database, which is the rule that already keeps goal progress server-side.

    *** ALL THREE GROUPS ARE ALWAYS EMITTED, EVEN EMPTY. *** A group that
    vanishes when it has nothing in it makes the page jump around, and a missing
    key and a zero are different things to a client.
    """
    from src.models.category import Category

    all_categories = Category.query.filter(
        Category.user_id.in_(scope_ids)).all()
    by_id = {c.id: c for c in all_categories}

    buckets = {value: [] for value in VALID_SPENDING_TYPES}
    unsorted_budgets = []
    income_budgets = []

    for budget, detail in zip(budgets, budget_details):
        category = by_id.get(budget.category_id)
        # *** AN INCOME BUDGET IS NOT SPENDING AND MUST LEAVE THE EXPENSE SUMS
        # ENTIRELY — D-189. *** Before the `kind` column existed this fell into
        # `unsorted` and was summed as PLANNED SPENDING: on the live demo a
        # £4,500 budget on *Salary* took `totals.planned` from 1,400 to 5,900
        # and `remaining` to 5,554.46, telling the user they had money to spend
        # that they had not earned. `left_to_budget` (income − planned) then
        # subtracted the same row from income, so one row was wrong twice in
        # opposite directions.
        #
        # NULL `kind` is NOT income. It means "not stated", and the totals have
        # to put it somewhere — so it stays with the expenses, which is the safe
        # direction, and nothing on screen calls it an expense.
        if category is not None and category.kind == 'income':
            detail['kind'] = 'income'
            income_budgets.append(detail)
            continue
        detail['kind'] = (category.kind if category is not None else None) or 'expense'
        group = _effective_spending_type(category, by_id)
        (buckets[group] if group else unsorted_budgets).append(detail)

    groups = []
    for value in VALID_SPENDING_TYPES:
        rows = buckets[value]
        # Whether a pace mark can be read for this group at all. A
        # `non_monthly` group is *resupply that is not monthly* by definition:
        # an annual premium is not "behind" in March, it is not due, and
        # colouring it as behind invents an urgency the data does not support.
        for row in rows:
            row['pace_applies'] = pace_applies(row.get('period'), value)
        planned = round(sum(_f(r['amount']) for r in rows), 2)
        actual = round(sum(_f(r['spent']) for r in rows), 2)
        groups.append({
            'spending_type': value,
            'label': GROUP_LABELS[value],
            'planned': planned,
            'actual': actual,
            # Negative, never clamped: an overspend rendered as 0 is a lie the
            # user acts on.
            'remaining': round(planned - actual, 2),
            'budgets': rows,
        })

    unsorted = _unsorted_section(all_categories, by_id, scope_ids,
                                 unsorted_budgets)

    totals = {
        'planned': round(sum(g['planned'] for g in groups)
                         + sum(_f(r['amount']) for r in unsorted_budgets), 2),
        'actual': round(sum(g['actual'] for g in groups)
                        + unsorted['actual'], 2),
    }
    totals['remaining'] = round(totals['planned'] - totals['actual'], 2)

    # *** PLANNED INCOME IS ITS OWN SECTION WITH ITS OWN TOTALS, BECAUSE THE
    # COLUMNS MEAN DIFFERENT THINGS. *** "Remaining" on an expense is *still
    # available to spend*; on income it is *still to arrive*. Owner decision,
    # 2026-09-12: show both, labelled -- one figure answering two questions is
    # D-102's shape, the row where a caption said net worth rose 43% while the
    # line fell.
    income_section = {
        'planned': round(sum(_f(r['amount']) for r in income_budgets), 2),
        'received': round(sum(_f(r['spent']) for r in income_budgets), 2),
        'budgets': income_budgets,
    }
    income_section['still_to_come'] = round(
        income_section['planned'] - income_section['received'], 2)
    return groups, unsorted, totals, income_section


def _unsorted_section(all_categories, by_id, scope_ids, unsorted_budgets):
    """Unclassified categories that money has actually left through.

    *** UNBUDGETED SPENDING IS SHOWN, NOT HIDDEN. *** A budget page that lists
    only budgeted categories tells you your spending is under control while
    money leaves elsewhere -- so this section is mandatory, not optional.

    *** BUT ONLY CATEGORIES WITH SPENDING. *** Unsorted is a to-do list; padding
    it with every category nobody has spent against buries the real ones. On the
    demo that is the difference between five rows and a hundred and twenty.
    """
    from sqlalchemy import func
    from src.utils.household import scope_query

    period_start = datetime.utcnow().replace(day=1, hour=0, minute=0, second=0,
                                             microsecond=0)
    spend_rows = (scope_query(scope_ids)
                  .filter(Expense.date >= period_start)
                  .filter(Expense.transaction_type == 'expense')
                  .filter(Expense.category_id.isnot(None))
                  .with_entities(Expense.category_id,
                                 func.sum(Expense.amount))
                  .group_by(Expense.category_id)
                  .all())

    categories = []
    actual = 0.0
    for category_id, amount in spend_rows:
        category = by_id.get(category_id)
        if category is None:
            continue
        if _effective_spending_type(category, by_id) is not None:
            continue
        actual += float(amount or 0)
        categories.append({
            'id': category.id,
            'name': category.name,
            'actual': round(float(amount or 0), 2),
        })

    categories.sort(key=lambda c: c['actual'], reverse=True)
    return {
        'count': len(categories),
        'actual': round(actual, 2),
        'categories': categories,
        # Budgets whose category is unclassified. Separate from `count`, which
        # counts categories money left through -- a budget with no spending is
        # not a hole in the picture, an unclassified spend is.
        'budget_count': len(unsorted_budgets),
        'budgets': unsorted_budgets,
    }


@ns.route('/overview')
class BudgetOverview(Resource):
    @ns.doc('get_budget_overview', security='Bearer')
    @jwt_required()
    def get(self):
        """Get budget overview with total budget, spent, and remaining"""
        # Same rule as the collection above: the overview must total exactly the
        # budgets the caller is shown, or the summary disagrees with the list.
        from src.utils.household import visible_user_ids
        current_user_id = get_jwt_identity()

        try:
            budgets = Budget.query.filter(
                Budget.user_id.in_(visible_user_ids(current_user_id)),
                Budget.active == True).all()

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

            groups, unsorted, group_totals, income_section = _group_by_spending_type(
                budgets, budget_details, visible_user_ids(current_user_id))

            # *** None, NEVER 0. *** Zero is a claim that the user earned
            # nothing this month; None says nothing has been recorded yet.
            income = AnalyticsService().current_month_income(current_user_id)
            left_to_budget = (None if income is None
                              else round(income - group_totals['planned'], 2))

            return {
                'success': True,
                'total_budget': total_budget,
                'total_spent': total_spent,
                'total_remaining': total_remaining,
                'percentage_used': (total_spent / total_budget * 100) if total_budget > 0 else 0,
                'budget_count': len(budgets),
                'budgets': budget_details,
                # Additive. Everything above is the pre-existing contract, which
                # mobile and any script read today.
                'groups': groups,
                'unsorted': unsorted,
                'totals': group_totals,
                'income': income,
                'left_to_budget': left_to_budget,
                # D-189. Its own section: an income budget is not spending, and
                # its columns mean different things from an expense's.
                'income_section': income_section,
                # *** ONE PACE FIGURE FOR THE WHOLE PAYLOAD, NOT ONE PER ROW. ***
                # Every budget shares today's position in the month, so per-row
                # would repeat the same number N times and invite a client to
                # derive its own — and two clients working out "today"
                # independently is worse than for money: a phone in another
                # timezone would draw the mark in a different place from the
                # browser beside it. `pace_applies` decides PER ROW whether the
                # mark means anything, and the client says why in words when it
                # does not.
                'pace': pace_for(),
            }, 200

        except Exception as e:
            # Logged, not swallowed: this handler used to discard the exception
            # entirely, so a 500 reached the user as a bare "Internal server
            # error" with NOTHING in the container log. See #124.
            logger.exception('BudgetOverview.get failed')
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
