"""Unit tests for the local folder import adapter."""
import os

import pytest

from src.services.csv_import.adapters.local_folder import (
    Handle, LocalFolderAdapter,
)


@pytest.fixture
def inbox(tmp_path, monkeypatch):
    monkeypatch.setenv('CSV_IMPORT_ROOT', str(tmp_path))
    return tmp_path


def write(path, name, body='Date,Description,Amount\n2026-01-01,X,-1.00\n'):
    p = path / name
    p.write_text(body)
    return p


def test_lists_csv_files(inbox):
    write(inbox, 'chase.csv')
    adapter = LocalFolderAdapter(str(inbox))
    assert [h.name for h in adapter.list_candidates()] == ['chase.csv']


def test_ignores_non_csv_and_partial_files(inbox):
    write(inbox, 'chase.csv')
    write(inbox, 'notes.txt')
    write(inbox, '.hidden.csv')
    write(inbox, 'download.csv.part')
    write(inbox, 'chrome.csv.crdownload')
    adapter = LocalFolderAdapter(str(inbox))
    assert [h.name for h in adapter.list_candidates()] == ['chase.csv']


def test_ignores_files_over_the_size_cap(inbox):
    write(inbox, 'big.csv', 'x' * 5000)
    adapter = LocalFolderAdapter(str(inbox), max_bytes=1000)
    assert adapter.list_candidates() == []


def test_read_returns_bytes(inbox):
    write(inbox, 'chase.csv')
    adapter = LocalFolderAdapter(str(inbox))
    handle = adapter.list_candidates()[0]
    assert b'Date,Description,Amount' in adapter.read(handle)


def test_mark_done_moves_to_processed_with_a_date_prefix(inbox):
    write(inbox, 'chase.csv')
    adapter = LocalFolderAdapter(str(inbox))
    handle = adapter.list_candidates()[0]
    adapter.mark_done(handle)

    assert not (inbox / 'chase.csv').exists()
    moved = list((inbox / 'processed').iterdir())
    assert len(moved) == 1
    assert moved[0].name.endswith('-chase.csv')


def test_mark_failed_moves_and_writes_a_sidecar(inbox):
    write(inbox, 'chase.csv')
    adapter = LocalFolderAdapter(str(inbox))
    handle = adapter.list_candidates()[0]
    adapter.mark_failed(handle, 'no date column found')

    assert (inbox / 'failed' / 'chase.csv').exists()
    sidecar = inbox / 'failed' / 'chase.csv.error.txt'
    assert 'no date column found' in sidecar.read_text()


def test_mark_done_on_a_read_only_dir_does_not_raise(inbox):
    """Dedupe rests on the file hash, so a failed move must not break import."""
    write(inbox, 'chase.csv')
    adapter = LocalFolderAdapter(str(inbox))
    handle = adapter.list_candidates()[0]
    os.chmod(inbox, 0o500)
    try:
        adapter.mark_done(handle)  # must not raise
    finally:
        os.chmod(inbox, 0o700)


def test_rejects_a_path_outside_the_root(tmp_path, monkeypatch):
    monkeypatch.setenv('CSV_IMPORT_ROOT', str(tmp_path / 'inbox'))
    (tmp_path / 'inbox').mkdir()
    from src.services.csv_import.paths import PathOutsideRootError
    with pytest.raises(PathOutsideRootError):
        LocalFolderAdapter(str(tmp_path / 'elsewhere'))
