"""
REST API Package for finPal
Provides JSON API endpoints for web and mobile frontends
"""

from flask import Blueprint
from flask_restx import Api
from flask_jwt_extended.exceptions import (
    NoAuthorizationError,
    InvalidHeaderError,
    JWTDecodeError,
    WrongTokenError,
    RevokedTokenError,
    FreshTokenRequired,
    UserLookupError,
    UserClaimsVerificationError,
)
from jwt.exceptions import ExpiredSignatureError, DecodeError

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

# Register JWT error handlers on the Flask-RESTX Api so they fire
# before RESTX's generic 500 handler catches them.
@api.errorhandler(NoAuthorizationError)
def handle_no_authorization(error):
    return {'message': 'Missing authorization token', 'error': 'authorization_required'}, 401

@api.errorhandler(InvalidHeaderError)
def handle_invalid_header(error):
    return {'message': 'Invalid authorization header', 'error': 'invalid_header'}, 401

@api.errorhandler(JWTDecodeError)
def handle_decode_error(error):
    return {'message': 'Invalid token', 'error': 'invalid_token'}, 401

@api.errorhandler(WrongTokenError)
def handle_wrong_token(error):
    return {'message': 'Wrong token type', 'error': 'wrong_token'}, 401

@api.errorhandler(RevokedTokenError)
def handle_revoked_token(error):
    return {'message': 'Token has been revoked', 'error': 'token_revoked'}, 401

@api.errorhandler(FreshTokenRequired)
def handle_fresh_token_required(error):
    return {'message': 'Fresh token required', 'error': 'fresh_token_required'}, 401

@api.errorhandler(ExpiredSignatureError)
def handle_expired_token(error):
    return {'message': 'Token has expired', 'error': 'token_expired'}, 401

@api.errorhandler(DecodeError)
def handle_jwt_decode_error(error):
    return {'message': 'Invalid token', 'error': 'invalid_token'}, 401

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
