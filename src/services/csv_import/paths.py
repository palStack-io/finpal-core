"""Confine folder-watch import paths to an allowlisted root."""
from __future__ import annotations

import os

DEFAULT_IMPORT_ROOT = '/data/inbox'


class PathOutsideRootError(Exception):
    """Raised when a configured path escapes CSV_IMPORT_ROOT."""


def import_root() -> str:
    return os.getenv('CSV_IMPORT_ROOT', DEFAULT_IMPORT_ROOT)


def resolve_within_root(path: str) -> str:
    """Resolve `path` and confirm it sits inside the import root.

    Uses realpath on both sides so `..` and symlinks cannot escape, and compares
    with os.path.commonpath rather than str.startswith — otherwise
    /data/inbox-evil would pass a check for /data/inbox.
    """
    root = os.path.realpath(import_root())
    target = os.path.realpath(path)
    try:
        if os.path.commonpath([root, target]) != root:
            raise PathOutsideRootError(f'Path is outside the import root: {path}')
    except ValueError:
        # Different drives / unrelated roots.
        raise PathOutsideRootError(f'Path is outside the import root: {path}')
    return target
