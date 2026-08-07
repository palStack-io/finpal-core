"""Analytics API endpoints - Dashboard and Statistics"""
from flask import jsonify, request
from flask_restx import Namespace, Resource
from flask_jwt_extended import jwt_required, get_jwt_identity
from src.models.personal_access_token import SCOPE_READ
from src.services.analytics.service import AnalyticsService
from src.services.analytics.spending_summary import (
    GROUP_CATEGORY, InvalidSummaryRequest, parse_date, spending_summary)
from src.utils.api_auth import api_auth_required
from src.utils.household import member_read_scope
import logging

logger = logging.getLogger(__name__)


def _months_arg(default=6, maximum=60):
    """Read ?months=, or None if it is not a usable number.

    Returning None rather than falling back keeps a typo from silently producing a
    different chart than the one the client asked for.
    """
    raw = request.args.get('months')
    if raw is None:
        return default
    try:
        months = int(raw)
    except (TypeError, ValueError):
        return None
    return months if 1 <= months <= maximum else None


# Create namespace
ns = Namespace('analytics', description='Analytics and dashboard operations')

# Initialize service
analytics_service = AnalyticsService()


def _serialize_expense(exp):
    """One expense as plain JSON.

    `AnalyticsService.get_dashboard_data` returns live SQLAlchemy `Expense`
    instances under `expenses`, so serialization has to be explicit. Walking
    `__dict__` instead recurses through `_sa_instance_state` and the
    relationship back-references until Python gives up — see `Statistics.get`.
    """
    return {
        'id': exp.id,
        'description': exp.description,
        'amount': exp.amount,
        'date': exp.date.isoformat() if exp.date else None,
        'transaction_type': getattr(exp, 'transaction_type', 'expense'),
        'category': {
            'name': exp.category.name,
            'color': exp.category.color,
            'icon': exp.category.icon,
        } if exp.category else 'Uncategorized',
        'account': {
            'name': exp.account.name,
            'color': getattr(exp.account, 'color', None),
        } if exp.account else 'Unknown',
    }


def _serialize_dashboard(dashboard_data):
    """The dashboard payload: only the fields a client reads, all JSON-safe.

    Shared with `/analytics/stats`, which used to build its response by walking
    the same dict with a recursive `convert_to_dict`.
    """
    serialized_expenses = []
    for exp in (dashboard_data.get('expenses') or []):
        try:
            serialized_expenses.append(_serialize_expense(exp))
        except Exception:
            logger.exception('Skipping an expense that would not serialize')
            continue

    return {
        'net_worth': dashboard_data.get('net_worth', 0) or 0,
        'total_income': dashboard_data.get('total_income', 0) or 0,
        'total_expenses_only': dashboard_data.get('total_expenses_only', 0) or 0,
        'total_expenses': dashboard_data.get('total_expenses', 0) or 0,
        'current_month_total': dashboard_data.get('current_month_total', 0) or 0,
        'current_month_expenses_only': dashboard_data.get('current_month_expenses_only', 0) or 0,
        'current_month_income': dashboard_data.get('current_month_income', 0) or 0,
        'net_cash_flow': dashboard_data.get('net_cash_flow', 0) or 0,
        'savings_rate': dashboard_data.get('savings_rate', 0) or 0,
        'total_assets': dashboard_data.get('total_assets', 0) or 0,
        'total_debts': dashboard_data.get('total_debts', 0) or 0,
        'investment_total': dashboard_data.get('investment_total', 0) or 0,
        'expenses': serialized_expenses,
        'top_categories': dashboard_data.get('top_categories', []),
        'monthly_labels': dashboard_data.get('monthly_labels', []),
        'monthly_amounts': dashboard_data.get('monthly_amounts', []),
    }


def _member_scope():
    """`(scope_ids, error_response)` for this request's `?member_id=`.

    D-56. Every analytics endpoint a client renders takes the same filter, and
    they move together on purpose: a page whose charts followed a control while
    the ones beside them ignored it is D-51, and `Analytics.tsx` draws all seven
    on one screen.

    An id outside the caller's scope is **403**, never an empty chart. Seven
    silently-empty charts would be a worse lie than the per-chart tags this
    replaces, because nothing on the page would say why.
    """
    member_id = request.args.get('member_id') or None
    scope_ids = member_read_scope(get_jwt_identity(), member_id)
    if scope_ids is None:
        return None, ({'success': False,
                       'error': 'That member is not in your household.'}, 403)
    return scope_ids, None


