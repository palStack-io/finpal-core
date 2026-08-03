"""Integration tests for the folder-watch scanner."""
import pytest

from src.extensions import db
from src.models.import_source import ImportBatch, ImportSource
from src.models.transaction import Expense
from src.services.csv_import.fingerprint import save_profile
from src.services.csv_import.scanner import scan_source
from tests.factories import UserFactory

CSV = ("Date,Description,Amount\n"
       "2026-01-15,Coffee Shop,-4.50\n"
       "2026-01-16,Paycheck,2000.00\n")


@pytest.fixture
def source(db, tmp_path, monkeypatch):
    monkeypatch.setenv('CSV_IMPORT_ROOT', str(tmp_path))
    user = UserFactory()
    src = ImportSource(kind='local_folder', config={'path': str(tmp_path)},
                       user_id=user.id)
    db.session.add(src)
    db.session.commit()
    return src


def drop(tmp_path, name='chase.csv', body=CSV):
    (tmp_path / name).write_text(body)


def test_scan_imports_a_known_format(source, tmp_path):
    save_profile(['Date', 'Description', 'Amount'],
                 {'date': 'Date', 'description': 'Description', 'amount': 'Amount'},
                 source.user_id, name='Chase', date_format='%Y-%m-%d',
                 sign_convention='negative_is_expense', origin='manual')
    drop(tmp_path)

    scan_source(source)   # first pass records the file, does not import
    batches = scan_source(source)  # second pass: size/mtime stable

    assert len(batches) == 1
    assert batches[0].imported_count == 2
    assert Expense.query.filter_by(user_id=source.user_id).count() == 2
    assert all(e.import_batch_id == batches[0].id
               for e in Expense.query.filter_by(user_id=source.user_id))


def test_first_pass_defers_an_unstable_file(source, tmp_path):
    """A file still being written must not be imported truncated."""
    drop(tmp_path)
    assert scan_source(source) == []
    assert ImportBatch.query.count() == 0


def test_identical_file_is_not_reimported(source, tmp_path):
    save_profile(['Date', 'Description', 'Amount'],
                 {'date': 'Date', 'description': 'Description', 'amount': 'Amount'},
                 source.user_id, name='Chase', date_format='%Y-%m-%d',
                 sign_convention='negative_is_expense', origin='manual')
    drop(tmp_path)
    scan_source(source)
    scan_source(source)
    assert ImportBatch.query.count() == 1

    drop(tmp_path)  # same content, dropped again
    scan_source(source)
    scan_source(source)
    assert ImportBatch.query.count() == 1


def test_file_moves_to_processed_after_success(source, tmp_path):
    save_profile(['Date', 'Description', 'Amount'],
                 {'date': 'Date', 'description': 'Description', 'amount': 'Amount'},
                 source.user_id, name='Chase', date_format='%Y-%m-%d',
                 sign_convention='negative_is_expense', origin='manual')
    drop(tmp_path)
    scan_source(source)
    scan_source(source)
    assert not (tmp_path / 'chase.csv').exists()
    assert len(list((tmp_path / 'processed').iterdir())) == 1


def test_scan_updates_last_scanned_at(source, tmp_path):
    assert source.last_scanned_at is None
    scan_source(source)
    assert source.last_scanned_at is not None


def test_unknown_format_is_imported_via_heuristics(source, tmp_path):
    drop(tmp_path, 'newbank.csv',
         "Posting Date,Narrative,Amount\n"
         "2026-01-15,CARD PURCHASE COFFEE SHOP,-4.50\n"
         "2026-01-16,SALARY PAYMENT,2000.00\n")
    scan_source(source)
    batches = scan_source(source)

    assert len(batches) == 1
    assert batches[0].imported_count == 2
    assert batches[0].confidence == 1.0
    assert Expense.query.filter_by(user_id=source.user_id).count() == 2


def test_heuristic_result_is_saved_as_a_profile(source, tmp_path):
    drop(tmp_path, 'newbank.csv',
         "Posting Date,Narrative,Amount\n"
         "2026-01-15,CARD PURCHASE COFFEE SHOP,-4.50\n")
    scan_source(source)
    scan_source(source)

    from src.services.csv_import.fingerprint import find_profile
    profile = find_profile(['Posting Date', 'Narrative', 'Amount'],
                           source.user_id)
    assert profile is not None
    assert profile.origin == 'heuristic'


def test_unmappable_file_fails_without_touching_the_ledger(source, tmp_path):
    drop(tmp_path, 'junk.csv', "Foo,Bar\nhello,world\n")
    scan_source(source)
    batches = scan_source(source)

    assert batches == []
    assert Expense.query.filter_by(user_id=source.user_id).count() == 0
    batch = ImportBatch.query.filter_by(filename='junk.csv').one()
    assert batch.status == 'failed'
    assert (tmp_path / 'failed' / 'junk.csv').exists()
