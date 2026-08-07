"""Accounts API endpoints"""
from flask import request, current_app
from flask_restx import Namespace, Resource, fields
from flask_jwt_extended import jwt_required, get_jwt_identity
from src.models.account import Account
from src.extensions import db
from schemas import account_schema, accounts_schema
from schemas.input_schemas import account_input
from src.utils.validation import validate_request, validation_error_response
from src.utils.household import visible_user_ids, is_household_member, can_manage_owned
from src.repositories.account import AccountRepository
from src.services.account.service import AccountService
from datetime import datetime
import logging
from src.models.personal_access_token import SCOPE_READ
from src.utils.api_auth import api_auth_required

logger = logging.getLogger(__name__)

# Create namespace
ns = Namespace('accounts', description='Account operations')

# Define request/response models
#
# This is the body POST and PUT advertise via `@ns.expect`, so it has to be a
# body that works. It listed two fields that were never real (AUDIT.md D-05):
#
#   'account_number'  no column on Account, no handler, nothing anywhere. The
#                     mobile form had an "Account Number (last 4 digits)" input
#                     because of this line, and every value typed into it was
#                     discarded on save.
#   'is_active'       also not a column. The nearest real thing is `status`
#                     ('active' / 'inactive' / 'closed'), which no write handler
#                     accepts, so advertising a boolean spelling of it would just
#                     be a second way to be ignored.
#
# Nothing rejected them: `validate_request` loads with `unknown=EXCLUDE`, so a
# client following the docs got a 201 and silently lost part of what it sent.
# The fields below are the ones `AccountInput` accepts and the handlers apply.
# `tests/integration/test_accounts_documented_fields.py` asserts that, by
# POSTing every documented field and reading the row back out of the database.
account_model = ns.model('Account', {
    'name': fields.String(required=True, description='Account name'),
    'account_type': fields.String(required=True, description='Account type (checking, savings, credit, etc.)'),
    'balance': fields.Float(description='Initial balance'),
    'currency_code': fields.String(description='Currency code'),
    'institution': fields.String(description='Financial institution name'),
    'color': fields.String(description='Account color (hex code)'),
    # Deliberately NOT required: omitting it assigns the account to the caller, and
    # a required-field claim the server does not enforce breaks a generated client
    # exactly as badly as a missing route (#68).
    'owner_id': fields.String(
        description='Household member to assign this account to. '
                    'Defaults to the calling user. Must be a household member — '
                    'a demo account or an unknown id is refused with 400.'),
})


@ns.route('/')
class AccountList(Resource):
    @ns.doc('list_accounts', security='Bearer')
    # Accepts a personal access token as well as a session, so an MCP
    # client or script can read. Reads need authentication only; the
    # write tiering is separate and unchanged.
    @api_auth_required(scope=SCOPE_READ)
    def get(self):
        """Get all accounts for household"""
        current_user_id = get_jwt_identity()

        try:
            # `visible_user_ids`, not `get_all_user_ids`: the latter includes demo
            # accounts, and the detail route below excludes them. Leaving this one
            # wider would put a row in the list that its viewer cannot open — the
            # exact list/detail disagreement D-43 is.
            accounts = AccountRepository().get_all_for_household(
                visible_user_ids(current_user_id))

            # Serialize
            result = accounts_schema.dump(accounts)

            return {
                'success': True,
                'accounts': result
            }, 200
        except Exception as e:
            logger.exception("Failed to list accounts")
            return {'success': False, 'error': 'Internal server error'}, 500

    @ns.doc('create_account', security='Bearer')
    @ns.expect(account_model)
    @jwt_required()
    def post(self):
        """Create a new account"""
        current_user_id = get_jwt_identity()
        data = request.get_json()

        validated, errors = validate_request(account_input, data)
        if errors:
            return validation_error_response(errors)

        svc = AccountService()
        success, message, new_account = svc.add_account(
            user_id=current_user_id,
            name=validated['name'],
            account_type=validated['account_type'],
            institution=validated.get('institution', ''),
            balance=validated.get('balance', 0),
            currency_code=validated.get('currency_code', 'USD'),
            color=validated.get('color'),
            owner_id=validated.get('owner_id'),
        )

        if not success:
            return {'success': False, 'error': message}, 400

        result = account_schema.dump(new_account)
        return {'success': True, 'account': result, 'message': 'Account created successfully'}, 201


