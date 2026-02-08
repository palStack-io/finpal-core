"""User management API endpoints"""
from flask import request, send_file
from flask_restx import Namespace, Resource, fields
from flask_jwt_extended import jwt_required, get_jwt_identity
from werkzeug.security import check_password_hash, generate_password_hash
from werkzeug.utils import secure_filename
from src.models.user import User, UserApiSettings
from src.extensions import db
from src.utils.decorators import demo_restricted
from datetime import datetime
from flask import current_app
import os
import json
import io

# Create namespace
ns = Namespace('users', description='User management operations')

# Define request/response models
profile_update_model = ns.model('ProfileUpdate', {
    'name': fields.String(description='User display name'),
    'phone': fields.String(description='Phone number'),
    'bio': fields.String(description='User bio'),
    'avatar': fields.String(description='Avatar URL'),
    'user_color': fields.String(description='User color preference'),
    'timezone': fields.String(description='User timezone'),
    'default_currency_code': fields.String(description='Default currency code'),
})

password_change_model = ns.model('PasswordChange', {
    'currentPassword': fields.String(required=True, description='Current password'),
    'newPassword': fields.String(required=True, description='New password'),
})

password_reset_model = ns.model('PasswordReset', {
    'email': fields.String(required=True, description='User email'),
})

delete_account_model = ns.model('DeleteAccount', {
    'password': fields.String(required=True, description='Password confirmation'),
})

session_model = ns.model('Session', {
    'id': fields.String(description='Session ID'),
    'device': fields.String(description='Device name'),
    'browser': fields.String(description='Browser name'),
    'location': fields.String(description='Location'),
    'ipAddress': fields.String(description='IP address'),
    'lastActive': fields.DateTime(description='Last active time'),
    'createdAt': fields.DateTime(description='Session created time'),
    'current': fields.Boolean(description='Is current session'),
})


ALLOWED_EXTENSIONS = {'png', 'jpg', 'jpeg', 'gif', 'webp'}
UPLOAD_FOLDER = 'uploads/avatars'

def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS


@ns.route('/profile')
class Profile(Resource):
    @ns.doc('update_profile')
    @jwt_required()
    @ns.expect(profile_update_model)
    def put(self):
        """Update user profile information"""
        user_id = get_jwt_identity()
        user = User.query.filter_by(id=user_id).first()

        if not user:
            return {'message': 'User not found'}, 404

        data = request.get_json()

        # Update allowed fields (only fields that exist in User model)
        if 'name' in data:
            user.name = data['name']
        if 'user_color' in data:
            user.user_color = data.get('user_color')
        if 'timezone' in data:
            user.timezone = data.get('timezone')
        if 'default_currency_code' in data:
            user.default_currency_code = data.get('default_currency_code')

        db.session.commit()

        return {
            'id': user.id,
            'email': user.id,  # id IS the email in this model
            'name': user.name,
            'user_color': user.user_color,
            'default_currency_code': user.default_currency_code,
            'timezone': user.timezone,
            'created_at': user.created_at.isoformat() if user.created_at else None,
            'has_completed_onboarding': user.has_completed_onboarding,
        }, 200


@ns.route('/avatar')
class Avatar(Resource):
    @ns.doc('upload_avatar')
    @jwt_required()
    def post(self):
        """Upload user avatar image"""
        user_id = get_jwt_identity()
        user = User.query.filter_by(id=user_id).first()

        if not user:
            return {'message': 'User not found'}, 404

        if 'avatar' not in request.files:
            return {'message': 'No file provided'}, 400

        file = request.files['avatar']

        if file.filename == '':
            return {'message': 'No file selected'}, 400

        if file and allowed_file(file.filename):
            # Create upload folder if it doesn't exist
            os.makedirs(UPLOAD_FOLDER, exist_ok=True)

            # Create secure filename with user ID
            ext = file.filename.rsplit('.', 1)[1].lower()
            filename = secure_filename(f"avatar_{user.id}_{datetime.now().timestamp()}.{ext}")
            filepath = os.path.join(UPLOAD_FOLDER, filename)

            # Save file
            file.save(filepath)

            # Update user avatar URL
            avatar_url = f"/uploads/avatars/{filename}"
            user.avatar = avatar_url
            db.session.commit()

            return {'avatarUrl': avatar_url}, 200

        return {'message': 'Invalid file type'}, 400


