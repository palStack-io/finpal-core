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
from src.models.user import User, RevokedToken
from src.models.invitation import Invitation
from src.extensions import db, limiter
from werkzeug.security import generate_password_hash

import logging

logger = logging.getLogger(__name__)

# Create API Blueprint
api_bp = Blueprint('auth_api', __name__, url_prefix='/api/v1/auth')

# Matches the value the (shadowed) marshmallow schema declared, so the two
# surfaces agree if the restx handler is ever unshadowed.
MIN_PASSWORD_LENGTH = 8


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
@limiter.limit("10 per minute")
def register():
    """Register a new user"""
    try:
        data = request.get_json()

        # Enforced here, not by a marshmallow schema. The MIN_PASSWORD_LENGTH
        # schema lives on the flask-restx register handler, which the legacy
        # blueprint shadows — so it never ran and any non-empty string was
        # accepted, including a single character.
        if not data or not data.get('email') or not data.get('password'):
            return jsonify({'error': 'Email and password are required'}), 400

        email = data['email']
        password = data['password']

        if len(password) < MIN_PASSWORD_LENGTH:
            return jsonify({
                'error': 'Password must be at least %d characters'
                         % MIN_PASSWORD_LENGTH,
            }), 400

        # DISABLE_SIGNUPS was read into config and never referenced anywhere, so
        # a self-hoster who set it got no protection and no warning. Checked
        # before the invitation path on purpose: "signups disabled" that still
        # admitted anyone holding an invitation would not mean what it says.
        if current_app.config.get('DISABLE_SIGNUPS'):
            return jsonify({
                'error': 'Registration is disabled on this server.',
            }), 403
        username = data.get('username', email.split('@')[0])

        # Deliberately does not say the address is taken: that turns register
        # into an account-existence oracle (S-13).
        if User.query.filter_by(id=email).first():
            return jsonify({'error': 'Unable to create account'}), 400

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
@limiter.limit("10 per minute")
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
    """Logout — revoke the access token so it cannot be reused."""
    jti = get_jwt()['jti']
    try:
        if not RevokedToken.is_revoked(jti):
            db.session.add(RevokedToken(jti=jti))
            db.session.commit()
    except Exception:
        db.session.rollback()
        logger.exception('Failed to revoke token on logout')
        return jsonify({'error': 'Logout failed'}), 500
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
    from integrations.oidc import native
    payload = {
        'oidc_enabled': bool(oidc_enabled),
        'oidc_provider_name': oidc_provider_name,
        'apple_signin_enabled': apple_signin_enabled,
    }
    # Native sign-in config for mobile. Client IDs are public by design — they
    # identify the app to the provider and are embedded in every shipped binary.
    payload.update(native.public_config())
    return jsonify(payload), 200


@api_bp.route('/apple', methods=['POST'])
@limiter.limit("10 per minute")
def apple_signin():
    """Deprecated alias for POST /api/v1/auth/oidc with provider=apple.

    Kept because shipped mobile builds call it. It delegates rather than
    duplicating: the previous implementation was ~110 lines that refetched
    Apple's JWKS on every single sign-in and verified the issuer inline. All of
    that now lives in integrations/oidc/native.py, shared with Google, with the
    keys cached for an hour.

    Note the field name differs — this endpoint takes `identity_token`, which is
    what Apple's SDK calls it, while /auth/oidc takes `id_token`.
    """
    from integrations.oidc import native

    data = request.get_json() or {}
    identity_token = data.get('identity_token')

    if not native_signin_available(native.APPLE):
        return jsonify({'error': 'Apple Sign In is not enabled'}), 403
    if not identity_token:
        return jsonify({'error': 'identity_token is required'}), 400

    try:
        claims = native.verify_id_token(native.APPLE, identity_token)
    except native.OidcConfigError as exc:
        current_app.logger.error('Apple Sign In misconfigured: %s', exc)
        return jsonify({'error': str(exc)}), 503
    except native.OidcVerificationError as exc:
        current_app.logger.warning('Apple token verification failed: %s', exc)
        return jsonify({'error': str(exc)}), 401

    return _complete_native_signin(native.APPLE, claims, data.get('full_name'))


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