@ns.route('/<int:id>')
@ns.param('id', 'Account ID')
class AccountDetail(Resource):
    @ns.doc('get_account', security='Bearer')
    @jwt_required()
    def get(self, id):
        """Get a specific account by ID"""
        current_user_id = get_jwt_identity()

        # Household-scoped, matching the list route. Caller-scoped here was D-43: the
        # list showed a housemate's account and opening it answered 404.
        account = AccountRepository().get_by_id_in_household(
            id, visible_user_ids(current_user_id))

        if not account:
            return {'success': False, 'error': 'Account not found'}, 404

        result = account_schema.dump(account)

        return {
            'success': True,
            'account': result
        }, 200

    @ns.doc('update_account', security='Bearer')
    @ns.expect(account_model)
    @jwt_required()
    def put(self, id):
        """Update an account"""
        current_user_id = get_jwt_identity()

        # Household-scoped, matching the list route. Caller-scoped here was D-43: the
        # list showed a housemate's account and opening it answered 404.
        account = AccountRepository().get_by_id_in_household(
            id, visible_user_ids(current_user_id))

        if not account:
            return {'success': False, 'error': 'Account not found'}, 404

        # Seeing a housemate's account and being allowed to change it are different
        # questions. Reads above stay household-wide (D-43); mutation is owner-or-admin
        # (D-47). Checked after the fetch so a non-existent id still answers 404 rather
        # than leaking existence through a 403.
        if not can_manage_owned(account.user_id, current_user_id):
            return {
                'success': False,
                'error': 'Only the account owner or a household admin can change this account',
            }, 403

        data = request.get_json() or {}
        if not data:
            return {'success': False, 'error': 'Request body required'}, 400

        try:
            if 'name' in data:
                account.name = data['name']
            if 'account_type' in data:
                account.type = data['account_type']
            if 'balance' in data:
                account.balance = data['balance']
            if 'currency_code' in data:
                account.currency_code = data['currency_code']
            if 'institution' in data:
                account.institution = data['institution']
            if 'color' in data:
                account.color = data['color']
            if 'external_id' in data:
                account.external_id = data['external_id']
            if 'owner_id' in data:
                # Reassignment. Refused for a non-member so that a demo account or a
                # stranger's id cannot be handed household property, and refused
                # before the commit so a rejected reassignment leaves nothing behind.
                if not is_household_member(data['owner_id']):
                    db.session.rollback()
                    return {
                        'success': False,
                        'error': 'Owner must be a member of this household',
                    }, 400
                account.user_id = data['owner_id']

            db.session.commit()

            result = account_schema.dump(account)

            return {
                'success': True,
                'account': result,
                'message': 'Account updated successfully'
            }, 200

        except Exception as e:
            db.session.rollback()
            return {
                'success': False,
                'error': 'Internal server error'
            }, 400

    @ns.doc('delete_account', security='Bearer')
    @jwt_required()
    def delete(self, id):
        """Delete an account"""
        current_user_id = get_jwt_identity()

        svc = AccountService()
        success, message = svc.delete_account(id, current_user_id)

        if not success:
            status = 404 if 'not found' in message.lower() else 403
            return {'success': False, 'error': message}, status

        return {'success': True, 'message': 'Account deleted successfully'}, 200


@ns.route('/<int:id>/balance')
@ns.param('id', 'Account ID')
class AccountBalance(Resource):
    @ns.doc('get_account_balance', security='Bearer')
    @jwt_required()
    def get(self, id):
        """Get calculated balance for an account"""
        current_user_id = get_jwt_identity()

        # Household-scoped, matching the list route. Caller-scoped here was D-43: the
        # list showed a housemate's account and opening it answered 404.
        account = AccountRepository().get_by_id_in_household(
            id, visible_user_ids(current_user_id))

        if not account:
            return {'success': False, 'error': 'Account not found'}, 404

        # Get calculated balance if method exists
        calculated_balance = account.get_balance() if hasattr(account, 'get_balance') else account.balance

        return {
            'success': True,
            'account_id': account.id,
            'account_name': account.name,
            'balance': calculated_balance,
            'currency_code': account.currency_code
        }, 200


def _simplefin_required():
    """Return a 503 error dict if SimpleFin is disabled, else None."""
    if not current_app.config.get('SIMPLEFIN_ENABLED', False):
        return {'success': False, 'error': 'SimpleFin integration is not enabled on this server'}, 503
    return None


@ns.route('/<int:id>/sync')
@ns.param('id', 'Account ID')
class AccountSync(Resource):
    @ns.doc('sync_account', security='Bearer')
    @jwt_required()
    def post(self, id):
        """Sync SimpleFin account"""
        err = _simplefin_required()
        if err:
            return err
        from src.services.account.service import SimpleFinService

        current_user_id = get_jwt_identity()
        simplefin_service = SimpleFinService()

        success, message, synced_count = simplefin_service.sync_account(id, current_user_id)

        if success:
            return {
                'success': True,
                'message': message,
                'syncedCount': synced_count,
                'lastSync': datetime.utcnow().isoformat()
            }, 200
        else:
            return {'success': False, 'error': message}, 400


