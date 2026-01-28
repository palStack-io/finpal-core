"""
API Routes for Authentication
JWT-based authentication endpoints for React Native frontend
"""

from flask import Blueprint, request, jsonify
from flask_jwt_extended import (
    create_access_token,
    create_refresh_token,
    jwt_required,
    get_jwt_identity,
    get_jwt
)
from src.models.user import User
from src.extensions import db
from werkzeug.security import generate_password_hash

# Create API Blueprint
api_bp = Blueprint('auth_api', __name__, url_prefix='/api/v1/auth')


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

        # Create new user
        user = User(
            id=email,
            name=username,
            default_currency_code='USD',
            email_verified=False
        )
        user.set_password(password)

        # Generate verification token
        token = user.generate_verification_token()

        db.session.add(user)
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
            print(f"Failed to send verification email: {str(e)}")

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
                'default_currency_code': user.default_currency_code
            }
        }), 201

    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 500


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
                'default_currency_code': user.default_currency_code,
                'hasCompletedOnboarding': user.has_completed_onboarding,  # Added
                'timezone': user.timezone,
                'notifications': {
                    'email': user.notification_email if hasattr(user, 'notification_email') else True,
                    'push': user.notification_push if hasattr(user, 'notification_push') else False,
                    'budgetAlerts': user.notification_budget_alerts if hasattr(user, 'notification_budget_alerts') else True,
                    'transactionAlerts': user.notification_transaction_alerts if hasattr(user, 'notification_transaction_alerts') else True
                }
            }
        }), 200

    except Exception as e:
        return jsonify({'error': str(e)}), 500


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
        return jsonify({'error': str(e)}), 500


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
        return jsonify({'error': str(e)}), 500


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
            currency_code = data['default_currency_code']
            # Validate currency code exists
            from src.models.currency import Currency
            currency = Currency.query.filter_by(code=currency_code).first()
            if not currency:
                return jsonify({'error': f'Invalid currency code: {currency_code}'}), 400
            user.default_currency_code = currency_code

        if 'timezone' in data:
            user.timezone = data['timezone']

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
            'message': 'Onboarding completed successfully',
            'user': {
                'id': user.id,
                'name': user.name,
                'email': user.id,
                'default_currency_code': user.default_currency_code,
                'timezone': user.timezone,
                'hasCompletedOnboarding': user.has_completed_onboarding,  # Changed to camelCase
                'notifications': {
                    'email': user.notification_email,
                    'push': user.notification_push,
                    'budgetAlerts': user.notification_budget_alerts,
                    'transactionAlerts': user.notification_transaction_alerts
                }
            }
        }), 200

    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 500


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
        return jsonify({'error': str(e)}), 500


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
        return jsonify({'error': str(e)}), 500


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
            return jsonify({'message': 'If the email exists, a reset link has been sent'}), 200

        # Generate reset token
        token = user.generate_reset_token()
        db.session.commit()

        # Send reset email
        from src.services.email_service import email_service
        import os

        app_url = os.getenv('APP_URL', 'http://localhost:3000')
        reset_link = f"{app_url}/reset-password?token={token}"

        email_service.send_password_reset_email(
            to_email=user.id,
            user_name=user.name or user.id.split('@')[0],
            reset_link=reset_link
        )

        return jsonify({'message': 'If the email exists, a reset link has been sent'}), 200

    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 500


@api_bp.route('/reset-password', methods=['POST'])
def reset_password():
    """Reset password with token"""
    try:
        data = request.get_json()

        if not data or not data.get('token') or not data.get('password'):
            return jsonify({'error': 'Token and new password are required'}), 400

        token = data['token']
        new_password = data['password']

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

        return jsonify({'message': 'Password reset successfully'}), 200

    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 500
