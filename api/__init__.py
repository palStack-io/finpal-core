"""
REST API Package for finPal
Provides JSON API endpoints for web and mobile frontends
"""

from flask import Blueprint
from flask_restx import Api

# Create main API blueprint
api_bp = Blueprint('api', __name__, url_prefix='/api/v1')

# Initialize Flask-RESTX API with Swagger documentation
api = Api(
    api_bp,
    version='1.0',
    title='finPal API',
    description='REST API for finPal expense tracking application',
    doc='/docs',  # Swagger UI available at /api/v1/docs
    authorizations={
        'Bearer': {
            'type': 'apiKey',
            'in': 'header',
            'name': 'Authorization',
            'description': 'Add JWT token as: Bearer <token>'
        }
    },
    security='Bearer'
)

# Import and register namespaces (will be created next)
from api.v1 import auth, analytics, transactions, accounts, budgets, categories, groups, recurring, investments, csv_import, users, team, transaction_rules, demo

# Register namespaces
api.add_namespace(auth.ns, path='/auth')
api.add_namespace(analytics.ns, path='/analytics')
api.add_namespace(transactions.ns, path='/transactions')
api.add_namespace(accounts.ns, path='/accounts')
api.add_namespace(budgets.ns, path='/budgets')
api.add_namespace(categories.ns, path='/categories')
api.add_namespace(groups.ns, path='/groups')
api.add_namespace(recurring.ns, path='/recurring')
api.add_namespace(investments.ns, path='/investments')
api.add_namespace(csv_import.ns, path='/csv-import')
api.add_namespace(users.ns, path='/users')
api.add_namespace(team.ns, path='/team')
api.add_namespace(transaction_rules.ns, path='/transaction-rules')
api.add_namespace(demo.ns, path='/demo')