@ns.route('/simplefin/connect')
class SimpleFinConnect(Resource):
    @ns.doc('connect_simplefin', security='Bearer')
    @jwt_required()
    def post(self):
        """Save SimpleFin access token"""
        err = _simplefin_required()
        if err:
            return err
        from src.services.account.service import SimpleFinService

        current_user_id = get_jwt_identity()
        data = request.get_json()

        access_url = data.get('access_url')
        if not access_url:
            return {'success': False, 'error': 'Access URL is required'}, 400

        simplefin_service = SimpleFinService()
        success, message = simplefin_service.save_simplefin_token(current_user_id, access_url)

        if success:
            # Get updated status
            settings = simplefin_service.get_simplefin_settings(current_user_id)
            return {
                'connected': True,
                'lastSync': settings.last_sync.isoformat() if settings and settings.last_sync else None,
                'syncFrequency': settings.sync_frequency if settings else 'daily',
                'enabled': settings.enabled if settings else True
            }, 200
        else:
            return {'success': False, 'error': message}, 400


@ns.route('/simplefin/status')
class SimpleFinStatus(Resource):
    @ns.doc('get_simplefin_status', security='Bearer')
    @jwt_required()
    def get(self):
        """Get SimpleFin connection status"""
        err = _simplefin_required()
        if err:
            return err
        from src.services.account.service import SimpleFinService
        from src.models.account import SimpleFin

        current_user_id = get_jwt_identity()
        simplefin_service = SimpleFinService()

        settings = simplefin_service.get_simplefin_settings(current_user_id)

        if settings:
            # Count SimpleFin accounts
            account_count = Account.query.filter_by(
                user_id=current_user_id,
                import_source='simplefin'
            ).count()

            return {
                'connected': True,
                'lastSync': settings.last_sync.isoformat() if settings.last_sync else None,
                'accountCount': account_count,
                'syncFrequency': settings.sync_frequency,
                'enabled': settings.enabled
            }, 200
        else:
            return {
                'connected': False
            }, 200


@ns.route('/simplefin/disconnect')
class SimpleFinDisconnect(Resource):
    @ns.doc('disconnect_simplefin', security='Bearer')
    @jwt_required()
    def post(self):
        """Disconnect SimpleFin integration"""
        err = _simplefin_required()
        if err:
            return err
        from src.services.account.service import SimpleFinService

        current_user_id = get_jwt_identity()
        simplefin_service = SimpleFinService()

        success, message = simplefin_service.disconnect_simplefin(current_user_id)

        if success:
            return {'success': True, 'message': message}, 200
        else:
            return {'success': False, 'error': message}, 400


@ns.route('/simplefin/import')
class SimpleFinImport(Resource):
    @ns.doc('import_simplefin_accounts', security='Bearer')
    @jwt_required()
    def post(self):
        """
        Import selected SimpleFin accounts into finPal.
        Body: {"account_ids": ["sf_id_1", "sf_id_2"]}
        """
        err = _simplefin_required()
        if err:
            return err
        from src.services.account.service import SimpleFinService

        current_user_id = get_jwt_identity()
        data = request.get_json() or {}
        account_ids = data.get('account_ids', [])

        if not account_ids:
            return {'success': False, 'error': 'account_ids is required'}, 400

        simplefin_service = SimpleFinService()
        success, message, results = simplefin_service.import_simplefin_accounts(
            current_user_id, account_ids, owner_id=data.get('owner_id')
        )

        if success:
            return {'success': True, 'message': message, 'accounts': results}, 200
        return {'success': False, 'error': message}, 400


@ns.route('/simplefin/sync-all')
class SimpleFinSyncAll(Resource):
    @ns.doc('sync_all_simplefin', security='Bearer')
    @jwt_required()
    def post(self):
        """Sync all SimpleFin accounts for the current user."""
        err = _simplefin_required()
        if err:
            return err
        from src.services.account.service import SimpleFinService

        current_user_id = get_jwt_identity()
        simplefin_service = SimpleFinService()
        success, message, results = simplefin_service.sync_all_accounts(current_user_id)

        return {
            'success': success,
            'message': message,
            'results': results,
        }, 200