MEMBER_PARAM = {'member_id': 'Narrow every figure to one household member '
                             '(their accounts, plus any account-less rows they '
                             'entered). Omit for the whole household. An id '
                             'outside your household is a 403.'}


@ns.route('/dashboard')
class Dashboard(Resource):
    @ns.doc('get_dashboard_data', security='Bearer',
            params={'member_id': 'Narrow every figure to one household member '
                                 '(their accounts, plus any account-less rows '
                                 'they entered). Omit for the whole household. '
                                 'An id outside your household is a 403.'})
    @jwt_required()
    def get(self):
        """Get dashboard overview data with metrics, charts, and categories"""
        current_user_id = get_jwt_identity()

        # D-18 item E. Resolved here rather than inside the service so the refusal
        # is an HTTP answer rather than an exception crossing a layer — and so the
        # service keeps taking a plain list of ids, which is what lets
        # `/analytics/networth` and `/analytics/stats` reuse it unchanged.
        member_id = request.args.get('member_id') or None
        scope_ids = member_read_scope(current_user_id, member_id)
        if scope_ids is None:
            # 403, never an empty dashboard. A dashboard of zeroes is
            # indistinguishable from a member who has nothing, so honouring an id
            # the server rejects would make the filter lie in the quietest way
            # available to it.
            return {'success': False,
                    'error': 'That member is not in your household.'}, 403

        try:
            # Get dashboard data from service
            dashboard_data = analytics_service.get_dashboard_data(
                current_user_id, scope_ids=scope_ids)
            serializable_data = _serialize_dashboard(dashboard_data)

            return {
                'success': True,
                'data': serializable_data
            }, 200

        except Exception as e:
            logger.exception("Dashboard data fetch failed")
            return {'success': False, 'error': 'Internal server error'}, 500


@ns.route('/stats')
class Statistics(Resource):
    @ns.doc('get_statistics', security='Bearer', params=MEMBER_PARAM)
    @jwt_required()
    def get(self):
        """Get detailed statistics and charts data"""
        current_user_id = get_jwt_identity()
        scope_ids, refusal = _member_scope()
        if refusal:
            return refusal


        try:
            stats_data = analytics_service.get_stats_data(current_user_id, scope_ids=scope_ids)

            # This endpoint used to 500 on every call. `get_stats_data` returns
            # `get_dashboard_data`'s dict, which holds live SQLAlchemy `Expense`
            # instances, and the response was built by a local `convert_to_dict`
            # that recursed into `obj.__dict__` for anything with one. On an ORM
            # instance that reaches `_sa_instance_state` and the relationship
            # back-references, so it recursed until `RecursionError`.
            #
            # Nothing calls this endpoint, which is why a route that could never
            # succeed went unnoticed. Serialized explicitly now, the same way
            # `/dashboard` does, plus the fields stats adds on top.
            serializable_data = _serialize_dashboard(stats_data)
            serializable_data.update({
                'monthly_income': stats_data.get('monthly_income', []),
                'category_names': stats_data.get('category_names', []),
                'category_totals': stats_data.get('category_totals', []),
                'tag_names': stats_data.get('tag_names', []),
                'tag_totals': stats_data.get('tag_totals', []),
                'tag_colors': stats_data.get('tag_colors', []),
                'liquidity_ratio': stats_data.get('liquidity_ratio', 0),
                'account_growth': stats_data.get('account_growth', 0),
                'spending_trend': stats_data.get('spending_trend', 0),
                'net_balance': stats_data.get('net_balance', 0),
            })

            return {
                'success': True,
                'data': serializable_data
            }, 200

        except Exception as e:
            logger.exception("Statistics fetch failed")
            return {
                'success': False,
                'error': 'Internal server error'
            }, 500


