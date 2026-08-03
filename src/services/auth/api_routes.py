"""
API Routes for Authentication
JWT-based authentication endpoints for React Native frontend
"""

from flask import Blueprint, request, jsonify, current_app
from flask_jwt_extended import (
    create_access_token,
    create_refresh_token,
    jwt_required,
    get_jwt_identity,
    get_jwt
)
from src.models.user import User
from src.models.invitation import Invitation
from src.extensions import db
from werkzeug.security import generate_password_hash

import logging

logger = logging.getLogger(__name__)

# Create API Blueprint
api_bp = Blueprint('auth_api', __name__, url_prefix='/api/v1/auth')


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


@api_bp.route('/register', methods=['POST'])
def register():
    """Register a new user"""
    try:
        data = request.get_json()

        # Validate required fields
        if not data or not data.get('email') or not data.get('password'):
            return jsonify({'error': 'Email and password are required'}), 400

        email = data['email']
        password = data['password']
        username = data.get('username', email.split('@')[0])

        # Check if user exists
        if User.query.filter_by(id=email).first():
            return jsonify({'error': 'User already exists'}), 400

        # Check invitation requirement: if other users exist, require an invitation
        user_count = User.query.filter_by(is_demo_user=False).count()
        invitation = Invitation.query.filter_by(email=email, status='pending').first()

        if user_count > 0 and not invitation:
            return jsonify({'error': 'Registration is by invitation only. Ask your household admin for an invite.'}), 403

        # Create new user
        user = User(
            id=email,
            name=username,
            default_currency_code='USD',
            email_verified=False
        )
        user.set_password(password)

        # First non-demo user becomes admin
        if user_count == 0:
            user.is_admin = True

        # Generate verification token
        token = user.generate_verification_token()

        db.session.add(user)

        # Mark invitation as accepted if one exists
        if invitation:
            invitation.status = 'accepted'

        db.session.commit()

        # Send verification email
        try:
            from src.services.email_service import email_service
            import os

            app_url = os.getenv('APP_URL', 'http://localhost:3000')
            verification_link = f"{app_url}/verify-email?token={token}"

            email_service.send_verification_email(
                to_email=user.id,
                user_name=user.name,
                verification_link=verification_link
            )
        except Exception as e:
            # Log error but don't fail registration
            logger.exception('Failed to send verification email')

        # Create tokens
        access_token = create_access_token(identity=email, additional_claims={'email': email})
        refresh_token = create_refresh_token(identity=email)

        return jsonify({
            'access_token': access_token,
            'refresh_token': refresh_token,
            'user': {
                'id': user.id,
                'name': user.name,
                'email': user.id,
                'email_verified': user.email_verified,
                'is_admin': user.is_admin,
                'is_demo_user': user.is_demo_user,
                'default_currency_code': user.default_currency_code,
                'hasCompletedOnboarding': user.has_completed_onboarding,
                'profile_emoji': user.profile_emoji,
                'modules': _get_user_modules(user.id),
            }
        }), 201

    except Exception as e:
        db.session.rollback()
        logger.exception('Unhandled error in auth endpoint')
        return jsonify({'error': 'An internal error occurred'}), 500


@api_bp.route('/login', methods=['POST'])
def login():
    """Login user"""
    try:
        data = request.get_json()

        # Validate required fields
        if not data or not data.get('email') or not data.get('password'):
            return jsonify({'error': 'Email and password are required'}), 400

        email = data['email']
        password = data['password']

        # Find user
        user = User.query.filter_by(id=email).first()

        if not user or not user.check_password(password):
            return jsonify({'error': 'Invalid email or password'}), 401

        # Create tokens
        access_token = create_access_token(identity=email, additional_claims={'email': email})
        refresh_token = create_refresh_token(identity=email)

        return jsonify({
            'access_token': access_token,
            'refresh_token': refresh_token,
            'user': {
                'id': user.id,
                'name': user.name,
                'email': user.id,
                'profile_emoji': user.profile_emoji,
                'default_currency_code': user.default_currency_code,
                'hasCompletedOnboarding': user.has_completed_onboarding,
                'timezone': user.timezone,
                'modules': _get_user_modules(user.id),
                'notifications': {
                    'email': user.notification_email if hasattr(user, 'notification_email') else True,
                    'push': user.notification_push if hasattr(user, 'notification_push') else False,
                    'budgetAlerts': user.notification_budget_alerts if hasattr(user, 'notification_budget_alerts') else True,
                    'transactionAlerts': user.notification_transaction_alerts if hasattr(user, 'notification_transaction_alerts') else True
                }
            }
        }), 200

    except Exception as e:
        logger.exception('Unhandled error in auth endpoint')
        return jsonify({'error': 'An internal error occurred'}), 500


