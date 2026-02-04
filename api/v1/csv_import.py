"""CSV Import API endpoints"""
from __future__ import annotations
import csv
import io
from flask import request
from flask_restx import Namespace, Resource, fields
from flask_jwt_extended import jwt_required, get_jwt_identity
from src.models.transaction import Expense
from src.models.account import Account
from src.models.category import Category
from src.extensions import db
from src.utils.decorators import demo_restricted
from datetime import datetime
from werkzeug.datastructures import FileStorage

# Create namespace
ns = Namespace('csv-import', description='CSV import operations')

# Define request/response models
csv_preview_model = ns.model('CSVPreview', {
    'columns': fields.List(fields.String, description='CSV column headers'),
    'sample_rows': fields.List(fields.Raw, description='First 5 rows of data'),
    'total_rows': fields.Integer(description='Total number of rows'),
})

column_mapping_model = ns.model('ColumnMapping', {
    'date': fields.String(required=True, description='Column name for date'),
    'description': fields.String(required=True, description='Column name for description'),
    'amount': fields.String(required=True, description='Column name for amount'),
    'category': fields.String(description='Column name for category'),
    'account': fields.String(description='Column name for account'),
    'notes': fields.String(description='Column name for notes'),
})

import_config_model = ns.model('ImportConfig', {
    'account_id': fields.Integer(description='Default account ID if not in CSV'),
    'date_format': fields.String(description='Date format (e.g., %Y-%m-%d, %m/%d/%Y)'),
    'skip_duplicates': fields.Boolean(default=True, description='Skip duplicate transactions'),
    'amount_multiplier': fields.Float(default=1.0, description='Multiply amount by this (e.g., -1 to flip sign)'),
})


@ns.route('/preview')
class CSVPreview(Resource):
    @ns.doc('preview_csv', security='Bearer')
    @jwt_required()
    def post(self):
        """Preview CSV file and return column headers and sample data"""
        try:
            # Check if file is in request
            if 'file' not in request.files:
                return {'success': False, 'error': 'No file provided'}, 400

            file = request.files['file']

            if file.filename == '':
                return {'success': False, 'error': 'No file selected'}, 400

            if not file.filename.endswith('.csv'):
                return {'success': False, 'error': 'File must be a CSV'}, 400

            # Read CSV file
            stream = io.StringIO(file.stream.read().decode("UTF8"), newline=None)
            csv_reader = csv.DictReader(stream)

            # Get column headers
            columns = csv_reader.fieldnames

            # Get first 5 rows as sample
            sample_rows = []
            all_rows = []
            for idx, row in enumerate(csv_reader):
                all_rows.append(row)
                if idx < 5:
                    sample_rows.append(row)

            return {
                'success': True,
                'preview': {
                    'columns': columns,
                    'sample_rows': sample_rows,
                    'total_rows': len(all_rows)
                }
            }, 200

        except Exception as e:
            return {
                'success': False,
                'error': f'Error reading CSV: {str(e)}'
            }, 400


