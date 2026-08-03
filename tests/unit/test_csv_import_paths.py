"""Path confinement for the folder-watch import source."""
import os

import pytest

from src.services.csv_import.paths import (
    PathOutsideRootError, import_root, resolve_within_root,
)


def test_root_defaults(monkeypatch):
    monkeypatch.delenv('CSV_IMPORT_ROOT', raising=False)
    assert import_root() == '/data/inbox'


def test_root_from_env(monkeypatch, tmp_path):
    monkeypatch.setenv('CSV_IMPORT_ROOT', str(tmp_path))
    assert import_root() == str(tmp_path)


def test_accepts_a_path_inside_the_root(monkeypatch, tmp_path):
    monkeypatch.setenv('CSV_IMPORT_ROOT', str(tmp_path))
    inner = tmp_path / 'chase'
    inner.mkdir()
    assert resolve_within_root(str(inner)) == os.path.realpath(str(inner))


def test_rejects_dot_dot_traversal(monkeypatch, tmp_path):
    monkeypatch.setenv('CSV_IMPORT_ROOT', str(tmp_path / 'inbox'))
    (tmp_path / 'inbox').mkdir()
    with pytest.raises(PathOutsideRootError):
        resolve_within_root(str(tmp_path / 'inbox' / '..' / 'secrets'))


def test_rejects_an_absolute_path_outside_the_root(monkeypatch, tmp_path):
    monkeypatch.setenv('CSV_IMPORT_ROOT', str(tmp_path))
    with pytest.raises(PathOutsideRootError):
        resolve_within_root('/etc')


def test_rejects_a_symlink_escaping_the_root(monkeypatch, tmp_path):
    root = tmp_path / 'inbox'
    root.mkdir()
    outside = tmp_path / 'outside'
    outside.mkdir()
    (root / 'link').symlink_to(outside)
    monkeypatch.setenv('CSV_IMPORT_ROOT', str(root))
    with pytest.raises(PathOutsideRootError):
        resolve_within_root(str(root / 'link'))


def test_rejects_a_sibling_sharing_a_name_prefix(monkeypatch, tmp_path):
    """/data/inbox-evil must not pass a check for /data/inbox."""
    root = tmp_path / 'inbox'
    root.mkdir()
    evil = tmp_path / 'inbox-evil'
    evil.mkdir()
    monkeypatch.setenv('CSV_IMPORT_ROOT', str(root))
    with pytest.raises(PathOutsideRootError):
        resolve_within_root(str(evil))
