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
from src.utils.household import visible_user_ids, can_manage_owned
from src.repositories.account import AccountRepository


class AccountService:
    """Service class for account operations"""

    def __init__(self):
        self.repo = AccountRepository()

    # Account CRUD Methods

    def get_all_accounts(self, user_id):
        """Get all accounts for the household"""
        from src.utils.household import get_all_user_ids
        return self.repo.get_all_for_household(get_all_user_ids())

    def get_account(self, account_id, user_id):
        """
        Get a specific account with transaction count
        Returns (success, message, account_data)
        """
        account = self.repo.get_by_id(account_id)
        if not account:
            return False, 'Account not found', None

        if account.user_id != user_id:
            return False, 'You do not have permission to view this account', None

        transaction_count = self.repo.transaction_count(account_id)

        user = db.session.get(User, user_id)
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

    def add_account(self, user_id, name, account_type, institution, balance, currency_code, color=None, import_source=None, external_id=None, owner_id=None):
        """
        Add a new account
        Returns (success, message, account)

        `user_id` is the **caller**; `owner_id` is the household member the account is
        assigned to, defaulting to the caller. Under the household model settled on
        2026-08-06 accounts are assignable to a member, and attribution for every
        transaction derives from the account — so this is where that attribution is
        decided.

        The membership check lives here rather than in the handler so that every
        caller of the service gets it, not only the one route. It refuses a demo
        account and an id that is not on the instance **the same way**: a demo
        account is a row on the instance but is not a household member, and letting
        one hold household property is D-42 by another door.
        """
        if not name or not account_type:
            return False, 'Account name and type are required', None

        if owner_id and owner_id != user_id:
            from src.utils.household import is_household_member
            if not is_household_member(owner_id):
                return False, 'Owner must be a member of this household', None
            user_id = owner_id

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

            self.repo.save(account)
            return True, 'Account added successfully', account

        except Exception as e:
            db.session.rollback()
            current_app.logger.error(f"Error adding account: {str(e)}")
            return False, 'Error adding account', None

    def update_account(self, account_id, user_id, name, account_type, institution, balance, currency_code):
        """
        Update an existing account
        Returns (success, message)
        """
        account = self.repo.get_by_id(account_id)
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

            self.repo.save(account)
            return True, 'Account updated successfully'

        except Exception as e:
            db.session.rollback()
            current_app.logger.error(f"Error updating account: {str(e)}")
            return False, 'Error updating account'

    def delete_account(self, account_id, user_id):
        """
        Delete an account (soft delete - just removes link from transactions)
        Returns (success, message)
        """
        account = self.repo.get_by_id(account_id)
        if not account:
            return False, 'Account not found'

        # Owner or admin (D-47). This was household-wide between #72 and that row,
        # which let any member delete a housemate's account — and deleting also nulls
        # `account_id` across the account's entire transaction history, two lines
        # below. Reads stay household-wide; only mutation is narrowed.
        if not can_manage_owned(account.user_id, user_id):
            return False, 'You do not have permission to delete this account'

        try:
            self.repo.nullify_account_on_transactions(account_id)
            self.repo.delete(account)
            return True, 'Account deleted successfully'

        except Exception as e:
            db.session.rollback()
            current_app.logger.error(f"Error deleting account: {str(e)}")
            return False, 'Error deleting account'

    def calculate_financial_summary(self, user_id, user_currency_code=None):
        """
        Calculate total assets, liabilities, and net worth
        Returns (total_assets, total_liabilities, net_worth, user_currency)
        """
        accounts = self.get_all_accounts(user_id)

        # Get user's preferred currency
        user = db.session.get(User, user_id)
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

        except Exception:
            db.session.rollback()
            current_app.logger.exception('Error importing CSV')
            return False, ('Could not import that CSV. Check it has a header '
                           'row and a date, description and amount column.'), 0, 0

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
        user = db.session.get(User, user_id)
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
        # Four methods below use `self.repo`, and this was `pass`, so every one of
        # them raised AttributeError before doing any work — SimpleFin sync 500'd for
        # every user on every call. `AccountService` above already constructs the
        # same repository this way, and `AccountRepository` provides all three
        # methods used here, so the constructor was simply never written.
        self.repo = AccountRepository()

    def connect_simplefin(self, user_id, credential):
        """
        Connect SimpleFin from whatever the user pasted.

        SimpleFin Bridge gives a *user* one artifact: a base64 **setup token**, good for
        a single claim. The application decodes it to a claim URL, POSTs that once, and
        receives the **access URL** — the long-lived credential everything else here
        uses. Both steps already existed in the client and nothing called them: this
        method used to write the pasted string straight into `access_url` and report
        success, so the only thing a user could obtain was stored as though it were the
        thing it is exchanged for, and the UI said "connected" over a link that could
        never sync.

        An access URL is still accepted, because self-hosters who already hold one have
        no token to spend, and a claim is not repeatable.

        Nothing is written until the credential has answered a real request. Shape
        checks alone would rebuild the same defect one level down — a URL with the wrong
        password parses perfectly and syncs nothing.

        Returns (success, message).
        """
        from integrations.simplefin.client import SimpleFin as SimpleFinClient

        credential = (credential or '').strip()
        if not credential:
            return False, 'Paste your SimpleFin setup token to connect'

        sf_client = SimpleFinClient(current_app)

        if credential.lower().startswith(('http://', 'https://')):
            access_url = credential
        else:
            claim_url = sf_client.decode_setup_token(credential)
            # `decode_setup_token` hands back its own input when the base64 does not
            # decode, so "did it decode" is not a question its return value answers.
            # Whether the result is a URL is.
            if not claim_url or not claim_url.lower().startswith(('http://', 'https://')):
                return False, (
                    'That does not look like a SimpleFin setup token. Copy the whole '
                    'token from SimpleFin Bridge — it is a long string of letters and '
                    'numbers, not a web address.'
                )

            access_url = sf_client.claim_access_url(claim_url)
            if not access_url:
                return False, (
                    'SimpleFin would not accept that setup token. A token can only be '
                    'used once, so if you have connected before, generate a new one on '
                    'SimpleFin Bridge and paste that.'
                )

        if not sf_client.test_access_url(access_url):
            return False, (
                'SimpleFin refused those credentials. Generate a new setup token on '
                'SimpleFin Bridge and try again.'
            )

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

        except Exception:
            db.session.rollback()
            # The access URL is a credential and appears in the SQL of any
            # failing INSERT, so this one leaked the secret it was storing.
            current_app.logger.exception('Error saving SimpleFin token')
            return False, 'Error connecting SimpleFin'

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

        except Exception:
            db.session.rollback()
            current_app.logger.exception('Error disconnecting SimpleFin')
            return False, 'Error disconnecting SimpleFin'

    def get_simplefin_settings(self, user_id):
        """Get SimpleFin settings for a user"""
        return SimpleFin.query.filter_by(user_id=user_id).first()

    # ------------------------------------------------------------------
    # Account import
    # ------------------------------------------------------------------

    def import_simplefin_accounts(self, user_id, simplefin_account_ids,
                                  owner_id=None):
        """
        Given a list of SimpleFin account IDs chosen by the user, create or
        update Account rows in the database.
        Returns (success, message, list_of_result_dicts)

        `user_id` is the caller, whose SimpleFin credential is used for the fetch.
        `owner_id` is the household member the imported accounts are **assigned** to,
        defaulting to the caller — the settled household model names this case
        explicitly ("similar to when we pull from simplefin we can assign it").

        These are deliberately two different people. The credential belongs to whoever
        connected it (`SimpleFin.user_id` is unique per user), while ownership answers
        whose money it is; conflating them is what made reassignment break both dedupe
        and sync. So the settings lookup below stays keyed to the caller and only the
        created row's owner changes.

        Assignment is per import batch rather than per account: the picker at this step
        chooses who the accounts being pulled belong to. Reassigning an individual
        account afterwards is `PUT /accounts/<id>` with `owner_id`.
        """
        from integrations.simplefin.client import SimpleFin as SimpleFinClient

        owner = owner_id or user_id
        if owner != user_id:
            from src.utils.household import is_household_member
            if not is_household_member(owner):
                return False, 'Owner must be a member of this household', []

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

                # Household-scoped, not caller-scoped: an imported account that has
                # since been assigned to another member must still be *matched* here,
                # or this creates a second row for the same external_id.
                existing = self.repo.get_by_external_id(
                    acc['id'], visible_user_ids(user_id))

                if existing:
                    existing.balance = acc['balance']
                    # `last_sync` deliberately NOT touched — see the Account() below.
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
                        user_id=owner,
                        # *** NOT `last_sync=utcnow()`. *** `last_sync` means
                        # "transactions are synced up to here", and this method fetches
                        # with `days_back=1` precisely because it wants balances and no
                        # transactions. Stamping it made `sync_account` compute a
                        # three-day lookback for an account whose history had never
                        # been fetched at all, so the first sync a new user ran covered
                        # a window nothing had been imported from: 18 transactions
                        # instead of 57 on Bridge's demo account, and zero on a real
                        # bank account with a quiet three days. Leaving it NULL is what
                        # makes `sync_account` take its 30-day first-sync branch.
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

        except Exception:
            db.session.rollback()
            current_app.logger.exception('Error importing SimpleFin accounts')
            return False, 'Could not import the SimpleFin accounts', []

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

        account = self.repo.get_by_id(account_id)
        if not account:
            return False, 'Account not found', 0
        # Household-scoped: the account's owner and the holder of the SimpleFin
        # credential are now two different people. `SimpleFin.user_id` is unique per
        # user, so keying this to the owner means a reassigned account can never be
        # synced by anyone — the owner has no token and the token holder is refused.
        if account.user_id not in visible_user_ids(user_id):
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

            # `process_raw_accounts` takes the whole SimpleFin response and reads
            # `raw_data['accounts']`. This passed a bare `[account_raw]`, and its guard
            # — `'accounts' not in raw_data` — then asked whether the *string*
            # `'accounts'` was an *element* of that list, which it never is. So it
            # returned `[]` for every account on every sync since 2026-04-12, and the
            # branch below called that success. Wrap the account back up the way the
            # method is documented to receive it.
            processed_list = sf_client.process_raw_accounts({'accounts': [account_raw]})
            if not processed_list:
                # Not success. The account was found in the response immediately above,
                # so an empty result here means the response could not be read — and
                # reporting that as `True` is what hid this for four months.
                return False, 'Could not read the SimpleFin data for this account', 0

            account_data = processed_list[0]
            imported_count = 0

            for trans in account_data.get('transactions', []):
                external_id = trans.get('external_id')
                if not external_id:
                    continue

                # Skip duplicates — scoped to THIS account, not to the whole user.
                #
                # A SimpleFin transaction id is unique within an account; nothing in the
                # protocol makes it unique across them. Without `account_id` here, two
                # accounts that happen to share ids collapse into one: the first to sync
                # wins and the second silently imports nothing. Bridge's own demo data
                # does exactly this — its Savings and Checking accounts share all 58
                # transaction ids for transactions with different amounts — and on the
                # live deploy that produced "Synced 57 total transaction(s)" with
                # Checking contributing zero, which reads as a healthy sync unless you
                # look at the per-account breakdown.
                if Expense.query.filter_by(
                    user_id=user_id,
                    account_id=account_id,
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

        except Exception:
            db.session.rollback()
            current_app.logger.exception(
                'SimpleFin sync error for account %s', account_id)
            return False, 'Could not sync transactions for this account', 0

    def sync_all_accounts(self, user_id):
        """
        Sync all SimpleFin accounts for a user.
        Returns (success, message, list_of_per_account_results)
        """
        sf_accounts = self.repo.get_by_import_source(
            visible_user_ids(user_id), 'simplefin')

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

        # This returned `True` unconditionally, so "synced everything" and "every
        # account failed" were the same answer to any caller that did not walk
        # `results` — and neither the Sync button nor the nightly cron does. That is
        # how a sync importing nothing at all stayed invisible for four months.
        # A partial failure still reports success; only a total one does not.
        any_ok = any(r['success'] for r in results)
        if not any_ok:
            return False, 'None of your SimpleFin accounts could be synced', results

        return True, f'Synced {total_imported} total transaction(s)', results

    def disconnect_account(self, account_id, user_id):
        """
        Disconnect a SimpleFin account
        Returns (success, message)
        """
        account = self.repo.get_by_id(account_id)
        if not account:
            return False, 'Account not found'
        if account.user_id != user_id:
            return False, 'Permission denied'

        try:
            account.import_source = None
            account.external_id = None
            db.session.commit()
            return True, 'Account disconnected from SimpleFin'
        except Exception:
            db.session.rollback()
            current_app.logger.exception('Error disconnecting account')
            return False, 'Could not disconnect the account'
