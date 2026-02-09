"""Accounts API endpoints"""
from flask import request
from flask_restx import Namespace, Resource, fields
from flask_jwt_extended import jwt_required, get_jwt_identity
from src.models.account import Account
from src.extensions import db
from schemas import account_schema, accounts_schema
from datetime import datetime

# Create namespace
ns = Namespace('accounts', description='Account operations')

# Define request/response models
account_model = ns.model('Account', {
    'name': fields.String(required=True, description='Account name'),
    'account_type': fields.String(required=True, description='Account type (checking, savings, credit, etc.)'),
    'balance': fields.Float(description='Initial balance'),
    'currency_code': fields.String(description='Currency code'),
    'institution': fields.String(description='Financial institution name'),
    'account_number': fields.String(description='Account number (last 4 digits)'),
    'is_active': fields.Boolean(description='Whether account is active'),
    'color': fields.String(description='Account color (hex code)'),
})


@ns.route('/')
class AccountList(Resource):
    @ns.doc('list_accounts', security='Bearer')
    @jwt_required()
    def get(self):
        """Get all accounts for household"""
        from src.utils.household import get_all_user_ids
        current_user_id = get_jwt_identity()

        # Get all accounts for the household
        accounts = Account.query.filter(Account.user_id.in_(get_all_user_ids())).all()

        # Serialize
        result = accounts_schema.dump(accounts)

        return {
            'success': True,
            'accounts': result
        }, 200

    @ns.doc('create_account', security='Bearer')
    @ns.expect(account_model)
    @jwt_required()
    def post(self):
        """Create a new account"""
        current_user_id = get_jwt_identity()
        data = request.get_json()

        try:
            new_account = Account(
                name=data.get('name'),
                type=data.get('account_type'),
                balance=data.get('balance', 0),
                currency_code=data.get('currency_code', 'USD'),
                institution=data.get('institution', ''),
                color=data.get('color'),
                user_id=current_user_id
            )

            db.session.add(new_account)
            db.session.commit()

            result = account_schema.dump(new_account)

            return {
                'success': True,
                'account': result,
                'message': 'Account created successfully'
            }, 201

        except Exception as e:
            db.session.rollback()
            return {
                'success': False,
                'error': str(e)
            }, 400


@ns.route('/<int:id>')
@ns.param('id', 'Account ID')
class AccountDetail(Resource):
    @ns.doc('get_account', security='Bearer')
    @jwt_required()
    def get(self, id):
        """Get a specific account by ID"""
        current_user_id = get_jwt_identity()

        account = Account.query.filter_by(id=id, user_id=current_user_id).first()

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

        account = Account.query.filter_by(id=id, user_id=current_user_id).first()

        if not account:
            return {'success': False, 'error': 'Account not found'}, 404

        data = request.get_json()

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
                'error': str(e)
            }, 400

    @ns.doc('delete_account', security='Bearer')
    @jwt_required()
    def delete(self, id):
        """Delete an account"""
        current_user_id = get_jwt_identity()

        account = Account.query.filter_by(id=id, user_id=current_user_id).first()

        if not account:
            return {'success': False, 'error': 'Account not found'}, 404

        try:
            db.session.delete(account)
            db.session.commit()

            return {
                'success': True,
                'message': 'Account deleted successfully'
            }, 200

        except Exception as e:
            db.session.rollback()
            return {
                'success': False,
                'error': str(e)
            }, 400


@ns.route('/<int:id>/balance')
@ns.param('id', 'Account ID')
class AccountBalance(Resource):
    @ns.doc('get_account_balance', security='Bearer')
    @jwt_required()
    def get(self, id):
        """Get calculated balance for an account"""
        current_user_id = get_jwt_identity()

        account = Account.query.filter_by(id=id, user_id=current_user_id).first()

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


@ns.route('/<int:id>/sync')
@ns.param('id', 'Account ID')
class AccountSync(Resource):
    @ns.doc('sync_account', security='Bearer')
    @jwt_required()
    def post(self, id):
        """Sync SimpleFin account"""
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
        from src.services.account.service import SimpleFinService

        current_user_id = get_jwt_identity()
        simplefin_service = SimpleFinService()

        success, message = simplefin_service.disconnect_simplefin(current_user_id)

        if success:
            return {'success': True, 'message': message}, 200
        else:
            return {'success': False, 'error': message}, 400


@ns.route('/simplefin/fetch')
class SimpleFinFetch(Resource):
    @ns.doc('fetch_simplefin_accounts', security='Bearer')
    @jwt_required()
    def post(self):
        """Fetch available SimpleFin accounts"""
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
            return {'success': False, 'error': f'Error fetching accounts: {str(e)}'}, 500


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