@ns.route('/trends')
class Trends(Resource):
    @ns.doc('get_spending_trends', security='Bearer', params=MEMBER_PARAM)
    @jwt_required()
    def get(self):
        """Get spending trends over time"""
        current_user_id = get_jwt_identity()
        scope_ids, refusal = _member_scope()
        if refusal:
            return refusal


        try:
            # Get trends from service (if method exists)
            if hasattr(analytics_service, 'get_spending_trends'):
                trends = analytics_service.get_spending_trends(current_user_id)
            else:
                # Fallback: use dashboard data for trends
                dashboard_data = analytics_service.get_dashboard_data(
                    current_user_id, scope_ids=scope_ids)
                trends = {
                    'monthly_labels': dashboard_data.get('monthly_labels', []),
                    'monthly_expenses': dashboard_data.get('monthly_expenses', []),
                    'monthly_income': dashboard_data.get('monthly_income', []),
                }

            return {
                'success': True,
                'trends': trends
            }, 200

        except Exception as e:
            logger.exception("Spending trends fetch failed")
            return {
                'success': False,
                'error': 'Internal server error'
            }, 500


@ns.route('/categories/top')
class TopCategories(Resource):
    @ns.doc('get_top_spending_categories', security='Bearer',
            params={**MEMBER_PARAM,
                'limit': 'Maximum categories to return (default 8, max 50)',
                'start_date': 'Inclusive ISO start date, e.g. 2026-03-01',
                'end_date': 'Inclusive ISO end date',
                'type': "'expense' (default) or 'income'",
            })
    @jwt_required()
    def get(self):
        """Get top categories by total, for a date range and direction"""
        current_user_id = get_jwt_identity()
        scope_ids, refusal = _member_scope()
        if refusal:
            return refusal


        # These three were always sent by the web UI and always discarded: the
        # handler called get_dashboard_data(), whose category figures are pinned
        # to the current calendar month. Week and Year therefore rendered the
        # same numbers as Month.
        try:
            limit = min(max(int(request.args.get('limit', 8)), 1), 50)
        except (TypeError, ValueError):
            return {'success': False, 'error': 'limit must be an integer'}, 400

        try:
            start = parse_date(request.args['start_date'], 'start_date') \
                if request.args.get('start_date') else None
            end = parse_date(request.args['end_date'], 'end_date') \
                if request.args.get('end_date') else None
        except InvalidSummaryRequest as exc:
            return {'success': False, 'error': str(exc)}, 400

        if start and end and end < start:
            return {'success': False,
                    'error': 'end_date must not precede start_date'}, 400

        if end is not None:
            end = end.replace(hour=23, minute=59, second=59)

        transaction_type = request.args.get('type', 'expense')
        if transaction_type not in ('expense', 'income'):
            return {'success': False,
                    'error': "type must be 'expense' or 'income'"}, 400

        try:
            categories = analytics_service.get_top_categories(
                current_user_id, limit=limit, start=start, end=end,
                transaction_type=transaction_type, scope_ids=scope_ids)

            return {
                'success': True,
                'categories': categories
            }, 200

        except Exception:
            logger.exception('Failed to load top categories')
            return {
                'success': False,
                'error': 'Internal server error'
            }, 500


@ns.route('/summary')
class Summary(Resource):
    @ns.doc('get_financial_summary', security='Bearer', params=MEMBER_PARAM)
    @jwt_required()
    def get(self):
        """Get high-level financial summary (for dashboard metrics cards)"""
        current_user_id = get_jwt_identity()
        scope_ids, refusal = _member_scope()
        if refusal:
            return refusal


        try:
            dashboard_data = analytics_service.get_dashboard_data(
                current_user_id, scope_ids=scope_ids)

            # Extract key metrics for dashboard cards
            summary = {
                'monthly_spending': dashboard_data.get('total_expenses_only', 0),
                'net_balance': getattr(dashboard_data.get('iou_data'), 'net_balance', 0) if dashboard_data.get('iou_data') else 0,
                'total_assets': dashboard_data.get('total_assets', 0),
                'budget_remaining': self._calculate_budget_remaining(dashboard_data),
                'currency_symbol': dashboard_data.get('base_currency', {}).get('symbol', '$'),
                'currency_code': dashboard_data.get('base_currency', {}).get('code', 'USD'),
            }

            return {
                'success': True,
                'summary': summary
            }, 200

        except Exception as e:
            logger.exception("Financial summary fetch failed")
            return {
                'success': False,
                'error': 'Internal server error'
            }, 500

    def _calculate_budget_remaining(self, dashboard_data):
        """Calculate total budget remaining across all budgets"""
        budget_summary = dashboard_data.get('budget_summary')
        if budget_summary and hasattr(budget_summary, '__dict__'):
            return getattr(budget_summary, 'total_remaining', 0)
        return 0


