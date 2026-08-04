"""Authentication API endpoints"""
from flask import request, current_app
from flask_restx import Namespace, Resource, fields
from flask_jwt_extended import (
    create_access_token,
    create_refresh_token,
    jwt_required,
    get_jwt_identity,
    get_jwt
)
from werkzeug.security import check_password_hash, generate_password_hash
from src.models.user import User, RevokedToken
from src.extensions import db, limiter
from datetime import datetime, timedelta
from src.data import seed_user_defaults
from schemas.input_schemas import login_input, register_input
from src.utils.validation import validate_request, validation_error_response
import logging
import threading
from src.models.personal_access_token import SCOPE_READ
from src.utils.api_auth import api_auth_required

logger = logging.getLogger(__name__)


def _background_sync(app, user_id: str) -> None:
    """
    Spawn a daemon thread to refresh SimpleFin transactions and run
    module background sync hooks. Non-blocking — login/app-open is never delayed.
    """
    def _run():
        with app.app_context():
            # 1. SimpleFin — per-user transaction sync
            try:
                from src.models.account import SimpleFin as SimpleFinConn
                conn = SimpleFinConn.query.filter_by(
                    user_id=user_id, enabled=True
                ).first()
                if conn:
                    from src.services.account.service import SimpleFinService
                    SimpleFinService().sync_all_accounts(user_id)
                    logger.info(f"Background SimpleFin sync complete for {user_id}")
            except Exception as e:
                logger.warning(f"Background SimpleFin sync failed for {user_id}: {e}")

            # 2. Module background sync hooks (e.g. pointsPal program sync)
            try:
                from src.modules.registry import module_registry
                module_registry.background_sync(app, user_id)
            except Exception as e:
                logger.warning(f"Module background sync failed for {user_id}: {e}")

    if app.config.get('TESTING'):
        # A daemon thread outlives the request, and the test db fixture drops
        # every table after each test — so a sync spawned by one test hits the
        # next test's half-built schema and errors with "no such table: users".
        # Non-deterministic by nature: it passed on CI's 3.8 leg and failed on
        # 3.12 in the same run.
        logger.debug('Background sync skipped under TESTING')
        return

    thread = threading.Thread(target=_run, daemon=True)
    thread.start()


def _get_user_modules(user_id: str) -> list:
    """Return list of module slugs enabled for this user."""
    try:
        from src.modules.registry import module_registry
        return [
            m.name for m in module_registry.modules
            if m.is_enabled() and m.is_user_enabled(user_id)
        ]
    except Exception:
        import os
        return ['pointspal'] if os.getenv('POINTSPAL_ENABLED', 'false').lower() == 'true' else []


def _get_server_features() -> dict:
    """Return which server-level optional features are enabled."""
    return {
        'simplefin': current_app.config.get('SIMPLEFIN_ENABLED', True),
        'investments': current_app.config.get('INVESTMENT_TRACKING_ENABLED', True),
    }

# Create namespace
ns = Namespace('auth', description='Authentication operations')

# Define request/response models for Swagger documentation
login_model = ns.model('Login', {
    'email': fields.String(required=True, description='User email'),
    'password': fields.String(required=True, description='User password')
})

register_model = ns.model('Register', {
    'username': fields.String(required=True, description='Username'),
    'email': fields.String(required=True, description='User email'),
    'password': fields.String(required=True, description='User password')
})

token_response = ns.model('TokenResponse', {
    'access_token': fields.String(description='JWT access token'),
    'refresh_token': fields.String(description='JWT refresh token'),
    'user': fields.Raw(description='User information')
})

user_response = ns.model('UserResponse', {
    'id': fields.Integer(description='User ID'),
    'username': fields.String(description='Username'),
    'email': fields.String(description='User email'),
    'default_currency_code': fields.String(description='Default currency'),
    'created_at': fields.DateTime(description='Account creation date')
})


# The Login, Register, RefreshToken, CurrentUser, Logout and CompleteOnboarding
# Resources used to live here. They were unreachable: src/__init__.py registers
# the auth_api blueprint (src/services/auth/api_routes.py) before this namespace,
# it claims byte-identical URLs, and Werkzeug resolves duplicate rules to the
# first registered. So every real request went to the blueprint and these were
# dead code — which is how the S-07, S-08 and S-13 fixes came to be applied here,
# reviewed, and never executed (they were ported to the live handler in #19).
#
# Deleting them rather than merging the other direction, because the blueprint is
# both the live implementation and the more complete one: it also serves
# verify-email, resend-verification, forgot-password, reset-password, config and
# apple, which never existed here.
#
# Checked before deleting: no client uses the trailing-slash form of an auth URL
# (web-ui and mobile were both grepped), so nothing was relying on these rules to
# absorb `/api/v1/auth/login/`. That mattered — mobile *does* use the
# trailing-slash form for /transactions/, /accounts/, /budgets/, /categories/,
# /groups/, /recurring/ and /investments/*, where the equivalent duplicates are
# load-bearing and must not be removed the same way.
#
# /sync stays: it has no blueprint counterpart, so it is genuinely live.


@ns.route('/sync')
class BackgroundSync(Resource):
    @ns.doc('background_sync', security='Bearer')
    @jwt_required()
    def post(self):
        """
        Trigger background SimpleFin + pointsPal refresh for the current user.
        Returns 202 immediately — sync runs in a daemon thread.
        Called by the frontend on app open (once per browser session).
        """
        user_id = get_jwt_identity()
        user = User.query.get(user_id)
        if user and not user.is_demo_user:
            _background_sync(current_app._get_current_object(), user_id)
        return {'status': 'sync started'}, 202


@ns.route('/whoami')
class WhoAmI(Resource):
    @ns.doc('whoami', security='Bearer')
    # Token-reachable on purpose, unlike /auth/me which is JWT-only.
    # An API client needs to know which identity its token belongs to: finPal
    # returns household-wide rows for accounts, categories and budgets
    # (src/utils/household.py:get_all_user_ids), so a client cannot infer the
    # caller from the data — and guessing would attribute one member's spending
    # to another with total confidence. Returns the minimum needed to tell
    # "you" from "someone else in your household", nothing more.
    @api_auth_required(scope=SCOPE_READ)
    def get(self):
        """The identity this credential belongs to."""
        user_id = get_jwt_identity()
        user = User.query.filter_by(id=user_id).first()
        if not user:
            return {'error': 'User not found'}, 404
        return {'id': user.id, 'name': user.name}, 200
