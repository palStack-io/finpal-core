"""
REST API Package for finPal
Provides JSON API endpoints for web and mobile frontends
"""

from flask import Blueprint
from flask_restx import Api
from werkzeug.exceptions import HTTPException
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
# Each of these needs a DOCSTRING, and it is not decoration: flask-restx uses it
# as the response `description`, and OpenAPI makes description MANDATORY on a
# response. Without them these eight emit `{}` into the document's root
# `responses` object, and the whole spec then fails conversion with
# "(Patchable) response.description is mandatory" — so no standard generator can
# consume it. Found while wiring the OpenAPI type generation for mobile (item
# 1c); `test_the_swagger_document_is_valid.py` now fails if one loses its
# docstring.
@api.errorhandler(NoAuthorizationError)
def handle_no_authorization(error):
    """No Authorization header was sent."""
    return {'message': 'Missing authorization token', 'error': 'authorization_required'}, 401

@api.errorhandler(InvalidHeaderError)
def handle_invalid_header(error):
    """The Authorization header was malformed."""
    return {'message': 'Invalid authorization header', 'error': 'invalid_header'}, 401

@api.errorhandler(JWTDecodeError)
def handle_decode_error(error):
    """The token could not be decoded."""
    return {'message': 'Invalid token', 'error': 'invalid_token'}, 401

@api.errorhandler(WrongTokenError)
def handle_wrong_token(error):
    """A refresh token was sent where an access token was required, or vice versa."""
    return {'message': 'Wrong token type', 'error': 'wrong_token'}, 401

@api.errorhandler(RevokedTokenError)
def handle_revoked_token(error):
    """The token has been revoked by logging out."""
    return {'message': 'Token has been revoked', 'error': 'token_revoked'}, 401

@api.errorhandler(FreshTokenRequired)
def handle_fresh_token_required(error):
    """This operation needs a freshly issued token, not a refreshed one."""
    return {'message': 'Fresh token required', 'error': 'fresh_token_required'}, 401

@api.errorhandler(ExpiredSignatureError)
def handle_expired_token(error):
    """The token has expired."""
    return {'message': 'Token has expired', 'error': 'token_expired'}, 401

@api.errorhandler(DecodeError)
def handle_jwt_decode_error(error):
    """The token is not a valid JWT."""
    return {'message': 'Invalid token', 'error': 'invalid_token'}, 401


@api.errorhandler(HTTPException)
def handle_http_exception(error):
    """Give restx routes the same error body the rest of the API sends.

    `src/__init__.py` registers an app-level `_HTTPException` handler answering
    `{success, error, message, status}`, and its comment says why both keys are
    there: web reads `data.error` and mobile reads `data.message`. **restx never
    reached it** — `Api.error_router` intercepts exceptions raised inside its own
    blueprint — so every restx path answered a bare `{'message': ...}` carrying
    werkzeug's "The browser (or proxy) sent a request that this server could not
    understand", which the app-level comment already calls meaningless to an API
    client. `data.error` was simply absent on ~120 paths.

    That surfaced while porting the transaction-rules blueprint onto restx: the
    blueprint answered a malformed body with the four-key shape and the ported
    resource answered restx's, which would have been a silent contract change for
    the one family the port was supposed to leave alone. Fixing it here keeps the
    port faithful and closes the same gap for every other restx route.

    Same value choice as the app-level handler: the status *name*, never
    `e.description` and never an application exception's text.
    """
    return {
        'success': False,
        'error': error.name,
        'message': error.name,
        'status': error.code,
    }, (error.code or 500)

# Import and register namespaces (will be created next)
from api.v1 import auth, analytics, transactions, accounts, budgets, categories, groups, recurring, investments, csv_import, users, team, transaction_rules, demo, import_sources, agent_actions, access_tokens

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
# Three separate namespaces: the spec's API table puts batches and profiles at the
# top level, not under /import-sources. The api_bp blueprint already supplies the
# /api/v1 prefix, so these paths stay bare.
api.add_namespace(import_sources.ns, path='/import-sources')
api.add_namespace(import_sources.batches_ns, path='/import-batches')
api.add_namespace(import_sources.profiles_ns, path='/import-profiles')
api.add_namespace(agent_actions.ns, path='/agent-actions')
api.add_namespace(access_tokens.ns, path='/access-tokens')

# Module namespaces — self-registering via ModuleRegistry
try:
    from src.modules.registry import module_registry
    module_registry.register_api_namespaces(api)
except Exception as _e:
    import logging as _logging
    _logging.getLogger(__name__).warning(f"Module namespace registration failed: {_e}")
