"""Folder-watch scan: find candidates, resolve a mapping, import as a batch."""
from __future__ import annotations

import csv
import hashlib
import io
import logging
from datetime import datetime

from src.extensions import db
from src.models.import_source import ImportBatch
from src.services.csv_import.adapters.local_folder import LocalFolderAdapter
from src.services.csv_import.fingerprint import find_profile
from src.services.csv_import.mapper import Mapping, MapperConfig, import_rows

logger = logging.getLogger(__name__)

CSV_MAX_ROWS = 10_000


def hash_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def _adapter_for(source):
    if source.kind == 'local_folder':
        return LocalFolderAdapter(source.config['path'])
    raise ValueError(f'Unknown import source kind: {source.kind}')


def stable_candidates(adapter, source):
    """Return candidates whose size and mtime are unchanged since last scan.

    A file mid-copy parses as truncated, and would then be hash-blocked from
    ever being retried — so defer anything that changed since we last looked.
    """
    config = dict(source.config or {})
    seen = config.get('seen', {})
    stable, next_seen = [], {}

    for handle in adapter.list_candidates():
        signature = [handle.size, handle.mtime]
        next_seen[handle.name] = signature
        if seen.get(handle.name) == signature:
            stable.append(handle)

    config['seen'] = next_seen
    source.config = config
    db.session.commit()
    return stable


def scan_source(source) -> list[ImportBatch]:
    """Scan one source. Returns the batches created this pass."""
    batches = []
    try:
        adapter = _adapter_for(source)
    except Exception:
        logger.exception('Cannot build adapter for import source %s', source.id)
        return []

    for handle in stable_candidates(adapter, source):
        try:
            batch = _process(adapter, source, handle)
            if batch is not None:
                batches.append(batch)
        except Exception:
            # Never let one bad file stop the rest of the scan.
            logger.exception('Failed to process import candidate %s', handle.name)
            db.session.rollback()

    source.last_scanned_at = datetime.utcnow()
    db.session.commit()
    return batches


def _process(adapter, source, handle) -> ImportBatch | None:
    data = adapter.read(handle)
    file_hash = hash_bytes(data)

    if ImportBatch.query.filter_by(file_hash=file_hash).first():
        adapter.mark_done(handle)
        return None

    text = data.decode('utf-8-sig', errors='replace')
    reader = csv.DictReader(io.StringIO(text, newline=None))
    headers = list(reader.fieldnames or [])
    if not headers:
        _fail(adapter, source, handle, file_hash, 'File has no header row')
        return None

    profile = find_profile(headers, source.user_id)
    if profile is None:
        # Heuristic fallback arrives in Task 12. Until then, quarantine.
        _fail(adapter, source, handle, file_hash,
              'No saved import profile matches this file\'s columns')
        return None

    batch = ImportBatch(
        source_id=source.id, profile_id=profile.id, filename=handle.name,
        file_hash=file_hash, mapping_used=profile.mapping,
        confidence=profile.confidence, status='success',
        user_id=source.user_id,
    )
    db.session.add(batch)
    db.session.flush()

    outcome = import_rows(
        reader,
        Mapping(date=profile.mapping['date'],
                description=profile.mapping['description'],
                amount=profile.mapping['amount'],
                category=profile.mapping.get('category'),
                account=profile.mapping.get('account'),
                notes=profile.mapping.get('notes')),
        MapperConfig(date_format=profile.date_format,
                     amount_multiplier=-1.0
                     if profile.sign_convention == 'positive_is_expense' else 1.0),
        source.user_id, batch_id=batch.id, max_rows=CSV_MAX_ROWS,
    )

    batch.imported_count = outcome.imported
    batch.skipped_count = outcome.skipped
    batch.error_count = outcome.errors
    batch.errors = outcome.error_details[:50]
    batch.row_count = outcome.imported + outcome.skipped + outcome.errors
    if outcome.imported == 0:
        batch.status = 'failed'
    elif outcome.errors:
        batch.status = 'partial'
    profile.times_used = (profile.times_used or 0) + 1
    db.session.commit()

    # Log identifiers only — never file contents.
    logger.info('Imported %s: %s rows from %s (hash %s)',
                batch.id, outcome.imported, handle.name, file_hash[:12])
    adapter.mark_done(handle)
    return batch


def _fail(adapter, source, handle, file_hash, reason):
    batch = ImportBatch(
        source_id=source.id, filename=handle.name, file_hash=file_hash,
        status='failed', errors=[reason], user_id=source.user_id)
    db.session.add(batch)
    db.session.commit()
    adapter.mark_failed(handle, reason)
    logger.warning('Import failed for %s: %s', handle.name, reason)
