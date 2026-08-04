"""A partial transaction update must not destroy data it never mentioned.

`update_transaction` was written for an HTML form POST, where every field is
always present. Called with a JSON body containing only the field being changed,
it read absent fields as "set to empty":

  - `enable_category_split` absent  ->  read as off  ->  **every CategorySplit
    row for the expense is deleted** and `has_category_splits` set False;
  - `category_id` absent  ->  the category is cleared;
  - `amount: None` present  ->  `float(None)` raises.

So an API client patching a description silently lost the expense's category
splits. This pins the fix.
"""
from datetime import datetime

from src.extensions import db
from src.models.category import Category
from src.models.transaction import CategorySplit, Expense
from tests.factories import UserFactory


def _split_expense(db):
    user = UserFactory()
    food = Category(name='Food', user_id=user.id)
    travel = Category(name='Travel', user_id=user.id)
    db.session.add_all([food, travel])
    db.session.flush()

    expense = Expense(
        description='Weekly shop', amount=100.0, date=datetime(2026, 7, 1),
        user_id=user.id, paid_by=user.id, card_used='', split_method='equal',
        has_category_splits=True)
    db.session.add(expense)
    db.session.flush()
    db.session.add_all([
        CategorySplit(expense_id=expense.id, category_id=food.id, amount=60.0),
        CategorySplit(expense_id=expense.id, category_id=travel.id, amount=40.0),
    ])
    db.session.commit()
    return user, expense, food


def test_changing_only_the_description_keeps_the_category_splits(db):
    """The data-loss bug, stated as the property that was violated."""
    from src.services.transaction.service import TransactionService

    user, expense, _food = _split_expense(db)
    assert CategorySplit.query.filter_by(expense_id=expense.id).count() == 2

    ok, _msg = TransactionService().update_transaction(
        expense.id, user.id, {'description': 'Weekly shop (corrected)'})

    assert ok is True, _msg
    db.session.refresh(expense)
    assert expense.description == 'Weekly shop (corrected)'
    assert CategorySplit.query.filter_by(expense_id=expense.id).count() == 2, (
        'a partial update deleted the category splits it never mentioned')
    assert expense.has_category_splits is True


def test_changing_only_the_amount_keeps_the_category(db):
    from src.services.transaction.service import TransactionService

    user, expense, food = _split_expense(db)
    expense.has_category_splits = False
    expense.category_id = food.id
    CategorySplit.query.filter_by(expense_id=expense.id).delete()
    db.session.commit()

    ok, _msg = TransactionService().update_transaction(
        expense.id, user.id, {'amount': 55.0})

    assert ok is True, _msg
    db.session.refresh(expense)
    assert expense.amount == 55.0
    assert expense.category_id == food.id, (
        'a partial update cleared the category it never mentioned')


def test_a_null_amount_does_not_raise(db):
    """`float(None)` used to explode; a present-but-null field is common JSON."""
    from src.services.transaction.service import TransactionService

    user, expense, _food = _split_expense(db)
    ok, msg = TransactionService().update_transaction(
        expense.id, user.id, {'amount': None})

    # Either rejected cleanly or ignored — but never an unhandled TypeError.
    assert isinstance(ok, bool), msg
    db.session.refresh(expense)
    assert expense.amount == 100.0


def test_splits_can_still_be_cleared_explicitly(db):
    """The form path must keep working: 'off' means off."""
    from src.services.transaction.service import TransactionService

    user, expense, food = _split_expense(db)

    ok, _msg = TransactionService().update_transaction(
        expense.id, user.id, {
            'enable_category_split': 'off',
            'category_id': str(food.id),
        })

    assert ok is True, _msg
    db.session.refresh(expense)
    assert CategorySplit.query.filter_by(expense_id=expense.id).count() == 0
    assert expense.has_category_splits is False
    assert expense.category_id == food.id


def test_splits_can_still_be_replaced_explicitly(db):
    import json

    from src.services.transaction.service import TransactionService

    user, expense, food = _split_expense(db)

    ok, _msg = TransactionService().update_transaction(
        expense.id, user.id, {
            'enable_category_split': 'on',
            'category_splits_data': json.dumps([
                {'category_id': food.id, 'amount': 100.0},
            ]),
        })

    assert ok is True, _msg
    rows = CategorySplit.query.filter_by(expense_id=expense.id).all()
    assert len(rows) == 1
    assert rows[0].amount == 100.0