@ns.route('/import')
class CSVImport(Resource):
    @ns.doc('import_csv', security='Bearer')
    @ns.expect(column_mapping_model)
    @jwt_required()
    @demo_restricted
    def post(self):
        """Import transactions from CSV file with column mapping"""
        current_user_id = get_jwt_identity()

        try:
            # Check if file is in request
            if 'file' not in request.files:
                return {'success': False, 'error': 'No file provided'}, 400

            file = request.files['file']

            # Get mapping and config from form data
            mapping_json = request.form.get('mapping')
            config_json = request.form.get('config')

            if not mapping_json:
                return {'success': False, 'error': 'Column mapping required'}, 400

            import json
            mapping = json.loads(mapping_json)
            config = json.loads(config_json) if config_json else {}

            # Validate required mappings
            if 'date' not in mapping or 'description' not in mapping or 'amount' not in mapping:
                return {
                    'success': False,
                    'error': 'Required mappings: date, description, amount'
                }, 400

            # Read CSV file
            stream = io.StringIO(file.stream.read().decode("UTF8"), newline=None)
            csv_reader = csv.DictReader(stream)

            # Process rows
            imported_count = 0
            skipped_count = 0
            error_count = 0
            errors = []

            default_account_id = config.get('account_id')
            date_format = config.get('date_format', '%Y-%m-%d')
            skip_duplicates = config.get('skip_duplicates', True)
            amount_multiplier = config.get('amount_multiplier', 1.0)

            for row_num, row in enumerate(csv_reader, start=2):  # Start at 2 (1 is header)
                try:
                    # Extract data based on mapping
                    date_str = row.get(mapping['date'], '').strip()
                    description = row.get(mapping['description'], '').strip()
                    amount_str = row.get(mapping['amount'], '').strip()

                    # Parse date
                    try:
                        transaction_date = datetime.strptime(date_str, date_format)
                    except ValueError as e:
                        errors.append(f"Row {row_num}: Invalid date format '{date_str}'")
                        error_count += 1
                        continue

                    # Parse amount
                    try:
                        # Remove currency symbols and commas
                        amount_str = amount_str.replace('$', '').replace(',', '').strip()
                        amount = float(amount_str) * amount_multiplier
                        # Convert to absolute value for storage
                        abs_amount = abs(amount)
                    except ValueError:
                        errors.append(f"Row {row_num}: Invalid amount '{amount_str}'")
                        error_count += 1
                        continue

                    # Determine transaction type
                    transaction_type = 'expense' if amount < 0 else 'income'

                    # Get account
                    account_id = default_account_id
                    if 'account' in mapping and mapping['account']:
                        account_name = row.get(mapping['account'], '').strip()
                        if account_name:
                            account = Account.query.filter_by(
                                name=account_name,
                                user_id=current_user_id
                            ).first()
                            if account:
                                account_id = account.id

                    # Get category
                    category_id = None
                    if 'category' in mapping and mapping['category']:
                        category_name = row.get(mapping['category'], '').strip()
                        if category_name:
                            category = Category.query.filter_by(
                                name=category_name,
                                user_id=current_user_id
                            ).first()
                            if category:
                                category_id = category.id
                            else:
                                # Create category if it doesn't exist
                                new_category = Category(
                                    name=category_name,
                                    user_id=current_user_id
                                )
                                db.session.add(new_category)
                                db.session.flush()
                                category_id = new_category.id

                    # Get notes
                    notes = ''
                    if 'notes' in mapping and mapping['notes']:
                        notes = row.get(mapping['notes'], '').strip()

                    # Check for duplicates
                    if skip_duplicates:
                        duplicate = Expense.query.filter_by(
                            user_id=current_user_id,
                            description=description,
                            amount=abs_amount,
                            date=transaction_date
                        ).first()

                        if duplicate:
                            skipped_count += 1
                            continue

                    # Create transaction
                    transaction = Expense(
                        description=description,
                        amount=abs_amount,
                        date=transaction_date,
                        transaction_type=transaction_type,
                        account_id=account_id,
                        category_id=category_id,
                        notes=notes,
                        user_id=current_user_id,
                        paid_by=current_user_id,
                        import_source='csv'
                    )

                    db.session.add(transaction)
                    imported_count += 1

                except Exception as e:
                    errors.append(f"Row {row_num}: {str(e)}")
                    error_count += 1
                    continue

            # Commit all transactions
            db.session.commit()

            return {
                'success': True,
                'imported': imported_count,
                'skipped': skipped_count,
                'errors': error_count,
                'error_details': errors[:10],  # Return first 10 errors
                'message': f'Imported {imported_count} transactions successfully'
            }, 200

        except Exception as e:
            db.session.rollback()
            return {
                'success': False,
                'error': f'Import failed: {str(e)}'
            }, 500


@ns.route('/template')
class CSVTemplate(Resource):
    @ns.doc('download_template')
    def get(self):
        """Download a CSV template for transaction import"""
        template = io.StringIO()
        writer = csv.writer(template)

        # Write header
        writer.writerow(['Date', 'Description', 'Amount', 'Category', 'Account', 'Notes'])

        # Write sample rows
        writer.writerow(['2025-01-15', 'Grocery Store', '-45.50', 'Groceries', 'Checking', 'Weekly shopping'])
        writer.writerow(['2025-01-16', 'Salary', '3000.00', 'Income', 'Checking', 'Monthly salary'])
        writer.writerow(['2025-01-17', 'Gas Station', '-35.00', 'Transportation', 'Credit Card', ''])
        writer.writerow(['2025-01-18', 'Restaurant', '-65.25', 'Dining Out', 'Credit Card', 'Dinner with friends'])

        template.seek(0)

        return {
            'success': True,
            'template': template.getvalue()
        }, 200