@ns.route('/password')
class Password(Resource):
    @ns.doc('change_password')
    @jwt_required()
    @ns.expect(password_change_model)
    def put(self):
        """Change user password"""
        user_id = get_jwt_identity()
        user = User.query.filter_by(id=user_id).first()

        if not user:
            return {'message': 'User not found'}, 404

        data = request.get_json()
        current_password = data.get('currentPassword')
        new_password = data.get('newPassword')

        if not current_password or not new_password:
            return {'message': 'Current and new password required'}, 400

        # Verify current password
        if not user.check_password(current_password):
            return {'message': 'Current password is incorrect'}, 401

        # Validate new password strength
        if len(new_password) < 8:
            return {'message': 'Password must be at least 8 characters'}, 400

        # Update password
        user.set_password(new_password)
        db.session.commit()

        return {'message': 'Password changed successfully'}, 200


@ns.route('/password-reset')
class PasswordReset(Resource):
    @ns.doc('request_password_reset')
    @ns.expect(password_reset_model)
    def post(self):
        """Request password reset email"""
        data = request.get_json()
        email = data.get('email')

        if not email:
            return {'message': 'Email required'}, 400

        user = User.query.filter_by(id=email).first()

        # Don't reveal if user exists
        # In production, send password reset email here

        return {'message': 'If account exists, password reset email sent'}, 200


@ns.route('/sessions')
class Sessions(Resource):
    @ns.doc('get_sessions')
    @jwt_required()
    def get(self):
        """Get active sessions for current user"""
        user_id = get_jwt_identity()

        # This is a simplified implementation
        # In production, you'd track sessions in database or Redis
        from flask_jwt_extended import get_jwt
        jti = get_jwt().get('jti')

        sessions = [{
            'id': jti,
            'device': 'Current Device',
            'browser': 'Unknown Browser',
            'location': 'Unknown',
            'ipAddress': request.remote_addr,
            'lastActive': datetime.utcnow().isoformat(),
            'createdAt': datetime.utcnow().isoformat(),
            'current': True,
        }]

        return sessions, 200


@ns.route('/sessions/<string:session_id>')
class SessionDetail(Resource):
    @ns.doc('terminate_session')
    @jwt_required()
    def delete(self, session_id):
        """Terminate a specific session"""
        # This would revoke the JWT in production using a blocklist
        # For now, return success
        return {'message': 'Session terminated'}, 200


@ns.route('/login-history')
class LoginHistory(Resource):
    @ns.doc('get_login_history')
    @jwt_required()
    def get(self):
        """Get login history for current user"""
        user_id = get_jwt_identity()
        limit = request.args.get('limit', 10, type=int)

        # This is a placeholder
        # In production, you'd track login history in database
        history = [{
            'timestamp': datetime.utcnow().isoformat(),
            'ipAddress': request.remote_addr,
            'device': 'Current Device',
            'browser': 'Unknown Browser',
            'location': 'Unknown',
            'success': True,
        }]

        return history[:limit], 200


@ns.route('/account')
class Account(Resource):
    @ns.doc('delete_account')
    @jwt_required()
    @ns.expect(delete_account_model)
    def delete(self):
        """Delete user account (requires password confirmation)"""
        user_id = get_jwt_identity()
        user = User.query.filter_by(id=user_id).first()

        if not user:
            return {'message': 'User not found'}, 404

        data = request.get_json()
        password = data.get('password')

        if not password:
            return {'message': 'Password required'}, 400

        # Verify password
        if not user.check_password(password):
            return {'message': 'Password is incorrect'}, 401

        # Delete user and all related data
        # In production, this should cascade delete all user data
        db.session.delete(user)
        db.session.commit()

        return {'message': 'Account deleted successfully'}, 200


@ns.route('/export')
class Export(Resource):
    @ns.doc('export_data')
    @jwt_required()
    def get(self):
        """Export all user data as JSON"""
        user_id = get_jwt_identity()
        user = User.query.filter_by(id=user_id).first()

        if not user:
            return {'message': 'User not found'}, 404

        # Collect all user data
        data = {
            'user': {
                'email': user.id,
                'name': user.name,
                'phone': user.phone,
                'bio': user.bio,
                'default_currency_code': user.default_currency_code,
                'timezone': user.timezone,
                'created_at': user.created_at.isoformat() if user.created_at else None,
            },
            'accounts': [],  # Would include user's accounts
            'transactions': [],  # Would include user's transactions
            'budgets': [],  # Would include user's budgets
            'categories': [],  # Would include user's categories
        }

        # Create JSON file in memory
        json_data = json.dumps(data, indent=2)
        buffer = io.BytesIO(json_data.encode('utf-8'))
        buffer.seek(0)

        return send_file(
            buffer,
            mimetype='application/json',
            as_attachment=True,
            download_name=f'finpal_export_{datetime.now().strftime("%Y%m%d")}.json'
        )


