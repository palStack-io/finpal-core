"""
Account Service
Business logic for account management, CSV import, and SimpleFin integration
"""

import csv
import io
import json
from datetime import datetime
from flask import current_app
from src.extensions import db
from src.models.account import Account, SimpleFin
from src.models.transaction import Expense
from src.models.currency import Currency
from src.models.user import User
from src.utils.currency_converter import convert_currency, get_base_currency
from src.utils.helpers import auto_categorize_transaction


class AccountService:
    """Service class for account operations"""

    def __init__(self):
        pass

    # Account CRUD Methods

    def get_all_accounts(self, user_id):
        """Get all accounts for the household"""
        from src.utils.household import get_all_user_ids
        return Account.query.filter(Account.user_id.in_(get_all_user_ids())).all()

    def get_account(self, account_id, user_id):
        """
        Get a specific account with transaction count
        Returns (success, message, account_data)
        """
        account = Account.query.get(account_id)
        if not account:
            return False, 'Account not found', None

        if account.user_id != user_id:
            return False, 'You do not have permission to view this account', None

        # Get transaction count
        transaction_count = Expense.query.filter_by(account_id=account_id).count()

        user = User.query.get(user_id)
        default_currency = user.default_currency_code if user else 'USD'

        account_data = {
            'id': account.id,
            'name': account.name,
            'type': account.type,
            'institution': account.institution,
            'balance': account.balance,
            'currency_code': account.currency_code or default_currency,
            'transaction_count': transaction_count,
            'import_source': account.import_source
        }

        return True, 'Success', account_data

    def add_account(self, user_id, name, account_type, institution, balance, currency_code, color=None, import_source=None, external_id=None):
        """
        Add a new account
        Returns (success, message, account)
        """
        if not name or not account_type:
            return False, 'Account name and type are required', None

        try:
            balance = float(balance) if balance else 0

            # Get default color for account type if not provided
            if not color:
                from integrations.simplefin.client import SimpleFin
                color = SimpleFin.get_default_color_for_type(account_type)

            account = Account(
                name=name,
                type=account_type,
                institution=institution,
                balance=balance,
                currency_code=currency_code,
                color=color,
                import_source=import_source,
                external_id=external_id,
                user_id=user_id
            )

            db.session.add(account)
            db.session.commit()

            return True, 'Account added successfully', account

        except Exception as e:
            db.session.rollback()
            current_app.logger.error(f"Error adding account: {str(e)}")
            return False, f'Error adding account: {str(e)}', None

    def update_account(self, account_id, user_id, name, account_type, institution, balance, currency_code):
        """
        Update an existing account
        Returns (success, message)
        """
        account = Account.query.get(account_id)
        if not account:
            return False, 'Account not found'

        if account.user_id != user_id:
            return False, 'You do not have permission to edit this account'

        try:
            account.name = name
            account.type = account_type
            account.institution = institution
            account.balance = float(balance) if balance else 0
            account.currency_code = currency_code

            db.session.commit()
            return True, 'Account updated successfully'

        except Exception as e:
            db.session.rollback()
            current_app.logger.error(f"Error updating account: {str(e)}")
            return False, f'Error updating account: {str(e)}'

    def delete_account(self, account_id, user_id):
        """
        Delete an account (soft delete - just removes link from transactions)
        Returns (success, message)
        """
        account = Account.query.get(account_id)
        if not account:
            return False, 'Account not found'

        if account.user_id != user_id:
            return False, 'You do not have permission to delete this account'

        try:
            # Update all transactions to remove account reference
            Expense.query.filter_by(account_id=account_id).update({'account_id': None})

            # Delete the account
            db.session.delete(account)
            db.session.commit()

            return True, 'Account deleted successfully'

        except Exception as e:
            db.session.rollback()
            current_app.logger.error(f"Error deleting account: {str(e)}")
            return False, f'Error deleting account: {str(e)}'

    def calculate_financial_summary(self, user_id, user_currency_code=None):
        """
        Calculate total assets, liabilities, and net worth
        Returns (total_assets, total_liabilities, net_worth, user_currency)
        """
        accounts = self.get_all_accounts(user_id)

        # Get user's preferred currency
        user = User.query.get(user_id)
        if not user_currency_code:
            user_currency_code = user.default_currency_code if user else None

        user_currency = None
        if user_currency_code:
            user_currency = Currency.query.filter_by(code=user_currency_code).first()

        # Fall back to base currency
        if not user_currency:
            user_currency = Currency.query.filter_by(is_base=True).first()

        # Ultimate fallback to USD
        if not user_currency:
            user_currency = Currency.query.filter_by(code='USD').first()
            if not user_currency:
                user_currency = Currency(code='USD', name='US Dollar', symbol='$', rate_to_base=1.0)

        user_currency_code = user_currency.code

        total_assets = 0
        total_liabilities = 0

        for account in accounts:
            balance = account.balance or 0

            # Skip near-zero balances
            if abs(balance) < 0.01:
                continue

            # Get account's currency code
            account_currency = account.currency_code or user_currency_code

            # Convert to user's preferred currency if different
            if account_currency != user_currency_code:
                converted_balance = convert_currency(balance, account_currency, user_currency_code)
            else:
                converted_balance = balance

            # Add to appropriate total
            if account.type in ['checking', 'savings', 'investment'] and converted_balance > 0:
                total_assets += converted_balance
            elif account.type in ['credit', 'loan'] or converted_balance < 0:
                total_liabilities += abs(converted_balance)

        net_worth = total_assets - total_liabilities

        return total_assets, total_liabilities, net_worth, user_currency

    # CSV Import Methods

    def import_csv(self, user_id, csv_file, account_id=None):
        """
        Import transactions from CSV file
        Returns (success, message, imported_count, skipped_count)
        """
        try:
            # Read and decode file
            file_content = csv_file.read().decode('utf-8')

            # Detect delimiter
            delimiter = self._detect_csv_delimiter(file_content)

            # Parse CSV
            csv_reader = csv.DictReader(io.StringIO(file_content), delimiter=delimiter)

            imported_count = 0
            skipped_count = 0

            for row in csv_reader:
                try:
                    # Parse transaction from row
                    success, transaction = self._parse_csv_row(user_id, row, account_id)

                    if success and transaction:
                        db.session.add(transaction)
                        imported_count += 1
                    else:
                        skipped_count += 1

                except Exception as row_error:
                    current_app.logger.error(f"Error processing CSV row: {str(row_error)}")
                    skipped_count += 1

            db.session.commit()
            return True, f'Imported {imported_count} transactions ({skipped_count} skipped)', imported_count, skipped_count

        except Exception as e:
            db.session.rollback()
            current_app.logger.error(f"Error importing CSV: {str(e)}")
            return False, f'Error importing CSV: {str(e)}', 0, 0

    def _detect_csv_delimiter(self, file_content):
        """Detect CSV delimiter from file content"""
        first_line = file_content.split('\n')[0]

        if ',' in first_line:
            return ','
        elif ';' in first_line:
            return ';'
        elif '\t' in first_line:
            return '\t'
        else:
            return ','

    def _parse_csv_row(self, user_id, row, account_id):
        """Parse a CSV row into a transaction"""
        # Get date
        date_str = row.get('Date') or row.get('date') or row.get('DATE')
        if not date_str:
            return False, None

        try:
            transaction_date = datetime.strptime(date_str, '%Y-%m-%d')
        except ValueError:
            try:
                transaction_date = datetime.strptime(date_str, '%m/%d/%Y')
            except ValueError:
                return False, None

        # Get description
        description = row.get('Description') or row.get('description') or row.get('DESCRIPTION') or ''

        # Get amount
        amount_str = row.get('Amount') or row.get('amount') or row.get('AMOUNT')
        if not amount_str:
            return False, None

        try:
            amount = abs(float(amount_str))
        except ValueError:
            return False, None

        if amount == 0:
            return False, None

        # Determine transaction type
        transaction_type = self._determine_transaction_type(row, amount_str)

        # Get category
        category_name = row.get('Category') or row.get('category') or row.get('CATEGORY')
        category_id = None

        if category_name:
            from src.models.category import Category
            category = Category.query.filter_by(user_id=user_id, name=category_name).first()
            if category:
                category_id = category.id

        # Auto-categorize if no category and not a transfer
        if not category_id and transaction_type != 'transfer':
            category_id = auto_categorize_transaction(description, user_id)

        # Get currency
        user = User.query.get(user_id)
        currency_code = row.get('Currency') or row.get('currency') or user.default_currency_code or 'USD'

        # Get account name if specified
        card_used = row.get('Account') or row.get('account') or 'CSV Import'

        # Create transaction
        transaction = Expense(
            description=description,
            amount=amount,
            original_amount=amount,
            currency_code=currency_code,
            date=transaction_date,
            card_used=card_used,
            split_method='equal',
            split_value=0,
            paid_by=user_id,
            user_id=user_id,
            category_id=category_id,
            transaction_type=transaction_type,
            account_id=account_id,
            import_source='csv'
        )

        return True, transaction

    def _determine_transaction_type(self, row, amount_str):
        """Determine transaction type from CSV row"""
        # Check if explicit type column exists
        transaction_type = row.get('Type') or row.get('type') or row.get('TYPE')
        if transaction_type:
            transaction_type = transaction_type.lower()
            if transaction_type in ['expense', 'income', 'transfer']:
                return transaction_type

        # Check amount sign
        try:
            amount_value = float(amount_str)
            if amount_value > 0:
                return 'income'
            else:
                return 'expense'
        except ValueError:
            return 'expense'