@api_bp.route('/refresh', methods=['POST'])
@jwt_required(refresh=True)
def refresh():
    """Refresh access token"""
    try:
        identity = get_jwt_identity()
        access_token = create_access_token(identity=identity, additional_claims={'email': identity})

        return jsonify({
            'access_token': access_token
        }), 200

    except Exception as e:
        logger.exception('Unhandled error in auth endpoint')
        return jsonify({'error': 'An internal error occurred'}), 500


@api_bp.route('/me', methods=['GET'])
@jwt_required()
def get_current_user():
    """Get current user info"""
    try:
        identity = get_jwt_identity()
        user = User.query.filter_by(id=identity).first()

        if not user:
            return jsonify({'error': 'User not found'}), 404

        return jsonify({
            'id': user.id,
            'name': user.name,
            'email': user.id,
            'user_color': user.user_color,
            'profile_emoji': user.profile_emoji,
            'is_admin': user.is_admin,
            'default_currency_code': user.default_currency_code,
            'timezone': user.timezone,
            'hasCompletedOnboarding': user.has_completed_onboarding,  # Changed to camelCase
            'notifications': {
                'email': user.notification_email,
                'push': user.notification_push,
                'budgetAlerts': user.notification_budget_alerts,
                'transactionAlerts': user.notification_transaction_alerts
            },
            'created_at': user.created_at.isoformat() if user.created_at else None
        }), 200

    except Exception as e:
        logger.exception('Unhandled error in auth endpoint')
        return jsonify({'error': 'An internal error occurred'}), 500


@api_bp.route('/logout', methods=['POST'])
@jwt_required()
def logout():
    """Logout user (client-side token removal)"""
    # In a production app, you might want to blacklist the token
    # For now, we just return success and let the client remove the token
    return jsonify({'message': 'Logged out successfully'}), 200


@api_bp.route('/onboarding', methods=['POST'])
@jwt_required()
def complete_onboarding():
    """Complete user onboarding - set currency, timezone, and notification preferences"""
    try:
        identity = get_jwt_identity()
        user = User.query.filter_by(id=identity).first()

        if not user:
            return jsonify({'error': 'User not found'}), 404

        data = request.get_json()

        # Validate required fields
        if not data:
            return jsonify({'error': 'Request body is required'}), 400

        # Update user preferences
        if 'default_currency_code' in data:
            user.default_currency_code = data['default_currency_code']

        if 'timezone' in data:
            user.timezone = data['timezone']

        if 'profile_emoji' in data:
            user.profile_emoji = data['profile_emoji']

        # Update notification preferences
        if 'notifications' in data:
            notifications = data['notifications']
            if 'email' in notifications:
                user.notification_email = notifications['email']
            if 'push' in notifications:
                user.notification_push = notifications['push']
            if 'budgetAlerts' in notifications:
                user.notification_budget_alerts = notifications['budgetAlerts']
            if 'transactionAlerts' in notifications:
                user.notification_transaction_alerts = notifications['transactionAlerts']

        # Mark onboarding as complete
        user.has_completed_onboarding = True

        db.session.commit()

        return jsonify({
            'id': user.id,
            'name': user.name,
            'email': user.id,
            'profile_emoji': user.profile_emoji,
            'default_currency_code': user.default_currency_code,
            'timezone': user.timezone,
            'hasCompletedOnboarding': True,
            'is_demo_user': user.is_demo_user,
            'modules': _get_user_modules(user.id),
        }), 200

    except Exception as e:
        db.session.rollback()
        logger.exception('Unhandled error in auth endpoint')
        return jsonify({'error': 'An internal error occurred'}), 500


@api_bp.route('/verify-email', methods=['POST'])
def verify_email():
    """Verify user email with token"""
    try:
        data = request.get_json()

        if not data or not data.get('token'):
            return jsonify({'error': 'Verification token is required'}), 400

        token = data['token']

        # Find user with this token
        user = User.query.filter_by(verification_token=token).first()

        if not user:
            return jsonify({'error': 'Invalid verification token'}), 400

        # Verify token
        if not user.verify_email_token(token):
            return jsonify({'error': 'Verification token has expired'}), 400

        # Mark email as verified
        user.clear_verification_token()
        db.session.commit()

        return jsonify({
            'message': 'Email verified successfully',
            'user': {
                'id': user.id,
                'email': user.id,
                'email_verified': user.email_verified
            }
        }), 200

    except Exception as e:
        db.session.rollback()
        logger.exception('Unhandled error in auth endpoint')
        return jsonify({'error': 'An internal error occurred'}), 500


