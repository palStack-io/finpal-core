"""Integration tests for manual CSV import (POST /api/v1/csv-import/import)."""
import io
import json

from tests.factories import UserFactory


def post_csv(client, headers, csv_body, mapping, config=None):
    """POST a CSV to the import endpoint as multipart form data."""
    data = {
        'file': (io.BytesIO(csv_body.encode()), 'test.csv'),
        'mapping': json.dumps(mapping),
    }
    if config is not None:
        data['config'] = json.dumps(config)
    return client.post(
        '/api/v1/csv-import/import',
        data=data,
        headers=headers,
        content_type='multipart/form-data',
    )


BASIC_CSV = (
    "Date,Description,Amount\n"
    "2026-01-15,Coffee Shop,-4.50\n"
    "2026-01-16,Paycheck,2000.00\n"
)
BASIC_MAPPING = {'date': 'Date', 'description': 'Description', 'amount': 'Amount'}


def test_import_persists_transactions(client, db, auth_headers):
    user = UserFactory()
    resp = post_csv(client, auth_headers(user), BASIC_CSV, BASIC_MAPPING,
                    {'date_format': '%Y-%m-%d'})

    assert resp.status_code == 200
    assert resp.get_json()['imported'] == 2

    from src.models.transaction import Expense
    rows = Expense.query.filter_by(user_id=user.id).order_by(Expense.date).all()
    assert len(rows) == 2
    assert rows[0].description == 'Coffee Shop'
    assert rows[0].amount == 4.50
    assert rows[0].transaction_type == 'expense'
    assert rows[1].transaction_type == 'income'


def test_import_maps_notes_column(client, db, auth_headers):
    user = UserFactory()
    csv_body = (
        "Date,Description,Amount,Memo\n"
        "2026-01-15,Coffee Shop,-4.50,morning latte\n"
    )
    resp = post_csv(
        client, auth_headers(user), csv_body,
        {'date': 'Date', 'description': 'Description', 'amount': 'Amount',
         'notes': 'Memo'},
        {'date_format': '%Y-%m-%d'},
    )

    assert resp.status_code == 200
    assert resp.get_json()['imported'] == 1

    from src.models.transaction import Expense
    row = Expense.query.filter_by(user_id=user.id).one()
    assert row.notes == 'morning latte'


def test_import_reports_failure_rather_than_false_success(client, db, auth_headers):
    """A file where no row can be imported must not return success: true."""
    user = UserFactory()
    resp = post_csv(
        client, auth_headers(user),
        "Date,Description,Amount\nnot-a-date,Thing,abc\n",
        BASIC_MAPPING, {'date_format': '%Y-%m-%d'},
    )

    body = resp.get_json()
    assert body['imported'] == 0
    assert body['success'] is False
    assert body['errors'] == 1


def test_successful_import_saves_a_profile(client, db, auth_headers):
    """One manual mapping should teach the system this bank's format."""
    user = UserFactory()
    resp = post_csv(client, auth_headers(user), BASIC_CSV, BASIC_MAPPING,
                    {'date_format': '%Y-%m-%d'})
    assert resp.status_code == 200

    from src.services.csv_import.fingerprint import find_profile
    profile = find_profile(['Date', 'Description', 'Amount'], user.id)
    assert profile is not None
    assert profile.origin == 'manual'
    assert profile.mapping['amount'] == 'Amount'
    assert profile.date_format == '%Y-%m-%d'


def test_failed_import_saves_no_profile(client, db, auth_headers):
    user = UserFactory()
    post_csv(client, auth_headers(user),
             "Date,Description,Amount\nbad,X,abc\n",
             BASIC_MAPPING, {'date_format': '%Y-%m-%d'})

    from src.services.csv_import.fingerprint import find_profile
    assert find_profile(['Date', 'Description', 'Amount'], user.id) is None
