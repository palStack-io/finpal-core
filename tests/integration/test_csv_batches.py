"""Integration tests for import batch undo and remap."""
import pytest

from src.extensions import db
from src.models.import_source import ImportBatch
from src.models.transaction import Expense
from src.services.csv_import.batches import remap_batch, revert_batch
from tests.factories import UserFactory


def _batch_with_rows(user, n=2):
    from datetime import datetime
    batch = ImportBatch(filename='c.csv', file_hash=f'h-{user.id}',
                        status='success', user_id=user.id, imported_count=n)
    db.session.add(batch)
    db.session.flush()
    for i in range(n):
        db.session.add(Expense(
            description=f'Row {i}', amount=1.0 + i, date=datetime(2026, 1, 1 + i),
            user_id=user.id, paid_by=user.id, card_used='', split_method='equal',
            import_batch_id=batch.id))
    db.session.commit()
    return batch


def test_revert_deletes_exactly_the_batch_rows(db):
    user = UserFactory()
    other = _batch_with_rows(UserFactory(), n=1)
    batch = _batch_with_rows(user, n=2)

    deleted = revert_batch(batch.id, user.id)

    assert deleted == 2
    assert Expense.query.filter_by(import_batch_id=batch.id).count() == 0
    assert Expense.query.filter_by(import_batch_id=other.id).count() == 1


def test_revert_marks_the_batch(db):
    user = UserFactory()
    batch = _batch_with_rows(user)
    revert_batch(batch.id, user.id)
    assert ImportBatch.query.get(batch.id).status == 'reverted'
    assert ImportBatch.query.get(batch.id).reverted_at is not None


def test_revert_is_not_repeatable(db):
    user = UserFactory()
    batch = _batch_with_rows(user)
    revert_batch(batch.id, user.id)
    with pytest.raises(ValueError):
        revert_batch(batch.id, user.id)


def test_revert_rejects_another_users_batch(db):
    owner = UserFactory()
    intruder = UserFactory()
    batch = _batch_with_rows(owner)
    with pytest.raises(LookupError):
        revert_batch(batch.id, intruder.id)
    assert Expense.query.filter_by(import_batch_id=batch.id).count() == 2
