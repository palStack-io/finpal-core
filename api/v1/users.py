"""User management API endpoints"""
from flask import request, send_file
from flask_restx import Namespace, Resource, fields, reqparse
from werkzeug.datastructures import FileStorage
from flask_jwt_extended import jwt_required, get_jwt_identity
from werkzeug.security import check_password_hash, generate_password_hash
from werkzeug.utils import secure_filename
from src.models.user import User, UserApiSettings
from src.extensions import db
from src.utils.decorators import demo_restricted
from src.utils.locale import is_a_usable_number_locale
from datetime import datetime
from flask import current_app
import os
import json
import io

import logging

logger = logging.getLogger(__name__)


# Create namespace
ns = Namespace('users', description='User management operations')

# Define request/response models
profile_update_model = ns.model('ProfileUpdate', {
    'name': fields.String(description='User display name'),
    'phone': fields.String(description='Phone number'),
    'bio': fields.String(description='User bio'),
    'avatar': fields.String(description='Avatar URL'),
    'user_color': fields.String(description='User color preference'),
    'profile_emoji': fields.String(description='Profile emoji'),
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

password_reset_confirm_model = ns.model('PasswordResetConfirm', {
    'email': fields.String(required=True, description='User email'),
    'token': fields.String(required=True, description='Reset token from email'),
    'newPassword': fields.String(required=True, description='New password'),
})

delete_account_model = ns.model('DeleteAccount', {
    'password': fields.String(required=True, description='Password confirmation'),
})

# Multipart uploads are still request bodies a client has to construct, so they
# are documented with a parser - restx emits these as formData parameters rather
# than a JSON schema.
avatar_parser = reqparse.RequestParser()
avatar_parser.add_argument('avatar', location='files', type=FileStorage,
                           required=True, help='Avatar image file')

import_parser = reqparse.RequestParser()
import_parser.add_argument('data', location='files', type=FileStorage,
                           required=True, help='JSON backup file')

delete_all_data_model = ns.model('DeleteAllData', {
    'password': fields.String(required=True, description='Password confirmation'),
})

api_settings_model = ns.model('ApiSettings', {
    # All optional: the handler updates a column only when its key is present,
    # so an omitted field means "leave it alone" rather than "clear it".
    'simplefinEnabled': fields.Boolean(required=False, description='Enable SimpleFin'),
    'investmentTrackingEnabled': fields.Boolean(required=False, description='Enable investment tracking'),
    'fmpApiKey': fields.String(required=False, description='Financial Modeling Prep API key'),
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
        if 'profile_emoji' in data:
            user.profile_emoji = data.get('profile_emoji')
        if 'timezone' in data:
            user.timezone = data.get('timezone')
        if 'default_currency_code' in data:
            user.default_currency_code = data.get('default_currency_code')
        # #132. Onboarding happens once, so without this the preference would be
        # unreachable for every already-onboarded user -- including the person who asked
        # for it. Validated because the tag reaches `Intl.NumberFormat` in two clients,
        # which throws on a malformed one; None/'' clears it back to the app default.
        if 'number_locale' in data:
            candidate = data.get('number_locale')
            if candidate is None or candidate == '':
                user.number_locale = None
            elif is_a_usable_number_locale(candidate):
                user.number_locale = candidate
            else:
                return {'message': 'number_locale is not a usable locale tag'}, 400

        db.session.commit()

        return {
            'id': user.id,
            'email': user.id,  # id IS the email in this model
            'name': user.name,
            'user_color': user.user_color,
            'profile_emoji': user.profile_emoji,
            'default_currency_code': user.default_currency_code,
            'timezone': user.timezone,
            'number_locale': user.number_locale,  # #132
            'created_at': user.created_at.isoformat() if user.created_at else None,
            'has_completed_onboarding': user.has_completed_onboarding,
        }, 200


@ns.route('/avatar')
class Avatar(Resource):
    @ns.doc('upload_avatar')
    @ns.expect(avatar_parser)
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

        if user:
            token = user.generate_reset_token()
            db.session.commit()

            from src.services.email_service import email_service
            app_url = os.getenv('APP_URL', 'http://localhost:3000')
            reset_link = f"{app_url}/reset-password?token={token}&email={email}"
            email_service.send_password_reset_email(
                to_email=user.id,
                user_name=user.name or user.id,
                reset_link=reset_link,
                expires_in='1 hour',
            )

        # Don't reveal if user exists
        return {'message': 'If account exists, password reset email sent'}, 200


@ns.route('/password-reset-confirm')
class PasswordResetConfirm(Resource):
    @ns.doc('confirm_password_reset')
    @ns.expect(password_reset_confirm_model)
    def post(self):
        """Consume a reset token and set a new password"""
        data = request.get_json() or {}
        email = data.get('email', '').strip().lower()
        token = data.get('token', '').strip()
        new_password = data.get('newPassword', '')

        if not email or not token or not new_password:
            return {'message': 'email, token, and newPassword are required'}, 400

        if len(new_password) < 8:
            return {'message': 'Password must be at least 8 characters'}, 400

        user = User.query.filter_by(id=email).first()
        if not user or not user.verify_reset_token(token):
            return {'message': 'Invalid or expired reset token'}, 400

        user.set_password(new_password)
        user.clear_reset_token()
        db.session.commit()

        return {'message': 'Password reset successfully'}, 200


@ns.route('/sessions')
class Sessions(Resource):
    @ns.doc('get_sessions')
    @jwt_required()
    def get(self):
        """Get recent login sessions for current user (from login history)"""
        user_id = get_jwt_identity()
        from flask_jwt_extended import get_jwt
        from src.models.user import LoginEvent

        current_jti = get_jwt().get('jti')
        events = (
            LoginEvent.query
            .filter_by(user_id=user_id, success=True)
            .order_by(LoginEvent.timestamp.desc())
            .limit(20)
            .all()
        )

        sessions = []
        for i, e in enumerate(events):
            sessions.append({
                'id': f"{user_id}:{e.id}",
                'ipAddress': e.ip_address,
                'userAgent': e.user_agent,
                'lastActive': e.timestamp.isoformat(),
                'createdAt': e.timestamp.isoformat(),
                'current': i == 0,
            })

        return sessions, 200


@ns.route('/sessions/<string:session_id>')
class SessionDetail(Resource):
    @ns.doc('terminate_session')
    @jwt_required()
    def delete(self, session_id):
        """Revoke a JWT token (add JTI to blocklist)"""
        from flask_jwt_extended import get_jwt
        from src.models.user import RevokedToken

        # session_id is the JTI of the token to revoke
        jti = session_id
        if not RevokedToken.is_revoked(jti):
            db.session.add(RevokedToken(jti=jti))
            db.session.commit()

        return {'message': 'Session terminated'}, 200


@ns.route('/login-history')
class LoginHistory(Resource):
    @ns.doc('get_login_history')
    @jwt_required()
    def get(self):
        """Get login history for current user"""
        user_id = get_jwt_identity()
        limit = min(request.args.get('limit', 10, type=int), 100)

        from src.models.user import LoginEvent
        events = (
            LoginEvent.query
            .filter_by(user_id=user_id)
            .order_by(LoginEvent.timestamp.desc())
            .limit(limit)
            .all()
        )

        history = [
            {
                'timestamp': e.timestamp.isoformat(),
                'ipAddress': e.ip_address,
                'userAgent': e.user_agent,
                'success': e.success,
            }
            for e in events
        ]

        return history, 200


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

        try:
            _delete_all_user_data(user_id)
            db.session.delete(user)
            db.session.commit()
        except Exception:
            db.session.rollback()
            logger.exception('Account delete error for %s', user_id)
            return {'message': 'Could not delete the account. Nothing was '
                               'removed — please try again.'}, 500

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

        from src.models.account import Account
        from src.models.transaction import Expense
        from src.models.budget import Budget
        from src.models.category import Category

        accounts = Account.query.filter_by(user_id=user_id).all()
        transactions = Expense.query.filter_by(user_id=user_id).order_by(Expense.date.desc()).all()
        budgets = Budget.query.filter_by(user_id=user_id).all()
        # Export subcategories after parents so import can rebuild the tree
        categories = Category.query.filter_by(user_id=user_id).order_by(
            Category.parent_id.nullsfirst()
        ).all()

        data = {
            'schema_version': '1.0',
            'exported_at': datetime.utcnow().isoformat(),
            'user': {
                'email': user.id,
                'name': user.name,
                'default_currency_code': user.default_currency_code,
                'timezone': user.timezone,
                'created_at': user.created_at.isoformat() if user.created_at else None,
            },
            'categories': [
                {
                    'exported_id': c.id,
                    'name': c.name,
                    'icon': c.icon,
                    'color': c.color,
                    'parent_exported_id': c.parent_id,
                    'is_system': c.is_system,
                }
                for c in categories
            ],
            'accounts': [
                {
                    'name': a.name,
                    'type': a.type,
                    'institution': a.institution,
                    'balance': a.balance,
                    'currency_code': a.currency_code,
                    'color': a.color,
                    'import_source': a.import_source,
                }
                for a in accounts
            ],
            'transactions': [
                {
                    'description': e.description,
                    'amount': e.amount,
                    'date': e.date.isoformat() if e.date else None,
                    'transaction_type': e.transaction_type,
                    'category_exported_id': e.category_id,
                    'card_used': e.card_used,
                    'split_method': e.split_method,
                    'paid_by': e.paid_by,
                    'currency_code': e.currency_code,
                    'original_amount': e.original_amount,
                    'import_source': e.import_source,
                    'external_id': e.external_id,
                }
                for e in transactions
            ],
            'budgets': [
                {
                    'name': b.name,
                    'amount': b.amount,
                    'period': b.period,
                    'category_exported_id': b.category_id,
                    'include_subcategories': b.include_subcategories,
                    'is_recurring': b.is_recurring,
                    'active': b.active,
                    'rollover': b.rollover,
                }
                for b in budgets
            ],
        }

        # Create JSON file in memory.
        # `cls=` is not optional (D-73): this called the standard library's `dumps`
        # with no encoder, so it bypassed the app's entirely and raised on the first
        # `datetime` — and, once money became `numeric` (D-58), on the first
        # `Decimal` too. Every other response route already goes through this class.
        from src import _DecimalJSONEncoder
        json_data = json.dumps(data, indent=2, cls=_DecimalJSONEncoder)
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
    @ns.expect(import_parser)
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
        except json.JSONDecodeError as e:
            # The position is the user's own file and is what they need to fix
            # it; `str(e)` is not, because a decoder can quote the offending
            # bytes back. Read the structured attributes instead.
            return {'message': 'That file is not valid JSON '
                               f'(line {e.lineno}, column {e.colno}).'}, 400
        except Exception:
            logger.exception('Could not read the uploaded backup for %s',
                             user_id)
            return {'message': 'That file could not be read as JSON.'}, 400

        try:
            stats = _import_user_data(user_id, data)
            return {'message': 'Data imported successfully', 'stats': stats}, 200
        except Exception:
            db.session.rollback()
            logger.exception('Import error for %s', user_id)
            return {'message': 'The import failed and nothing was changed. '
                               'Check the file is a finPal export.'}, 400


@ns.route('/clear-cache')
class ClearCache(Resource):
    @ns.doc('clear_cache')
    @jwt_required()
    def post(self):
        """Clear user cache"""
        user_id = get_jwt_identity()

        fmp_cache = current_app.extensions.get('fmp_cache')
        cleared = fmp_cache.clear_all() if fmp_cache else 0

        return {'message': 'Cache cleared successfully', 'files_removed': cleared}, 200


@ns.route('/reset-categories')
class ResetCategories(Resource):
    @ns.doc('reset_categories')
    @jwt_required()
    def post(self):
        """Reset categories to default"""
        user_id = get_jwt_identity()

        from src.models.transaction import Expense, CategorySplit
        from src.models.category import Category, CategoryMapping
        from src.models.transaction_rule import TransactionRule
        from src.models.budget import Budget
        from src.data import seed_user_defaults

        try:
            # Nullify category_id on expenses (allows FK constraint to be removed)
            Expense.query.filter_by(user_id=user_id).update(
                {'category_id': None}, synchronize_session=False
            )

            # Delete category splits for this user's expenses (category_id is NOT NULL there)
            expense_ids = [
                row.id for row in
                db.session.query(Expense.id).filter_by(user_id=user_id).all()
            ]
            if expense_ids:
                CategorySplit.query.filter(
                    CategorySplit.expense_id.in_(expense_ids)
                ).delete(synchronize_session=False)
                Expense.query.filter_by(user_id=user_id).update(
                    {'has_category_splits': False}, synchronize_session=False
                )

            # Delete budgets, rules, mappings that reference categories
            Budget.query.filter_by(user_id=user_id).delete(synchronize_session=False)
            TransactionRule.query.filter_by(user_id=user_id).delete(synchronize_session=False)
            CategoryMapping.query.filter_by(user_id=user_id).delete(synchronize_session=False)

            # Delete subcategories before parents (self-referential FK)
            Category.query.filter(
                Category.user_id == user_id,
                Category.parent_id.isnot(None)
            ).delete(synchronize_session=False)
            Category.query.filter_by(user_id=user_id).delete(synchronize_session=False)

            db.session.commit()
        except Exception:
            db.session.rollback()
            logger.exception('Category reset failed for %s', user_id)
            return {'message': 'Could not reset categories. Your existing '
                               'categories were left as they were.'}, 500

        result = seed_user_defaults(user_id)
        return {
            'message': 'Categories reset to defaults',
            'categories_created': result.get('categories_count', 0),
            'rules_created': result.get('rules_count', 0),
        }, 200


@ns.route('/delete-all-data')
class DeleteAllData(Resource):
    @ns.doc('delete_all_data')
    @ns.expect(delete_all_data_model)
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

        try:
            _delete_all_user_data(user_id)
            db.session.commit()
        except Exception:
            db.session.rollback()
            logger.exception('delete-all-data error for %s', user_id)
            return {'message': 'Could not delete your data. Nothing was '
                               'removed — please try again.'}, 500

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
    @ns.expect(api_settings_model)
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


# ---------------------------------------------------------------------------
# Private helpers
# ---------------------------------------------------------------------------

def _delete_all_user_data(user_id):
    """
    Delete all data belonging to user_id without deleting the user account itself.
    Caller is responsible for commit/rollback.
    """
    from src.models.transaction import Expense, CategorySplit
    from src.models.account import Account
    from src.models.budget import Budget
    from src.models.category import Category, CategoryMapping
    from src.models.transaction_rule import TransactionRule
    from src.models.recurring import RecurringExpense
    from src.models.investment import Portfolio, Investment, InvestmentTransaction
    from src.models.category import Tag
    from src.models.user import LoginEvent
    from src.models.associations import expense_tags, group_users

    # Collect expense IDs for association cleanup
    expense_ids = [
        row.id for row in db.session.query(Expense.id).filter_by(user_id=user_id).all()
    ]

    if expense_ids:
        # Remove expense-tag associations (association table, no ORM cascade)
        db.session.execute(
            expense_tags.delete().where(expense_tags.c.expense_id.in_(expense_ids))
        )
        # Delete category splits (FK to expenses, NOT NULL so must delete before expenses)
        CategorySplit.query.filter(
            CategorySplit.expense_id.in_(expense_ids)
        ).delete(synchronize_session=False)

    Expense.query.filter_by(user_id=user_id).delete(synchronize_session=False)
    RecurringExpense.query.filter_by(user_id=user_id).delete(synchronize_session=False)
    Budget.query.filter_by(user_id=user_id).delete(synchronize_session=False)
    CategoryMapping.query.filter_by(user_id=user_id).delete(synchronize_session=False)
    TransactionRule.query.filter_by(user_id=user_id).delete(synchronize_session=False)
    Account.query.filter_by(user_id=user_id).delete(synchronize_session=False)

    # Investments: delete transactions → investments → portfolios (no DB cascade)
    portfolio_ids = [
        row.id for row in db.session.query(Portfolio.id).filter_by(user_id=user_id).all()
    ]
    if portfolio_ids:
        inv_ids = [
            row.id for row in
            db.session.query(Investment.id).filter(
                Investment.portfolio_id.in_(portfolio_ids)
            ).all()
        ]
        if inv_ids:
            InvestmentTransaction.query.filter(
                InvestmentTransaction.investment_id.in_(inv_ids)
            ).delete(synchronize_session=False)
        Investment.query.filter(
            Investment.portfolio_id.in_(portfolio_ids)
        ).delete(synchronize_session=False)
    Portfolio.query.filter_by(user_id=user_id).delete(synchronize_session=False)

    # Categories: delete subcategories (parent_id not null) before parents
    Category.query.filter(
        Category.user_id == user_id,
        Category.parent_id.isnot(None)
    ).delete(synchronize_session=False)
    Category.query.filter_by(user_id=user_id).delete(synchronize_session=False)

    Tag.query.filter_by(user_id=user_id).delete(synchronize_session=False)
    LoginEvent.query.filter_by(user_id=user_id).delete(synchronize_session=False)

    # Remove user from group memberships
    db.session.execute(group_users.delete().where(group_users.c.user_id == user_id))


def _import_user_data(user_id, data: dict) -> dict:
    """
    Restore data from an export payload produced by GET /users/export.
    Returns a stats dict. Caller is responsible for rollback on exception.
    """
    from src.models.category import Category
    from src.models.account import Account
    from src.models.transaction import Expense
    from src.models.budget import Budget

    stats = {'categories': 0, 'accounts': 0, 'transactions': 0, 'budgets': 0}

    # --- 1. Categories (ordered parents-first by the export) ---
    # Map exported_id → new DB id so transactions/budgets can reference them
    cat_id_map = {}  # exported_id (int) → new id (int)

    for cat_data in data.get('categories', []):
        exported_id = cat_data.get('exported_id')
        parent_exported_id = cat_data.get('parent_exported_id')
        new_parent_id = cat_id_map.get(parent_exported_id) if parent_exported_id else None

        cat = Category(
            name=cat_data.get('name', 'Unnamed'),
            icon=cat_data.get('icon', '🏷️'),
            color=cat_data.get('color', '#6c757d'),
            parent_id=new_parent_id,
            user_id=user_id,
            is_system=cat_data.get('is_system', False),
        )
        db.session.add(cat)
        db.session.flush()  # get the new id

        if exported_id is not None:
            cat_id_map[exported_id] = cat.id
        stats['categories'] += 1

    # --- 2. Accounts ---
    acct_name_map = {}  # name → new Account.id (for transactions)

    for acct_data in data.get('accounts', []):
        name = acct_data.get('name', 'Unnamed Account')
        acct = Account(
            name=name,
            type=acct_data.get('type', 'checking'),
            institution=acct_data.get('institution'),
            balance=acct_data.get('balance', 0.0),
            currency_code=acct_data.get('currency_code'),
            color=acct_data.get('color'),
            import_source=acct_data.get('import_source'),
            user_id=user_id,
        )
        db.session.add(acct)
        db.session.flush()
        acct_name_map[name] = acct.id
        stats['accounts'] += 1

    # --- 3. Transactions ---
    for tx_data in data.get('transactions', []):
        date_raw = tx_data.get('date')
        try:
            date = datetime.fromisoformat(date_raw) if date_raw else datetime.utcnow()
        except ValueError:
            date = datetime.utcnow()

        cat_exported_id = tx_data.get('category_exported_id')
        category_id = cat_id_map.get(cat_exported_id) if cat_exported_id else None

        expense = Expense(
            description=tx_data.get('description', ''),
            amount=tx_data.get('amount', 0.0),
            date=date,
            transaction_type=tx_data.get('transaction_type', 'expense'),
            category_id=category_id,
            card_used=tx_data.get('card_used', ''),
            split_method=tx_data.get('split_method', 'none'),
            paid_by=tx_data.get('paid_by', user_id),
            user_id=user_id,
            currency_code=tx_data.get('currency_code'),
            original_amount=tx_data.get('original_amount'),
            import_source=tx_data.get('import_source', 'import'),
            external_id=tx_data.get('external_id'),
        )
        db.session.add(expense)
        stats['transactions'] += 1

    # --- 4. Budgets ---
    for bgt_data in data.get('budgets', []):
        cat_exported_id = bgt_data.get('category_exported_id')
        category_id = cat_id_map.get(cat_exported_id) if cat_exported_id else None
        if not category_id:
            continue  # budgets require a category

        budget = Budget(
            name=bgt_data.get('name'),
            amount=bgt_data.get('amount', 0.0),
            period=bgt_data.get('period', 'monthly'),
            category_id=category_id,
            include_subcategories=bgt_data.get('include_subcategories', True),
            is_recurring=bgt_data.get('is_recurring', True),
            active=bgt_data.get('active', True),
            rollover=bgt_data.get('rollover', False),
            user_id=user_id,
        )
        db.session.add(budget)
        stats['budgets'] += 1

    db.session.commit()
    return stats
