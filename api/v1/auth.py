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
from src.models.user import User
from src.extensions import db
from datetime import datetime, timedelta
from src.data import seed_user_defaults
import logging
import threading

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


@ns.route('/login')
class Login(Resource):
    @ns.doc('login')
    @ns.expect(login_model)
    def post(self):
        """Login with email and password"""
        data = request.get_json()
        email = data.get('email')
        password = data.get('password')

        if not email or not password:
            return {'message': 'Email and password required'}, 400

        # Note: User.id IS the email in this schema
        user = User.query.filter_by(id=email).first()

        if not user or not user.check_password(password):
            return {'message': 'Invalid email or password'}, 401

        # Determine token expiry based on demo status
        is_demo = user.is_demo_user
        demo_timeout_minutes = current_app.config.get('DEMO_TIMEOUT_MINUTES', 10)

        if is_demo:
            access_expires = timedelta(minutes=demo_timeout_minutes)
            refresh_expires = timedelta(minutes=demo_timeout_minutes)
            demo_expires_at = (datetime.utcnow() + access_expires).isoformat() + 'Z'
        else:
            access_expires = timedelta(hours=24)
            refresh_expires = timedelta(days=30)
            demo_expires_at = None

        # Create tokens
        access_token = create_access_token(
            identity=user.id,
            additional_claims={'email': user.id, 'is_demo_user': is_demo},
            expires_delta=access_expires
        )
        refresh_token = create_refresh_token(
            identity=user.id,
            expires_delta=refresh_expires
        )

        # Record login event
        try:
            from src.models.user import LoginEvent
            db.session.add(LoginEvent(
                user_id=user.id,
                ip_address=request.remote_addr,
                user_agent=request.headers.get('User-Agent', '')[:500],
                success=True,
            ))
            db.session.commit()
        except Exception:
            db.session.rollback()

        # Kick off background data refresh (non-blocking)
        if not user.is_demo_user:
            _background_sync(current_app._get_current_object(), user.id)

        response_data = {
            'access_token': access_token,
            'refresh_token': refresh_token,
            'user': {
                'id': user.id,  # This is the email
                'name': user.name,
                'email': user.id,  # id IS the email
                'default_currency_code': user.default_currency_code,
                'is_demo_user': is_demo,
                'hasCompletedOnboarding': user.has_completed_onboarding,
                'profile_emoji': user.profile_emoji,
                'modules': _get_user_modules(user.id),
            }
        }

        if demo_expires_at:
            response_data['demo_expires_at'] = demo_expires_at

        return response_data, 200


@ns.route('/register')
class Register(Resource):
    @ns.doc('register')
    @ns.expect(register_model)
    def post(self):
        """Register a new user"""
        data = request.get_json()
        name = data.get('username')  # API expects 'username' but model uses 'name'
        email = data.get('email')
        password = data.get('password')

        if not name or not email or not password:
            return {'message': 'Name, email, and password required'}, 400

        # Check if user already exists (id IS the email)
        if User.query.filter_by(id=email).first():
            return {'message': 'Email already registered'}, 400

        # Create new user
        new_user = User(
            id=email,  # id IS the email
            name=name,
            default_currency_code='USD'
        )
        new_user.set_password(password)  # Use the set_password method

        db.session.add(new_user)
        db.session.commit()

        # Seed default categories and rules for new user
        try:
            seed_result = seed_user_defaults(new_user.id)
            logger.info(f"Seeded defaults for new user {new_user.id}: {seed_result}")
        except Exception as e:
            logger.error(f"Failed to seed defaults for user {new_user.id}: {str(e)}")
            # Don't fail registration if seeding fails

        # Create tokens
        access_token = create_access_token(
            identity=new_user.id,
            additional_claims={'email': new_user.id},
            expires_delta=timedelta(hours=24)
        )
        refresh_token = create_refresh_token(
            identity=new_user.id,
            expires_delta=timedelta(days=30)
        )

        return {
            'access_token': access_token,
            'refresh_token': refresh_token,
            'user': {
                'id': new_user.id,
                'name': new_user.name,
                'email': new_user.id,
                'default_currency_code': new_user.default_currency_code
            }
        }, 201


@ns.route('/refresh')
class RefreshToken(Resource):
    @ns.doc('refresh_token', security='Bearer')
    @jwt_required(refresh=True)
    def post(self):
        """Refresh access token using refresh token"""
        current_user_id = get_jwt_identity()
        user = User.query.get(current_user_id)

        if not user:
            return {'message': 'User not found'}, 404

        new_access_token = create_access_token(
            identity=current_user_id,
            additional_claims={'email': user.id},  # id IS the email
            expires_delta=timedelta(hours=24)
        )

        return {'access_token': new_access_token}, 200


@ns.route('/me')
class CurrentUser(Resource):
    @ns.doc('get_current_user', security='Bearer')
    @jwt_required()
    @ns.marshal_with(user_response)
    def get(self):
        """Get current user information"""
        current_user_id = get_jwt_identity()
        user = User.query.get(current_user_id)

        if not user:
            return {'message': 'User not found'}, 404

        return {
            'id': user.id,
            'name': user.name,
            'email': user.id,  # id IS the email
            'default_currency_code': user.default_currency_code,
            'created_at': user.created_at
        }, 200


@ns.route('/logout')
class Logout(Resource):
    @ns.doc('logout', security='Bearer')
    @jwt_required()
    def post(self):
        """Logout (client should discard tokens)"""
        # Note: With JWT, logout is handled client-side by discarding tokens
        # For blacklisting, you'd need to implement a token blocklist
        return {'message': 'Successfully logged out'}, 200


@ns.route('/onboarding')
class CompleteOnboarding(Resource):
    @ns.doc('complete_onboarding', security='Bearer')
    @jwt_required()
    def post(self):
        """Complete user onboarding — save currency, timezone, notifications, and profile emoji"""
        current_user_id = get_jwt_identity()
        user = User.query.get(current_user_id)

        if not user:
            return {'message': 'User not found'}, 404

        data = request.get_json() or {}

        # Update currency
        if 'default_currency_code' in data:
            user.default_currency_code = data['default_currency_code']

        # Update timezone
        if 'timezone' in data:
            user.timezone = data['timezone']

        # Update profile emoji
        if 'profile_emoji' in data:
            user.profile_emoji = data['profile_emoji']

        # Update notification preferences
        notifications = data.get('notifications', {})
        if notifications:
            user.notification_email = notifications.get('email', user.notification_email)
            user.notification_push = notifications.get('push', user.notification_push)
            user.notification_budget_alerts = notifications.get('budgetAlerts', user.notification_budget_alerts)
            user.notification_transaction_alerts = notifications.get('transactionAlerts', user.notification_transaction_alerts)

        user.has_completed_onboarding = True

        try:
            db.session.commit()
        except Exception as e:
            db.session.rollback()
            logger.error(f'Onboarding save failed for {current_user_id}: {e}')
            return {'message': 'Failed to save onboarding data'}, 500

        return {
            'id': user.id,
            'name': user.name,
            'email': user.id,
            'default_currency_code': user.default_currency_code,
            'timezone': user.timezone,
            'profile_emoji': user.profile_emoji,
            'hasCompletedOnboarding': True,
            'is_demo_user': user.is_demo_user,
            'modules': _get_user_modules(user.id),
        }, 200


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
