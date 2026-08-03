"""Undo and remap for import batches."""
from __future__ import annotations

import csv
import io
import logging
from datetime import datetime

from src.extensions import db
from src.models.import_source import ImportBatch
from src.models.transaction import Expense
from src.services.csv_import.fingerprint import save_profile
from src.services.csv_import.mapper import Mapping, MapperConfig, import_rows

logger = logging.getLogger(__name__)


def _owned_batch(batch_id, user_id) -> ImportBatch:
    batch = ImportBatch.query.filter_by(id=batch_id, user_id=user_id).first()
    if batch is None:
        # Same error whether it is missing or someone else's — do not confirm
        # the existence of another user's batch.
        raise LookupError('Import batch not found')
    return batch


def revert_batch(batch_id: int, user_id: str) -> int:
    """Delete every transaction from this batch. Returns the number removed."""
    batch = _owned_batch(batch_id, user_id)
    if batch.status == 'reverted':
        raise ValueError('Import batch has already been reverted')

    deleted = Expense.query.filter_by(
        import_batch_id=batch.id, user_id=user_id).delete(synchronize_session=False)
    batch.status = 'reverted'
    batch.reverted_at = datetime.utcnow()
    db.session.commit()
    logger.info('Reverted import batch %s (%s rows)', batch.id, deleted)
    return deleted


def remap_batch(batch_id: int, user_id: str, mapping: dict, date_format: str,
                sign_convention: str, raw_csv: str) -> ImportBatch:
    """Re-import a batch under a corrected mapping and promote it to a profile.

    `raw_csv` is required because the source file has already been moved into
    processed/ or failed/; the caller supplies its contents.
    """
    batch = _owned_batch(batch_id, user_id)

    if batch.status != 'reverted':
        Expense.query.filter_by(import_batch_id=batch.id,
                                user_id=user_id).delete(synchronize_session=False)

    reader = csv.DictReader(io.StringIO(raw_csv, newline=None))
    headers = list(reader.fieldnames or [])

    outcome = import_rows(
        reader,
        Mapping(date=mapping['date'], description=mapping['description'],
                amount=mapping['amount'], category=mapping.get('category'),
                account=mapping.get('account'), notes=mapping.get('notes')),
        MapperConfig(date_format=date_format,
                     amount_multiplier=-1.0
                     if sign_convention == 'positive_is_expense' else 1.0),
        user_id, batch_id=batch.id,
    )

    batch.mapping_used = mapping
    batch.imported_count = outcome.imported
    batch.skipped_count = outcome.skipped
    batch.error_count = outcome.errors
    batch.errors = outcome.error_details[:50]
    batch.status = 'success' if outcome.imported and not outcome.errors else (
        'partial' if outcome.imported else 'failed')
    batch.reverted_at = None
    batch.confidence = 1.0  # a human supplied this mapping

    if headers and outcome.imported:
        profile = save_profile(
            headers, mapping, user_id, name=batch.filename.rsplit('.', 1)[0][:120],
            date_format=date_format, sign_convention=sign_convention,
            origin='manual', confidence=1.0)
        batch.profile_id = profile.id

    db.session.commit()
    return batch
