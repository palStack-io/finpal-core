"""
API Routes for Transactions
JWT-based transaction endpoints for React frontend
"""

from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from src.models.transaction import Expense
from src.models.user import User
from src.services.transaction.service import TransactionService
from src.extensions import db
from datetime import datetime

# Create API Blueprint
api_bp = Blueprint('transaction_api', __name__, url_prefix='/api/v1/transactions')

# Initialize service
transaction_service = TransactionService()


# The GET list handler that used to live here has been retired.
#
# It was the handler web-ui actually reached, because Werkzeug matches the exact
# rule `/api/v1/transactions` (this blueprint, registered first) before the restx
# rule `/api/v1/transactions/`. It read **zero** query parameters: `page`,
# `per_page`, `start_date`, `end_date`, `category_id`, `account_id`, `type` and
# `search` were all built by the client and silently discarded, so every render
# loaded the entire history and filtered it in the browser. It also returned no
# `pagination` key, while the MSW mock for this URL returned one — so the
# contract test passed against a shape the server never sent.
#
# Everything it did, `TransactionList.get` in `api/v1/transactions.py` now does:
# the filters are honoured, and `summary` is computed over the whole filtered
# query rather than the current page.
#
# Removing the rule rather than fixing it is deliberate, and it needs no client
# change: this app sets `url_map.strict_slashes = False`, so with no exact GET
# rule for the slash-less path, the restx rule `/api/v1/transactions/` matches
# **both** spellings and serves them itself. Verified by asserting the payload of
# `GET /api/v1/transactions` in
# `tests/integration/test_transactions_list_api.py` — it comes back paginated,
# with `summary`, and honouring the filters. No redirect is involved.
#
# The POST below stays. It is the create endpoint web-ui uses, the restx POST on
# the slashed rule is not equivalent to it, and leaving an exact rule here keeps
# creates off the shared path.


# The detail handlers (GET/PUT/PATCH/DELETE on /<int:transaction_id>) used to live
# here and have been retired. They shadowed the flask-restx TransactionDetail —
# Werkzeug resolves duplicate rules to the first registered, and this blueprint is
# registered first — so the restx versions were dead code for both clients.
#
# They were not equivalent, which is why the restx ones win now: TransactionDetail
# applies each field only `if 'field' in data`, whereas these were written for an
# HTML form POST where every field is always present. A JSON body containing only
# the changed field therefore read absent fields as "clear this", and
# `enable_category_split` being absent deleted every CategorySplit row for the
# expense.
#
# Safe to remove because nothing calls them: web-ui's updateTransaction and
# getTransaction are referenced only by a contract test, and mobile's equivalents
# are unused. Verified by grep before deleting.
#
# The list and create routes below stay — web-ui calls /api/v1/transactions with
# no trailing slash and reaches them.


@api_bp.route('', methods=['POST'])
@jwt_required()
def create_transaction():
    """Create a new transaction"""
    try:
        identity = get_jwt_identity()
        data = request.get_json()

        if not data:
            return jsonify({'error': 'Request body is required'}), 400

        # Convert JSON data to form-like dict for transaction service
        form_data = {
            'description': data.get('description'),
            'amount': data.get('amount'),
            'date': data.get('date'),
            'category_id': data.get('category_id'),
            'account_id': data.get('account_id'),
            'transaction_type': data.get('transaction_type', 'expense'),
            'currency_code': data.get('currency_code', 'USD'),
            'group_id': data.get('group_id'),
            'split_method': data.get('split_method', 'equal'),
            'notes': data.get('notes', '')
        }

        success, message, transaction_id = transaction_service.add_transaction(identity, form_data)

        if success:
            return jsonify({
                'message': message,
                'transaction_id': transaction_id
            }), 201
        else:
            return jsonify({'error': message}), 400

    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 500


