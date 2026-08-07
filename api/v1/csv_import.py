"""CSV Import API endpoints"""
from __future__ import annotations
import csv
import io
from flask import request
from flask_restx import Namespace, Resource, fields, reqparse
from werkzeug.datastructures import FileStorage
from flask_jwt_extended import jwt_required, get_jwt_identity
from src.extensions import db
from src.services.csv_import import Mapping, MapperConfig, import_rows
from src.services.csv_import.fingerprint import save_profile
from src.utils.decorators import demo_restricted
from werkzeug.datastructures import FileStorage
from werkzeug.exceptions import HTTPException

import logging

logger = logging.getLogger(__name__)


# Create namespace
ns = Namespace('csv-import', description='CSV import operations')

# Define request/response models
# formData: the handler reads request.files['file'].
preview_parser = reqparse.RequestParser()
preview_parser.add_argument('file', location='files', type=FileStorage,
                            required=True, help='CSV file to preview')

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


CSV_MAX_ROWS = 10_000
CSV_ALLOWED_MIMETYPES = {'text/csv', 'application/csv', 'text/plain', 'application/vnd.ms-excel'}


def _validate_csv_file(file):
    """Return an error string if the file is invalid, else None."""
    if not file or file.filename == '':
        return 'No file selected'
    if not file.filename.lower().endswith('.csv'):
        return 'File must be a CSV'
    mimetype = (file.mimetype or '').split(';')[0].strip().lower()
    if mimetype and mimetype not in CSV_ALLOWED_MIMETYPES:
        return 'Invalid file type'
    return None


@ns.route('/preview')
class CSVPreview(Resource):
    @ns.doc('preview_csv', security='Bearer')
    @ns.expect(preview_parser)
    @jwt_required()
    def post(self):
        """Preview CSV file and return column headers and sample data"""
        try:
            if 'file' not in request.files:
                return {'success': False, 'error': 'No file provided'}, 400

            file = request.files['file']
            err = _validate_csv_file(file)
            if err:
                return {'success': False, 'error': err}, 400

            stream = io.StringIO(file.stream.read().decode("UTF8"), newline=None)
            csv_reader = csv.DictReader(stream)
            columns = csv_reader.fieldnames

            sample_rows = []
            total = 0
            for idx, row in enumerate(csv_reader):
                total += 1
                if idx < 5:
                    sample_rows.append(row)
                if total > CSV_MAX_ROWS:
                    break

            return {
                'success': True,
                'preview': {
                    'columns': columns,
                    'sample_rows': sample_rows,
                    'total_rows': total,
                    'truncated': total > CSV_MAX_ROWS,
                }
            }, 200

        except HTTPException:
            # e.g. 413 from MAX_CONTENT_LENGTH — let Flask answer with the real
            # status instead of relabelling it as a malformed CSV.
            raise
        except Exception:
            logger.exception('Failed to preview CSV')
            return {'success': False, 'error': 'Error reading CSV'}, 400


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
            err = _validate_csv_file(file)
            if err:
                return {'success': False, 'error': err}, 400

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

            stream = io.StringIO(file.stream.read().decode('UTF8'), newline=None)
            csv_reader = csv.DictReader(stream)
            # Read before iterating: DictReader consumes the header row on first
            # access, and import_rows will have exhausted the reader afterwards.
            headers = list(csv_reader.fieldnames or [])

            outcome = import_rows(
                csv_reader,
                Mapping(
                    date=mapping['date'],
                    description=mapping['description'],
                    amount=mapping['amount'],
                    category=mapping.get('category'),
                    account=mapping.get('account'),
                    notes=mapping.get('notes'),
                ),
                MapperConfig(
                    date_format=config.get('date_format', '%Y-%m-%d'),
                    skip_duplicates=config.get('skip_duplicates', True),
                    amount_multiplier=config.get('amount_multiplier', 1.0),
                    account_id=config.get('account_id'),
                ),
                current_user_id,
                max_rows=CSV_MAX_ROWS,
            )

            # Teach the system this bank's format so folder-watch can auto-map it.
            if outcome.imported > 0 and headers:
                try:
                    save_profile(
                        headers,
                        {k: v for k, v in mapping.items() if v},
                        current_user_id,
                        name=file.filename.rsplit('.', 1)[0][:120],
                        date_format=config.get('date_format', '%Y-%m-%d'),
                        sign_convention='negative_is_expense',
                        origin='manual',
                    )
                except Exception:
                    # Never fail a successful import because profile saving broke.
                    logger.exception('Failed to save import profile')

            succeeded = outcome.imported > 0 or (outcome.errors == 0 and outcome.skipped > 0)
            return {
                'success': succeeded,
                'imported': outcome.imported,
                'skipped': outcome.skipped,
                'errors': outcome.errors,
                'error_details': outcome.error_details[:10],
                'message': (
                    f'Imported {outcome.imported} transactions successfully'
                    if succeeded else
                    'No transactions were imported — see error_details'
                ),
            }, 200

        except HTTPException:
            db.session.rollback()
            raise  # e.g. 413 — do not relabel it as an import failure
        except Exception:
            db.session.rollback()
            logger.exception("CSV import failed")
            return {'success': False, 'error': 'Import failed'}, 500


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