class SimpleFinService:
    """Service class for SimpleFin integration operations"""

    def __init__(self):
        pass

    def save_simplefin_token(self, user_id, access_url):
        """
        Save SimpleFin access token
        Returns (success, message)
        """
        try:
            existing = SimpleFin.query.filter_by(user_id=user_id).first()

            if existing:
                existing.access_url = access_url
                existing.updated_at = datetime.utcnow()
            else:
                simplefin = SimpleFin(
                    user_id=user_id,
                    access_url=access_url,
                )
                db.session.add(simplefin)

            db.session.commit()
            return True, 'SimpleFin connected successfully'

        except Exception as e:
            db.session.rollback()
            current_app.logger.error(f"Error saving SimpleFin token: {str(e)}")
            return False, f'Error connecting SimpleFin: {str(e)}'

    def disconnect_simplefin(self, user_id):
        """
        Disconnect SimpleFin integration
        Returns (success, message)
        """
        try:
            simplefin = SimpleFin.query.filter_by(user_id=user_id).first()
            if simplefin:
                db.session.delete(simplefin)
                db.session.commit()
                return True, 'SimpleFin disconnected successfully'
            else:
                return False, 'No SimpleFin connection found'

        except Exception as e:
            db.session.rollback()
            current_app.logger.error(f"Error disconnecting SimpleFin: {str(e)}")
            return False, f'Error disconnecting SimpleFin: {str(e)}'

    def get_simplefin_settings(self, user_id):
        """Get SimpleFin settings for a user"""
        return SimpleFin.query.filter_by(user_id=user_id).first()

    # ------------------------------------------------------------------
    # Account import
    # ------------------------------------------------------------------

    def import_simplefin_accounts(self, user_id, simplefin_account_ids):
        """
        Given a list of SimpleFin account IDs chosen by the user, create or
        update Account rows in the database.
        Returns (success, message, list_of_result_dicts)
        """
        from integrations.simplefin.client import SimpleFin as SimpleFinClient

        settings = SimpleFin.query.filter_by(user_id=user_id).first()
        if not settings or not settings.access_url:
            return False, 'SimpleFin not connected', []

        try:
            sf_client = SimpleFinClient(current_app)
            # Fetch with days_back=1 just to get current balances — no transactions needed
            raw_data = sf_client.get_accounts_with_transactions(
                settings.access_url, days_back=1
            )
            if not raw_data:
                return False, 'Failed to fetch accounts from SimpleFin', []

            processed = sf_client.process_raw_accounts(raw_data)
            results = []

            for acc in processed:
                if acc['id'] not in simplefin_account_ids:
                    continue

                existing = Account.query.filter_by(
                    user_id=user_id,
                    external_id=acc['id'],
                    import_source='simplefin'
                ).first()

                if existing:
                    existing.balance = acc['balance']
                    existing.last_sync = datetime.utcnow()
                    results.append({
                        'id': existing.id,
                        'name': existing.name,
                        'status': 'updated'
                    })
                else:
                    account = Account(
                        name=acc['name'],
                        type=acc['type'],
                        institution=acc['institution'],
                        balance=acc['balance'],
                        currency_code=acc['currency_code'],
                        color=acc.get('color', '#3b82f6'),
                        import_source='simplefin',
                        external_id=acc['id'],
                        user_id=user_id,
                        last_sync=datetime.utcnow(),
                    )
                    db.session.add(account)
                    db.session.flush()
                    results.append({
                        'id': account.id,
                        'name': account.name,
                        'status': 'imported'
                    })

            db.session.commit()
            return True, f'{len(results)} account(s) processed', results

        except Exception as e:
            db.session.rollback()
            current_app.logger.error(f"Error importing SimpleFin accounts: {str(e)}")
            return False, str(e), []

    # ------------------------------------------------------------------
    # Transaction sync
    # ------------------------------------------------------------------

    def sync_account(self, account_id, user_id):
        """
        Fetch new transactions from SimpleFin for a single account and write
        them to the expenses table.
        Returns (success, message, synced_count)
        """
        from integrations.simplefin.client import SimpleFin as SimpleFinClient

        account = Account.query.get(account_id)
        if not account:
            return False, 'Account not found', 0
        if account.user_id != user_id:
            return False, 'Permission denied', 0
        if account.import_source != 'simplefin':
            return False, 'Not a SimpleFin account', 0
        if not account.external_id:
            return False, 'Account has no SimpleFin ID', 0

        settings = SimpleFin.query.filter_by(user_id=user_id).first()
        if not settings or not settings.access_url:
            return False, 'SimpleFin not connected', 0

        # How far back to fetch — buffer of 2 days beyond last sync
        if account.last_sync:
            days_since = (datetime.utcnow() - account.last_sync).days
            days_back = max(days_since + 2, 3)
        else:
            days_back = 30

        try:
            sf_client = SimpleFinClient(current_app)
            raw_data = sf_client.get_accounts_with_transactions(
                settings.access_url, days_back=days_back
            )
            if not raw_data:
                return False, 'Failed to fetch data from SimpleFin', 0

            # Find this specific account in the response by external_id
            account_raw = next(
                (a for a in raw_data.get('accounts', [])
                 if a.get('id') == account.external_id),
                None
            )
            if not account_raw:
                return False, 'Account not found in SimpleFin response', 0

            processed_list = sf_client.process_raw_accounts([account_raw])
            if not processed_list:
                return True, 'No data returned', 0

            account_data = processed_list[0]
            imported_count = 0

            for trans in account_data.get('transactions', []):
                external_id = trans.get('external_id')
                if not external_id:
                    continue

                # Skip duplicates
                if Expense.query.filter_by(
                    user_id=user_id,
                    external_id=external_id,
                    import_source='simplefin'
                ).first():
                    continue

                # Auto-categorize using user's category mapping rules
                category_id = auto_categorize_transaction(
                    trans.get('description', ''), user_id
                )

                expense = Expense(
                    description=trans.get('description', 'SimpleFin Transaction'),
                    amount=trans['amount'],
                    original_amount=trans['amount'],
                    currency_code=account.currency_code or 'USD',
                    date=trans['date'],
                    card_used=account.name,
                    transaction_type=trans.get('transaction_type', 'expense'),
                    split_method='equal',
                    split_value=0,
                    paid_by=user_id,
                    user_id=user_id,
                    account_id=account_id,
                    external_id=external_id,
                    import_source='simplefin',
                    category_id=category_id,
                )
                db.session.add(expense)
                imported_count += 1

            # Update balance from latest SimpleFin data
            if account_data.get('balance') is not None:
                account.balance = account_data['balance']
            account.last_sync = datetime.utcnow()

            db.session.commit()
            return True, f'Synced {imported_count} new transaction(s)', imported_count

        except Exception as e:
            db.session.rollback()
            current_app.logger.error(
                f"SimpleFin sync error for account {account_id}: {str(e)}"
            )
            return False, str(e), 0

    def sync_all_accounts(self, user_id):
        """
        Sync all SimpleFin accounts for a user.
        Returns (success, message, list_of_per_account_results)
        """
        sf_accounts = Account.query.filter_by(
            user_id=user_id,
            import_source='simplefin'
        ).all()

        if not sf_accounts:
            return True, 'No SimpleFin accounts to sync', []

        total_imported = 0
        results = []

        for account in sf_accounts:
            success, message, count = self.sync_account(account.id, user_id)
            total_imported += count
            results.append({
                'account_id': account.id,
                'account_name': account.name,
                'success': success,
                'message': message,
                'imported': count,
            })

        return True, f'Synced {total_imported} total transaction(s)', results

    def disconnect_account(self, account_id, user_id):
        """
        Disconnect a SimpleFin account
        Returns (success, message)
        """
        account = Account.query.get(account_id)
        if not account:
            return False, 'Account not found'
        if account.user_id != user_id:
            return False, 'Permission denied'

        try:
            account.import_source = None
            account.external_id = None
            db.session.commit()
            return True, 'Account disconnected from SimpleFin'
        except Exception as e:
            db.session.rollback()
            current_app.logger.error(f"Error disconnecting account: {str(e)}")
            return False, f'Error: {str(e)}'
