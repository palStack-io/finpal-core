"""Local folder import source.

Only the filesystem specifics live here — a cloud adapter implements the same
four methods and needs no changes elsewhere.
"""
from __future__ import annotations

import logging
import os
import shutil
from dataclasses import dataclass
from datetime import datetime

from src.services.csv_import.paths import resolve_within_root

logger = logging.getLogger(__name__)

PROCESSED_DIR = 'processed'
FAILED_DIR = 'failed'
SKIP_SUFFIXES = ('.part', '.crdownload', '.tmp', '.swp')
DEFAULT_MAX_BYTES = 10 * 1024 * 1024


@dataclass
class Handle:
    name: str
    size: int
    mtime: float
    locator: str


class LocalFolderAdapter:
    def __init__(self, path: str, max_bytes: int | None = None):
        self.path = resolve_within_root(path)
        # `or` rather than a getenv default: docker-compose forwards an unset
        # variable as the empty string, and int('') raises.
        self.max_bytes = max_bytes if max_bytes is not None else int(
            os.getenv('CSV_IMPORT_MAX_BYTES') or DEFAULT_MAX_BYTES)

    def list_candidates(self) -> list[Handle]:
        handles = []
        try:
            entries = os.listdir(self.path)
        except OSError:
            logger.exception('Cannot list import folder')
            return []

        for name in sorted(entries):
            if name.startswith('.') or name.startswith('~$'):
                continue
            if name.lower().endswith(SKIP_SUFFIXES):
                continue
            if not name.lower().endswith('.csv'):
                continue

            full = os.path.join(self.path, name)
            # Never follow a symlinked file — the target may sit outside the root.
            if os.path.islink(full) or not os.path.isfile(full):
                continue
            try:
                st = os.stat(full)
            except OSError:
                continue
            if st.st_size == 0 or st.st_size > self.max_bytes:
                continue
            handles.append(Handle(name=name, size=st.st_size,
                                  mtime=st.st_mtime, locator=full))
        return handles

    def read(self, handle: Handle) -> bytes:
        with open(handle.locator, 'rb') as fh:
            return fh.read()

    def _move(self, handle: Handle, subdir: str) -> str | None:
        dest_dir = os.path.join(self.path, subdir)
        try:
            os.makedirs(dest_dir, exist_ok=True)
            dest = os.path.join(dest_dir, handle.name)
            shutil.move(handle.locator, dest)
            return dest
        except OSError:
            # Dedupe rests on the file hash, so a failed move is cosmetic.
            logger.warning(
                'Could not move %s into %s/ — is the mount read-only?',
                handle.name, subdir)
            return None

    def mark_done(self, handle: Handle) -> None:
        dest_dir = os.path.join(self.path, PROCESSED_DIR)
        try:
            os.makedirs(dest_dir, exist_ok=True)
            stamped = f"{datetime.utcnow():%Y-%m-%d}-{handle.name}"
            shutil.move(handle.locator, os.path.join(dest_dir, stamped))
        except OSError:
            logger.warning(
                'Could not move %s into %s/ — is the mount read-only?',
                handle.name, PROCESSED_DIR)

    def mark_failed(self, handle: Handle, reason: str) -> None:
        dest = self._move(handle, FAILED_DIR)
        if dest is None:
            return
        try:
            with open(f'{dest}.error.txt', 'w') as fh:
                fh.write(f'{datetime.utcnow().isoformat()}Z\n\n{reason}\n')
        except OSError:
            logger.warning('Could not write error sidecar for %s', handle.name)