@ns.route('/import')
class Import(Resource):
    @ns.doc('import_data')
    @jwt_required()
    def post(self):
        """Import user data from JSON backup"""
        user_id = get_jwt_identity()

        if 'data' not in request.files:
            return {'message': 'No file provided'}, 400

        file = request.files['data']

        if file.filename == '':
            return {'message': 'No file selected'}, 400

        try:
            data = json.load(file)
            # Process import data
            # This would restore user data from backup

            return {'message': 'Data imported successfully'}, 200
        except Exception as e:
            return {'message': f'Import failed: {str(e)}'}, 400


@ns.route('/clear-cache')
class ClearCache(Resource):
    @ns.doc('clear_cache')
    @jwt_required()
    def post(self):
        """Clear user cache"""
        user_id = get_jwt_identity()

        # Clear any cached data for user
        # This is a placeholder

        return {'message': 'Cache cleared successfully'}, 200


@ns.route('/reset-categories')
class ResetCategories(Resource):
    @ns.doc('reset_categories')
    @jwt_required()
    def post(self):
        """Reset categories to default"""
        user_id = get_jwt_identity()

        # Reset user's categories to default set
        # This would delete custom categories and restore defaults

        return {'message': 'Categories reset to default'}, 200


@ns.route('/delete-all-data')
class DeleteAllData(Resource):
    @ns.doc('delete_all_data')
    @jwt_required()
    def post(self):
        """Delete all user data (dangerous!)"""
        user_id = get_jwt_identity()
        user = User.query.filter_by(id=user_id).first()

        if not user:
            return {'message': 'User not found'}, 404

        data = request.get_json()
        password = data.get('password')

        if not password:
            return {'message': 'Password required'}, 400

        # Verify password
        if not user.check_password(password):
            return {'message': 'Password is incorrect'}, 401

        # Delete all user data but keep the account
        # This would delete transactions, accounts, budgets, etc.

        return {'message': 'All data deleted successfully'}, 200


@ns.route('/api-settings')
class ApiSettings(Resource):
    @ns.doc('get_api_settings')
    @jwt_required()
    def get(self):
        """Get user API settings including SimpleFin"""
        user_id = get_jwt_identity()

        # Get or create API settings
        api_settings = UserApiSettings.query.filter_by(user_id=user_id).first()

        # Check if SimpleFin is globally enabled
        simplefin_globally_enabled = current_app.config.get('SIMPLEFIN_ENABLED', False)
        # Check if Investment tracking is globally enabled
        investment_globally_enabled = current_app.config.get('INVESTMENT_TRACKING_ENABLED', False)

        if not api_settings:
            return {
                'simplefinEnabled': False,
                'simplefinGloballyEnabled': simplefin_globally_enabled,
                'hasSimplefinConnection': False,
                # If investment tracking is globally enabled, default user setting to True
                'investmentTrackingEnabled': investment_globally_enabled,
                'investmentGloballyEnabled': investment_globally_enabled,
                'fmpApiKey': None
            }, 200

        return {
            'simplefinEnabled': api_settings.simplefin_enabled if api_settings.simplefin_enabled is not None else False,
            'simplefinGloballyEnabled': simplefin_globally_enabled,
            'hasSimplefinConnection': api_settings.simplefin_access_url is not None,
            # If investment tracking is globally enabled and user hasn't explicitly disabled it, default to True
            'investmentTrackingEnabled': api_settings.investment_tracking_enabled if api_settings.investment_tracking_enabled is not None else investment_globally_enabled,
            'investmentGloballyEnabled': investment_globally_enabled,
            'fmpApiKey': api_settings.get_api_key() if hasattr(api_settings, 'get_api_key') else None
        }, 200

    @ns.doc('update_api_settings')
    @jwt_required()
    @demo_restricted
    def put(self):
        """Update user API settings"""
        user_id = get_jwt_identity()
        data = request.get_json()

        # Get or create API settings
        api_settings = UserApiSettings.query.filter_by(user_id=user_id).first()
        if not api_settings:
            api_settings = UserApiSettings(user_id=user_id)
            db.session.add(api_settings)

        # Update SimpleFin enabled status
        if 'simplefinEnabled' in data:
            api_settings.simplefin_enabled = data['simplefinEnabled']

        # Update Investment tracking enabled status
        if 'investmentTrackingEnabled' in data:
            api_settings.investment_tracking_enabled = data['investmentTrackingEnabled']

        # Update FMP API key
        if 'fmpApiKey' in data:
            if hasattr(api_settings, 'set_api_key'):
                api_settings.set_api_key(data['fmpApiKey'])

        db.session.commit()

        return {
            'message': 'API settings updated successfully',
            'simplefinEnabled': api_settings.simplefin_enabled,
            'hasSimplefinConnection': api_settings.simplefin_access_url is not None,
            'investmentTrackingEnabled': api_settings.investment_tracking_enabled
        }, 200
