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


@api_bp.route('', methods=['GET'])
@jwt_required()
def get_transactions():
    """Get all transactions for the current user"""
    try:
        identity = get_jwt_identity()

        # Get all transactions and splits
        expenses, expense_splits = transaction_service.get_all_transactions(identity)

        # Format transactions for API response
        transactions = []
        for expense in expenses:
            # Get splits for this expense
            splits = expense_splits.get(expense.id, {})

            transaction_data = {
                'id': expense.id,
                'name': expense.description,
                'description': expense.description,
                'amount': float(expense.amount),
                'date': expense.date.strftime('%Y-%m-%d'),
                'category': {'id': expense.category_id, 'name': expense.category.name} if expense.category else None,
                'category_id': expense.category_id,
                'type': 'income' if expense.transaction_type == 'income' else 'expense',
                'transaction_type': expense.transaction_type,
                'account': {'id': expense.account_id, 'name': expense.account.name} if expense.account else None,
                'account_id': expense.account_id,
                'currency_code': expense.currency_code or 'USD',
                'group': {'id': expense.group_id, 'name': expense.group.name} if expense.group else None,
                'group_id': expense.group_id,
                'paid_by': expense.paid_by,
                'split_method': expense.split_method,
                'splits': splits
            }
            transactions.append(transaction_data)

        # Calculate totals
        total_income = sum(t['amount'] for t in transactions if t['type'] == 'income')
        total_expense = sum(abs(t['amount']) for t in transactions if t['type'] == 'expense')

        return jsonify({
            'transactions': transactions,
            'summary': {
                'total_income': total_income,
                'total_expense': total_expense,
                'net_balance': total_income - total_expense
            }
        }), 200

    except Exception as e:
        return jsonify({'error': str(e)}), 500


@api_bp.route('/<int:transaction_id>', methods=['GET'])
@jwt_required()
def get_transaction(transaction_id):
    """Get a single transaction by ID"""
    try:
        identity = get_jwt_identity()

        success, message, expense_data = transaction_service.get_transaction(transaction_id, identity)

        if not success:
            return jsonify({'error': message}), 404

        return jsonify(expense_data), 200

    except Exception as e:
        return jsonify({'error': str(e)}), 500


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


@api_bp.route('/<int:transaction_id>', methods=['PUT', 'PATCH'])
@jwt_required()
def update_transaction(transaction_id):
    """Update a transaction"""
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
            'transaction_type': data.get('transaction_type'),
            'currency_code': data.get('currency_code'),
            'group_id': data.get('group_id'),
            'split_method': data.get('split_method'),
            'notes': data.get('notes', '')
        }

        success, message = transaction_service.update_transaction(transaction_id, identity, form_data)

        if success:
            return jsonify({'message': message}), 200
        else:
            return jsonify({'error': message}), 400

    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 500


@api_bp.route('/<int:transaction_id>', methods=['DELETE'])
@jwt_required()
def delete_transaction(transaction_id):
    """Delete a transaction"""
    try:
        identity = get_jwt_identity()

        success, message = transaction_service.delete_transaction(transaction_id, identity)

        if success:
            return jsonify({'message': message}), 200
        else:
            return jsonify({'error': message}), 400

    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 500