@api_bp.route('/resend-verification', methods=['POST'])
def resend_verification():
    """Resend verification email"""
    try:
        data = request.get_json()

        if not data or not data.get('email'):
            return jsonify({'error': 'Email is required'}), 400

        email = data['email']
        user = User.query.filter_by(id=email).first()

        if not user:
            # Don't reveal if user exists
            return jsonify({'message': 'If the email exists, a verification link has been sent'}), 200

        if user.email_verified:
            return jsonify({'error': 'Email is already verified'}), 400

        # Generate new token
        token = user.generate_verification_token()
        db.session.commit()

        # Send verification email
        from src.services.email_service import email_service
        import os

        app_url = os.getenv('APP_URL', 'http://localhost:3000')
        verification_link = f"{app_url}/verify-email?token={token}"

        email_service.send_verification_email(
            to_email=user.id,
            user_name=user.name or user.id.split('@')[0],
            verification_link=verification_link
        )

        return jsonify({'message': 'Verification email sent'}), 200

    except Exception as e:
        db.session.rollback()
        logger.exception('Unhandled error in auth endpoint')
        return jsonify({'error': 'An internal error occurred'}), 500


@api_bp.route('/forgot-password', methods=['POST'])
def forgot_password():
    """Request password reset email"""
    try:
        data = request.get_json()

        if not data or not data.get('email'):
            return jsonify({'error': 'Email is required'}), 400

        email = data['email']
        user = User.query.filter_by(id=email).first()

        # Always return success to prevent email enumeration
        if not user:
            return jsonify({'success': True, 'message': 'If the email exists, a reset link has been sent'}), 200

        # Generate reset token
        token = user.generate_reset_token()
        db.session.commit()

        # Send reset email
        from src.services.email_service import email_service
        import os

        app_url = os.getenv('APP_URL', 'http://localhost:3000')
        reset_link = f"{app_url}/reset-password?token={token}&email={user.id}"

        email_service.send_password_reset_email(
            to_email=user.id,
            user_name=user.name or user.id.split('@')[0],
            reset_link=reset_link
        )

        return jsonify({'success': True, 'message': 'If the email exists, a reset link has been sent'}), 200

    except Exception as e:
        db.session.rollback()
        logger.exception('Unhandled error in auth endpoint')
        return jsonify({'error': 'An internal error occurred'}), 500


@api_bp.route('/config', methods=['GET'])
def auth_config():
    """Return auth capabilities so mobile can show correct login options."""
    import os
    oidc_enabled = current_app.config.get('OIDC_ENABLED', False)
    oidc_provider_name = current_app.config.get('OIDC_PROVIDER_NAME', 'SSO')
    apple_signin_enabled = os.getenv('APPLE_SIGNIN_ENABLED', 'False').lower() == 'true'
    return jsonify({
        'oidc_enabled': bool(oidc_enabled),
        'oidc_provider_name': oidc_provider_name,
        'apple_signin_enabled': apple_signin_enabled,
    }), 200


