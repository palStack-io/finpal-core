"""The Expense after_insert hook that reaches pointsPal's SimpleFin bridge.

`src/models/transaction.py` registers an `after_insert` listener on Expense that
dispatches 'expense_created'; pointsPal's `on_event` lazily imports
`simplefin_bridge.handle_new_transaction`. That module was untracked, so it was
absent from the built image and the import failed on every insert — swallowed as
a warning by the registry, leaving pointsPal spend tracking silently dead.

These tests exist because committing the file *activates* that path in
production. They pin the two properties that make it safe to turn on: the hook
runs, and it cannot take an expense insert down with it.
"""
from datetime import datetime

import pytest

from src.extensions import db
from src.models.transaction import Expense
from tests.factories import UserFactory


def _expense(user, **kw):
    fields = dict(
        description='Coffee', amount=4.50, date=datetime(2026, 7, 1),
        user_id=user.id, paid_by=user.id, card_used='', split_method='equal',
        transaction_type='expense',
    )
    fields.update(kw)
    return Expense(**fields)


def test_the_bridge_module_is_importable():
    """If this fails, the file is missing from the checkout — which is the
    original bug: the image shipped without it."""
    from src.modules.pointspal.simplefin_bridge import handle_new_transaction
    assert callable(handle_new_transaction)


def test_inserting_an_expense_reaches_the_bridge(db, monkeypatch):
    """Proves the hook actually fires, rather than being dead code."""
    calls = []

    import src.modules.pointspal.simplefin_bridge as bridge
    monkeypatch.setattr(
        bridge, 'handle_new_transaction',
        lambda connection, expense: calls.append(expense.description))

    user = UserFactory()
    db.session.add(_expense(user, description='Hook probe', account_id=1))
    db.session.commit()

    assert calls == ['Hook probe'], (
        'the after_insert hook did not reach handle_new_transaction; '
        'pointsPal spend tracking would be silently dead')


def test_a_failing_bridge_cannot_break_the_expense_insert(db, monkeypatch):
    """Both the listener and the registry swallow exceptions on purpose. If that
    ever regresses, a pointsPal bug starts losing users' transactions."""
    import src.modules.pointspal.simplefin_bridge as bridge

    def explode(connection, expense):
        raise RuntimeError('bridge is broken')

    monkeypatch.setattr(bridge, 'handle_new_transaction', explode)

    user = UserFactory()
    db.session.add(_expense(user, description='Survives a broken bridge', account_id=1))
    db.session.commit()

    saved = Expense.query.filter_by(description='Survives a broken bridge').first()
    assert saved is not None, 'a failing module took the expense insert down with it'


def test_income_and_accountless_expenses_are_ignored(db):
    """The bridge returns early for these; inserting them must be uneventful."""
    user = UserFactory()
    db.session.add_all([
        _expense(user, description='Salary', transaction_type='income', account_id=1),
        _expense(user, description='Cash spend', account_id=None),
    ])
    db.session.commit()

    assert Expense.query.filter_by(description='Salary').first() is not None
    assert Expense.query.filter_by(description='Cash spend').first() is not None
