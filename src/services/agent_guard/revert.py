"""Reverse an action that was applied.

Only what was recorded can be restored: `undo_state` for a change, `target_ref`
for something that was created. Same shape as the CSV import batch revert, and
the same limitation — not repeatable.
"""
from src.extensions import db
from src.models.transaction import Expense


class NotReversible(Exception):
    """Nothing recorded lets us reverse this action."""


def revert_action(row):
    if row.target_ref and row.target_ref.startswith('expense:'):
        expense_id = int(row.target_ref.split(':', 1)[1])
        expense = Expense.query.filter_by(id=expense_id,
                                          user_id=row.user_id).first()
        if expense:
            db.session.delete(expense)
        return

    if row.undo_state and 'category_id' in row.undo_state:
        target = (row.payload or {}).get('transaction_id')
        expense = Expense.query.filter_by(id=target, user_id=row.user_id).first()
        if expense:
            expense.category_id = row.undo_state['category_id']
        return

    raise NotReversible(row.action)