@ns.route('/simplefin/fetch')
class SimpleFinFetch(Resource):
    @ns.doc('fetch_simplefin_accounts', security='Bearer')
    @jwt_required()
    def post(self):
        """Fetch available SimpleFin accounts"""
        err = _simplefin_required()
        if err:
            return err
        from src.services.account.service import SimpleFinService
        from integrations.simplefin.client import SimpleFin as SimpleFinClient
        from flask import current_app

        current_user_id = get_jwt_identity()
        simplefin_service = SimpleFinService()

        # Get SimpleFin settings
        settings = simplefin_service.get_simplefin_settings(current_user_id)

        if not settings:
            return {'success': False, 'error': 'SimpleFin not connected'}, 400

        try:
            # Initialize SimpleFin client
            sf_client = SimpleFinClient(current_app)

            # Fetch accounts with transactions
            raw_data = sf_client.get_accounts_with_transactions(settings.access_url, days_back=30)

            if not raw_data:
                return {'success': False, 'error': 'Failed to fetch accounts from SimpleFin'}, 500

            # Process accounts
            processed_accounts = sf_client.process_raw_accounts(raw_data)

            # Convert to API format
            accounts = []
            for acc in processed_accounts:
                accounts.append({
                    'id': acc['id'],
                    'name': acc['name'],
                    'type': acc['type'],
                    'institution': acc['institution'],
                    'balance': acc['balance'],
                    'currency': acc['currency_code'],
                    'color': acc.get('color', '#3b82f6')
                })

            return {
                'success': True,
                'accounts': accounts
            }, 200

        except Exception as e:
            current_app.logger.error(f"Error fetching SimpleFin accounts: {str(e)}")
            return {'success': False, 'error': 'Internal server error'}, 500


@ns.route('/import-csv')
class CSVImport(Resource):
    @ns.doc('import_csv', security='Bearer')
    @jwt_required()
    def post(self):
        """Import transactions from CSV file"""
        from src.services.account.service import AccountService

        current_user_id = get_jwt_identity()

        if 'csv_file' not in request.files:
            return {'success': False, 'error': 'No file uploaded'}, 400

        csv_file = request.files['csv_file']

        if csv_file.filename == '':
            return {'success': False, 'error': 'No file selected'}, 400

        if not csv_file.filename.lower().endswith('.csv'):
            return {'success': False, 'error': 'File must be a CSV'}, 400

        # Get account ID if specified
        account_id = request.form.get('account_id')
        if account_id:
            try:
                account_id = int(account_id)
            except ValueError:
                account_id = None

        account_service = AccountService()
        success, message, imported_count, skipped_count = account_service.import_csv(
            current_user_id, csv_file, account_id
        )

        if success:
            return {
                'success': True,
                'importedCount': imported_count,
                'skippedCount': skipped_count,
                'message': message
            }, 200
        else:
            return {
                'success': False,
                'error': message
            }, 400


@ns.route('/export-csv')
class CSVExport(Resource):
    @ns.doc('export_csv', security='Bearer')
    @jwt_required()
    def get(self):
        """Export transactions to CSV"""
        from src.models.transaction import Expense
        from flask import make_response
        import csv
        import io
        from datetime import datetime

        current_user_id = get_jwt_identity()

        # Get query parameters
        account_id = request.args.get('account_id', type=int)
        start_date = request.args.get('start_date')
        end_date = request.args.get('end_date')

        # Build query
        query = Expense.query.filter_by(user_id=current_user_id)

        if account_id:
            query = query.filter_by(account_id=account_id)

        if start_date:
            try:
                start_dt = datetime.strptime(start_date, '%Y-%m-%d')
                query = query.filter(Expense.date >= start_dt)
            except ValueError:
                pass

        if end_date:
            try:
                end_dt = datetime.strptime(end_date, '%Y-%m-%d')
                query = query.filter(Expense.date <= end_dt)
            except ValueError:
                pass

        transactions = query.order_by(Expense.date.desc()).all()

        # Create CSV in memory
        output = io.StringIO()
        writer = csv.writer(output)

        # Write header
        writer.writerow(['Date', 'Description', 'Amount', 'Type', 'Category', 'Account', 'Currency'])

        # Write data
        for trans in transactions:
            writer.writerow([
                trans.date.strftime('%Y-%m-%d'),
                trans.description,
                trans.amount,
                trans.transaction_type or 'expense',
                trans.category.name if trans.category else '',
                trans.card_used,
                trans.currency_code or 'USD'
            ])

        # Create response
        output.seek(0)
        response = make_response(output.getvalue())
        response.headers['Content-Disposition'] = 'attachment; filename=transactions.csv'
        response.headers['Content-Type'] = 'text/csv'

        return response