@ns.route('/cashflow')
class CashFlow(Resource):
    @ns.doc('get_cashflow_data', security='Bearer', params=MEMBER_PARAM)
    @jwt_required()
    def get(self):
        """Get cash flow data (monthly income, expenses, and savings)"""
        current_user_id = get_jwt_identity()
        scope_ids, refusal = _member_scope()
        if refusal:
            return refusal


        # months was accepted by the service and never sent by the route, so the
        # Week/Month/Year selector could not change this chart.
        months = _months_arg()
        if months is None:
            return {'success': False, 'error': 'months must be between 1 and 60'}, 400

        try:
            cashflow_data = analytics_service.get_cashflow_data(current_user_id, months=months, scope_ids=scope_ids)

            return {
                'success': True,
                'cashflow': cashflow_data
            }, 200

        except Exception as e:
            logger.exception("Cashflow data fetch failed")
            return {'success': False, 'error': 'Internal server error'}, 500


@ns.route('/health')
class FinancialHealth(Resource):
    @ns.doc('get_financial_health', security='Bearer', params=MEMBER_PARAM)
    @jwt_required()
    def get(self):
        """Get financial health metrics (debt-to-income, emergency fund, liquidity, etc.)"""
        current_user_id = get_jwt_identity()
        scope_ids, refusal = _member_scope()
        if refusal:
            return refusal


        try:
            health_data = analytics_service.get_financial_health(current_user_id, scope_ids=scope_ids)

            return {
                'success': True,
                'health': health_data
            }, 200

        except Exception as e:
            logger.exception("Financial health fetch failed")
            return {'success': False, 'error': 'Internal server error'}, 500


@ns.route('/networth')
class NetWorth(Resource):
    @ns.doc('get_networth_trend', security='Bearer', params=MEMBER_PARAM)
    # Backs the MCP get_net_worth_trend tool.
    @api_auth_required(scope=SCOPE_READ)
    def get(self):
        """Get net worth trend data (assets, liabilities, net worth over time)"""
        current_user_id = get_jwt_identity()
        scope_ids, refusal = _member_scope()
        if refusal:
            return refusal


        months = _months_arg()
        if months is None:
            return {'success': False, 'error': 'months must be between 1 and 60'}, 400

        try:
            networth_data = analytics_service.get_networth_trend(current_user_id, months=months, scope_ids=scope_ids)

            return {
                'success': True,
                'networth': networth_data
            }, 200

        except Exception as e:
            logger.exception("Net worth trend fetch failed")
            return {'success': False, 'error': 'Internal server error'}, 500


@ns.route('/monthly-comparison')
class MonthlyComparison(Resource):
    @ns.doc('get_monthly_comparison', security='Bearer', params=MEMBER_PARAM)
    @jwt_required()
    def get(self):
        """Get month-over-month comparison with percentage changes"""
        from flask import request
        current_user_id = get_jwt_identity()

        try:
            # Get months parameter (default to 6)
            months = request.args.get('months', default=6, type=int)

            # Get comparison data from service
            comparison_data = analytics_service.get_monthly_comparison(current_user_id, months, scope_ids=scope_ids)

            return {
                'success': True,
                'data': comparison_data
            }, 200

        except Exception as e:
            logger.exception("Monthly comparison fetch failed")
            return {'success': False, 'error': 'Internal server error'}, 500


@ns.route('/spending-summary')
class SpendingSummary(Resource):
    @ns.doc('get_spending_summary', security='Bearer')
    # Accepts a personal access token as well as a session: this is the endpoint
    # an MCP client relies on so a model never has to page raw rows.
    @api_auth_required(scope=SCOPE_READ)
    def get(self):
        """Spending totals grouped by category, merchant or month over a range."""
        user_id = get_jwt_identity()
        try:
            start = parse_date(request.args.get('start_date'), 'start_date')
            end = parse_date(request.args.get('end_date'), 'end_date')
            result = spending_summary(
                user_id, start, end,
                request.args.get('group_by') or GROUP_CATEGORY)
        except InvalidSummaryRequest as exc:
            # Authored, client-safe messages only — never str() of an arbitrary
            # exception.
            return {'success': False, 'error': str(exc)}, 400
        except Exception:
            logger.exception('Spending summary failed')
            return {'success': False, 'error': 'Could not compute the summary'}, 500

        result['success'] = True
        return result, 200
