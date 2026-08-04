"""Apply an approved proposal, reusing the ordinary write path.

Deliberately not a second implementation of each write: an approved proposal must
produce exactly what the direct call would have.
"""
from datetime import datetime

from src.extensions import db
from src.models.transaction import Expense


class UnsupportedAction(Exception):
    """The stored action has no apply implementation."""


def _parse_date(value):
    if not value:
        return datetime.utcnow()
    return datetime.strptime(value[:10], '%Y-%m-%d')


def apply_action(row):
    """Apply `row` and return a target_ref like 'expense:12'."""
    if row.action == 'create_transaction':
        payload = row.payload or {}
        expense = Expense(
            description=payload.get('description') or 'Untitled',
            amount=float(payload.get('amount') or 0.0),
            date=_parse_date(payload.get('date')),
            user_id=row.user_id,
            paid_by=row.user_id,
            card_used='',
            split_method='equal',
            category_id=payload.get('category_id'),
            transaction_type=payload.get('transaction_type') or 'expense',
        )
        db.session.add(expense)
        db.session.flush()
        return 'expense:%d' % expense.id

    raise UnsupportedAction(row.action)