@api_bp.route('/apple', methods=['POST'])
def apple_signin():
    """Verify Apple Sign In identity token and return finPal JWT tokens."""
    import os
    import requests as http_requests
    import jwt as pyjwt
    from jwt.algorithms import RSAAlgorithm

    if os.getenv('APPLE_SIGNIN_ENABLED', 'False').lower() != 'true':
        return jsonify({'error': 'Apple Sign In is not enabled'}), 403

    data = request.get_json() or {}
    identity_token = data.get('identity_token')
    if not identity_token:
        return jsonify({'error': 'identity_token is required'}), 400

    try:
        # Fetch Apple's public keys
        keys_resp = http_requests.get(
            'https://appleid.apple.com/auth/keys', timeout=10
        )
        keys_resp.raise_for_status()
        apple_keys = keys_resp.json().get('keys', [])

        # Find the key matching the token's kid header
        header = pyjwt.get_unverified_header(identity_token)
        kid = header.get('kid')
        apple_key_dict = next((k for k in apple_keys if k['kid'] == kid), None)
        if not apple_key_dict:
            return jsonify({'error': 'Invalid token: key not found'}), 401

        # Build RSA public key and verify the token
        public_key = RSAAlgorithm.from_jwk(apple_key_dict)
        bundle_id = os.getenv('APPLE_CLIENT_ID', '')
        if not bundle_id:
            current_app.logger.error(
                'APPLE_SIGNIN_ENABLED is true but APPLE_CLIENT_ID is unset'
            )
            return jsonify({'error': 'Apple Sign In is misconfigured on this server'}), 500
        claims = pyjwt.decode(
            identity_token,
            public_key,
            algorithms=['RS256'],
            audience=bundle_id,
            issuer='https://appleid.apple.com',
        )

        # Identity is taken from the signed token ONLY — never from the request
        # body. Apple omits the email claim on every sign-in after the first
        # authorization, so a `data.get('email')` fallback here is the normal
        # path rather than an edge case: any caller holding a valid Apple token
        # of their own could name someone else's address and, because the user
        # PK *is* the email, be handed that account. Resolve by `sub` instead.
        sub = claims['sub']
        token_email = claims.get('email')
        # Apple sends email_verified as either a bool or the string "true".
        email_verified = str(claims.get('email_verified', 'false')).lower() == 'true'

        known = User.query.filter_by(oidc_id=sub, oidc_provider='apple').first()
        if not known:
            # First sign-in for this Apple ID: we need a trustworthy email to
            # create (or link) the account, and only the token can supply one.
            if not token_email:
                return jsonify({
                    'error': 'Apple did not return an email address for this sign-in. '
                             'On your device, remove finPal under Settings → your name → '
                             'Sign in with Apple, then try again.'
                }), 400
            if not email_verified:
                return jsonify({'error': 'This Apple account email is not verified'}), 403

        oidc_data = {'sub': sub}
        if token_email and email_verified:
            oidc_data['email'] = token_email
            oidc_data['email_verified'] = True
        # full_name is display-only. Apple returns the real name once, in the
        # credential rather than the token, so the client has to relay it — but
        # it never contributes to identity resolution.
        full_name = data.get('full_name')
        if full_name:
            oidc_data['name'] = full_name
        elif 'email' in oidc_data:
            oidc_data['name'] = oidc_data['email'].split('@')[0]

        # Reuse existing OIDC user creation logic
        # User.from_oidc is added by extend_user_model at startup
        try:
            user = User.from_oidc(oidc_data, provider='apple')
        except ValueError as e:
            # Deliberately surfaced: from_oidc raises ValueError only with an
            # authored, user-facing message ("This account is already linked to
            # X. Please sign in with X instead."). This is not the str(e) leak
            # CLAUDE.md forbids — that rule is about unhandled exceptions, whose
            # text carries table names and DSNs.
            return jsonify({'error': str(e)}), 409
        if not user:
            return jsonify({'error': 'Failed to create or find user'}), 500

        db.session.commit()

        access_token = create_access_token(
            identity=user.id,
            additional_claims={'email': user.id}
        )
        refresh_token = create_refresh_token(identity=user.id)

        return jsonify({
            'access_token': access_token,
            'refresh_token': refresh_token,
            'user': {
                'id': user.id,
                'name': user.name,
                'email': user.id,
                'default_currency_code': getattr(user, 'default_currency_code', 'USD') or 'USD',
                'profile_emoji': getattr(user, 'profile_emoji', '👤'),
            }
        }), 200

    except pyjwt.ExpiredSignatureError:
        return jsonify({'error': 'Apple token has expired'}), 401
    except pyjwt.InvalidTokenError as e:
        current_app.logger.warning(f"Apple token validation failed: {e}")
        return jsonify({'error': 'Invalid Apple token'}), 401
    except Exception as e:
        current_app.logger.error(f"Apple Sign In error: {e}")
        return jsonify({'error': 'Authentication failed'}), 500


@api_bp.route('/reset-password', methods=['POST'])
def reset_password():
    """Reset password with token"""
    try:
        data = request.get_json()

        token = data.get('token')
        # Accept both 'password' and 'new_password' for compatibility
        new_password = data.get('password') or data.get('new_password')
        if not token or not new_password:
            return jsonify({'error': 'Token and new password are required'}), 400

        # Validate password length
        if len(new_password) < 8:
            return jsonify({'error': 'Password must be at least 8 characters'}), 400

        # Find user with this token
        user = User.query.filter_by(reset_token=token).first()

        if not user:
            return jsonify({'error': 'Invalid reset token'}), 400

        # Verify token
        if not user.verify_reset_token(token):
            return jsonify({'error': 'Reset token has expired'}), 400

        # Update password
        user.set_password(new_password)
        user.clear_reset_token()
        db.session.commit()

        return jsonify({'success': True, 'message': 'Password reset successfully'}), 200

    except Exception as e:
        db.session.rollback()
        logger.exception('Unhandled error in auth endpoint')
        return jsonify({'success': False, 'error': 'An internal error occurred'}), 500
