"""Folder-watch scan: find candidates, resolve a mapping, import as a batch."""
from __future__ import annotations

import csv
import hashlib
import io
import logging
from datetime import datetime

from flask import current_app

from src.extensions import db
from src.models.import_source import ImportBatch
from src.models.user import User
from src.services.csv_import.review import batch_needs_review
from src.services.email_service import email_service
from src.services.csv_import.adapters.local_folder import LocalFolderAdapter
from src.services.csv_import.fingerprint import find_profile, save_profile
from src.services.csv_import.heuristics import detect
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
    heuristic = None
    if profile is None:
        # Re-read: DictReader is a one-shot iterator and detect() needs rows.
        sample = list(csv.DictReader(io.StringIO(text, newline=None)))[:50]
        heuristic = detect(headers, sample)
        if heuristic is None:
            _fail(adapter, source, handle, file_hash,
                  'Could not identify a date and amount column in this file')
            return None
        profile = save_profile(
            headers, heuristic.mapping, source.user_id,
            name=handle.name.rsplit('.', 1)[0][:120],
            date_format=heuristic.date_format,
            sign_convention=heuristic.sign_convention,
            origin='heuristic', confidence=heuristic.confidence,
        )
        # The reader was consumed building the sample — start over.
        reader = csv.DictReader(io.StringIO(text, newline=None))

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
    _notify_if_review_needed(batch)
    adapter.mark_done(handle)
    return batch


def _notify_if_review_needed(batch):
    """Email the owner ONLY when the batch wants a human — never on a clean import.

    Owner decision 2026-08-07: one mail per batch is noise, so nothing is sent for
    an import that went through cleanly. `batch_needs_review` is the same predicate
    the dashboard banner now reads, so the email and the banner can never disagree
    about what "needs review" means.

    **Wrapped in a broad except on purpose, and this is the one place that is
    right.** The import has already been committed by the time we get here. A dead
    SMTP server, a missing template, a user row that vanished — none of those should
    turn a successful import into a failed scan, and the scheduled scan that calls
    this swallows exceptions at the top level anyway, so an escape here would abandon
    the remaining files silently. Logged with `exception` so it is never invisible.
    """
    try:
        if not batch_needs_review(batch):
            return

        user = db.session.get(User, batch.user_id)
        if user is None or not user.notification_email:
            return

        guessed = bool(batch.profile and batch.profile.origin == 'heuristic')
        base = (current_app.config.get('FRONTEND_URL') or '').rstrip('/')
        email_service.send_import_review_email(
            to_email=user.id,
            user_name=user.name or 'there',
            filename=batch.filename,
            imported=batch.imported_count,
            errors=batch.error_count,
            guessed_mapping=guessed,
            review_link=f'{base}/dashboard' if base else '/dashboard',
        )
    except Exception:
        logger.exception('Import review email failed for batch %s', batch.id)


def _fail(adapter, source, handle, file_hash, reason):
    batch = ImportBatch(
        source_id=source.id, filename=handle.name, file_hash=file_hash,
        status='failed', errors=[reason], user_id=source.user_id)
    db.session.add(batch)
    db.session.commit()
    adapter.mark_failed(handle, reason)
    logger.warning('Import failed for %s: %s', handle.name, reason)