@api_bp.route('/oidc', methods=['POST'])
@limiter.limit("10 per minute")
def native_oidc_signin():
    """Sign in with a provider ID token obtained natively on a device.

    Contract matches pantryPal's so mobile code is portable across the pals:
    `{provider, id_token | access_token, full_name?}`.

    This is additive. The web redirect PKCE flow in integrations/oidc/auth.py is
    what self-hosters on Authentik, Keycloak and Authelia use and is untouched.
    """
    from integrations.oidc import native

    data = request.get_json() or {}
    provider = (data.get('provider') or '').strip().lower()
    id_token = data.get('id_token')
    access_token = data.get('access_token')

    if not provider:
        return jsonify({'error': 'provider is required'}), 400
    if not native_signin_available(provider):
        return jsonify({
            'error': '%s sign-in is not enabled on this server' % provider.title(),
        }), 403
    if not id_token and not access_token:
        return jsonify({'error': 'id_token or access_token is required'}), 400

    try:
        if id_token:
            claims = native.verify_id_token(provider, id_token)
        else:
            # Google's native SDKs often hand the app an access_token instead.
            # Apple never uses this path.
            claims = native.fetch_userinfo(provider, access_token)
    except native.OidcConfigError as exc:
        # The operator's problem, not the caller's — do not report it as 401 or
        # they will go hunting for a bad token that does not exist.
        current_app.logger.error('Native OIDC misconfigured: %s', exc)
        return jsonify({'error': str(exc)}), 503
    except native.OidcVerificationError as exc:
        # Authored, client-safe messages only.
        current_app.logger.warning('Native OIDC verification failed: %s', exc)
        return jsonify({'error': str(exc)}), 401

    return _complete_native_signin(provider, claims, data.get('full_name'))


def native_signin_available(provider):
    """Whether this server accepts native sign-in for `provider`."""
    from integrations.oidc import native
    return native.native_signin_enabled(provider)


def _complete_native_signin(provider, claims, full_name=None):
    """Turn verified provider claims into finPal tokens.

    Identity comes from the verified claims ONLY, never from the request body.
    Apple omits the email claim on every sign-in after the first, so a body
    fallback would be the normal path rather than an edge case — and because the
    user PK *is* the email, any caller with a valid token of their own could name
    someone else's address and be handed that account. Resolve by `sub`.
    """
    sub = claims.get('sub')
    if not sub:
        return jsonify({'error': 'Provider token carried no subject'}), 401

    token_email = claims.get('email')
    # Providers send email_verified as a bool or the string "true".
    email_verified = str(claims.get('email_verified', 'false')).lower() == 'true'

    known = User.query.filter_by(oidc_id=sub, oidc_provider=provider).first()
    if not known:
        # First sign-in for this provider identity: creating or linking an
        # account needs a trustworthy address, and only the token can supply one.
        if not token_email:
            return jsonify({
                'error': 'Your sign-in provider did not return an email address, '
                         'so finPal cannot create an account. Check the app has '
                         'permission to share your email.',
            }), 400
        if not email_verified:
            return jsonify({
                'error': 'This account email is not verified with the provider',
            }), 403

    oidc_data = {'sub': sub}
    if token_email and email_verified:
        oidc_data['email'] = token_email
        oidc_data['email_verified'] = True
    # Display-only. Apple returns the real name once, at first authorization, so
    # the client relays it — it never decides which account is used.
    if full_name:
        oidc_data['name'] = full_name
    elif claims.get('name'):
        oidc_data['name'] = claims['name']

    try:
        user = User.from_oidc(oidc_data, provider=provider)
    except ValueError as exc:
        # from_oidc raises ValueError only with an authored, user-facing message
        # ("already linked to X"). Not the str(e) leak CLAUDE.md forbids.
        return jsonify({'error': str(exc)}), 409
    except Exception:
        db.session.rollback()
        logger.exception('Native OIDC sign-in failed to resolve a user')
        return jsonify({'error': 'Authentication failed'}), 500

    if not user:
        return jsonify({'error': 'Failed to create or find user'}), 500

    db.session.commit()

    access = create_access_token(identity=user.id,
                                additional_claims={'email': user.id})
    refresh = create_refresh_token(identity=user.id)
    return jsonify({
        'access_token': access,
        'refresh_token': refresh,
        'user': {
            'id': user.id,
            'name': user.name,
            'email': user.id,
            'default_currency_code': getattr(user, 'default_currency_code', 'USD') or 'USD',
            'profile_emoji': getattr(user, 'profile_emoji', '\U0001f464'),
        },
    }), 200
