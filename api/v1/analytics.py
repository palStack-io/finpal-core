"""Analytics API endpoints - Dashboard and Statistics"""
from flask import jsonify
from flask_restx import Namespace, Resource
from flask_jwt_extended import jwt_required, get_jwt_identity
from src.services.analytics.service import AnalyticsService

# Create namespace
ns = Namespace('analytics', description='Analytics and dashboard operations')

# Initialize service
analytics_service = AnalyticsService()


@ns.route('/dashboard')
class Dashboard(Resource):
    @ns.doc('get_dashboard_data', security='Bearer')
    @jwt_required()
    def get(self):
        """Get dashboard overview data with metrics, charts, and categories"""
        current_user_id = get_jwt_identity()

        try:
            # Get dashboard data from service
            dashboard_data = analytics_service.get_dashboard_data(current_user_id)

            # Pre-serialize expenses into simple dicts (avoid deep SQLAlchemy serialization)
            serialized_expenses = []
            for exp in (dashboard_data.get('expenses') or []):
                try:
                    serialized_expenses.append({
                        'id': exp.id,
                        'description': exp.description,
                        'amount': exp.amount,
                        'date': exp.date.isoformat() if exp.date else None,
                        'transaction_type': getattr(exp, 'transaction_type', 'expense'),
                        'category': {
                            'name': exp.category.name if exp.category else 'Uncategorized',
                            'color': exp.category.color if exp.category else None,
                            'icon': exp.category.icon if exp.category else None,
                        } if exp.category else 'Uncategorized',
                        'account': {
                            'name': exp.account.name if exp.account else 'Unknown',
                            'color': getattr(exp.account, 'color', None) if exp.account else None,
                        } if exp.account else 'Unknown',
                    })
                except Exception:
                    continue

            # Build clean response with only what the frontend needs
            serializable_data = {
                'net_worth': dashboard_data.get('net_worth', 0) or 0,
                'total_income': dashboard_data.get('total_income', 0) or 0,
                'total_expenses_only': dashboard_data.get('total_expenses_only', 0) or 0,
                'total_expenses': dashboard_data.get('total_expenses', 0) or 0,
                'current_month_total': dashboard_data.get('current_month_total', 0) or 0,
                'current_month_expenses_only': dashboard_data.get('current_month_expenses_only', 0) or 0,
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

            return {
                'success': True,
                'data': serializable_data
            }, 200

        except Exception as e:
            import traceback
            traceback.print_exc()
            return {
                'success': False,
                'error': str(e)
            }, 500


@ns.route('/stats')
class Statistics(Resource):
    @ns.doc('get_statistics', security='Bearer')
    @jwt_required()
    def get(self):
        """Get detailed statistics and charts data"""
        current_user_id = get_jwt_identity()

        try:
            # Get stats data from service
            stats_data = analytics_service.get_stats_data(current_user_id)

            # Convert to serializable format
            def convert_to_dict(obj):
                if hasattr(obj, '__dict__'):
                    return {key: convert_to_dict(value) for key, value in obj.__dict__.items()}
                elif isinstance(obj, list):
                    return [convert_to_dict(item) for item in obj]
                elif isinstance(obj, dict):
                    return {key: convert_to_dict(value) for key, value in obj.items()}
                else:
                    return obj

            serializable_data = convert_to_dict(stats_data)

            return {
                'success': True,
                'data': serializable_data
            }, 200

        except Exception as e:
            return {
                'success': False,
                'error': str(e)
            }, 500


@ns.route('/trends')
class Trends(Resource):
    @ns.doc('get_spending_trends', security='Bearer')
    @jwt_required()
    def get(self):
        """Get spending trends over time"""
        current_user_id = get_jwt_identity()

        try:
            # Get trends from service (if method exists)
            if hasattr(analytics_service, 'get_spending_trends'):
                trends = analytics_service.get_spending_trends(current_user_id)
            else:
                # Fallback: use dashboard data for trends
                dashboard_data = analytics_service.get_dashboard_data(current_user_id)
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
            return {
                'success': False,
                'error': str(e)
            }, 500


@ns.route('/categories/top')
class TopCategories(Resource):
    @ns.doc('get_top_spending_categories', security='Bearer')
    @jwt_required()
    def get(self):
        """Get top spending categories"""
        current_user_id = get_jwt_identity()

        try:
            # Get dashboard data which includes top categories
            dashboard_data = analytics_service.get_dashboard_data(current_user_id)
            top_categories = dashboard_data.get('top_categories', [])

            # top_categories is already a list of dicts from the service
            # Just return it directly
            return {
                'success': True,
                'categories': top_categories
            }, 200

        except Exception as e:
            return {
                'success': False,
                'error': str(e)
            }, 500


@ns.route('/summary')
class Summary(Resource):
    @ns.doc('get_financial_summary', security='Bearer')
    @jwt_required()
    def get(self):
        """Get high-level financial summary (for dashboard metrics cards)"""
        current_user_id = get_jwt_identity()

        try:
            dashboard_data = analytics_service.get_dashboard_data(current_user_id)

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
            return {
                'success': False,
                'error': str(e)
            }, 500

    def _calculate_budget_remaining(self, dashboard_data):
        """Calculate total budget remaining across all budgets"""
        budget_summary = dashboard_data.get('budget_summary')
        if budget_summary and hasattr(budget_summary, '__dict__'):
            return getattr(budget_summary, 'total_remaining', 0)
        return 0


@ns.route('/cashflow')
class CashFlow(Resource):
    @ns.doc('get_cashflow_data', security='Bearer')
    @jwt_required()
    def get(self):
        """Get cash flow data (monthly income, expenses, and savings)"""
        current_user_id = get_jwt_identity()

        try:
            cashflow_data = analytics_service.get_cashflow_data(current_user_id)

            return {
                'success': True,
                'cashflow': cashflow_data
            }, 200

        except Exception as e:
            import traceback
            traceback.print_exc()
            return {
                'success': False,
                'error': str(e)
            }, 500


@ns.route('/health')
class FinancialHealth(Resource):
    @ns.doc('get_financial_health', security='Bearer')
    @jwt_required()
    def get(self):
        """Get financial health metrics (debt-to-income, emergency fund, liquidity, etc.)"""
        current_user_id = get_jwt_identity()

        try:
            health_data = analytics_service.get_financial_health(current_user_id)

            return {
                'success': True,
                'health': health_data
            }, 200

        except Exception as e:
            import traceback
            traceback.print_exc()
            return {
                'success': False,
                'error': str(e)
            }, 500


@ns.route('/networth')
class NetWorth(Resource):
    @ns.doc('get_networth_trend', security='Bearer')
    @jwt_required()
    def get(self):
        """Get net worth trend data (assets, liabilities, net worth over time)"""
        current_user_id = get_jwt_identity()

        try:
            networth_data = analytics_service.get_networth_trend(current_user_id)

            return {
                'success': True,
                'networth': networth_data
            }, 200

        except Exception as e:
            import traceback
            traceback.print_exc()
            return {
                'success': False,
                'error': str(e)
            }, 500


@ns.route('/monthly-comparison')
class MonthlyComparison(Resource):
    @ns.doc('get_monthly_comparison', security='Bearer')
    @jwt_required()
    def get(self):
        """Get month-over-month comparison with percentage changes"""
        from flask import request
        current_user_id = get_jwt_identity()

        try:
            # Get months parameter (default to 6)
            months = request.args.get('months', default=6, type=int)

            # Get comparison data from service
            comparison_data = analytics_service.get_monthly_comparison(current_user_id, months)

            return {
                'success': True,
                'data': comparison_data
            }, 200

        except Exception as e:
            import traceback
            traceback.print_exc()
            return {
                'success': False,
                'error': str(e)
            }, 500
