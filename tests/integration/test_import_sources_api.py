"""Integration tests for the import source API."""
from src.extensions import db
from src.models.import_source import ImportBatch, ImportProfile, ImportSource
from src.models.transaction import Expense
from tests.factories import UserFactory


def _admin(db):
    user = UserFactory()
    user.is_admin = True
    db.session.commit()
    return user


def test_create_source_requires_admin(client, db, auth_headers, tmp_path, monkeypatch):
    monkeypatch.setenv('CSV_IMPORT_ROOT', str(tmp_path))
    plain = UserFactory()
    resp = client.post('/api/v1/import-sources',
                       json={'path': str(tmp_path)},
                       headers=auth_headers(plain))
    assert resp.status_code == 403


def test_admin_creates_and_lists_a_source(client, db, auth_headers, tmp_path, monkeypatch):
    monkeypatch.setenv('CSV_IMPORT_ROOT', str(tmp_path))
    admin = _admin(db)
    resp = client.post('/api/v1/import-sources',
                       json={'path': str(tmp_path)},
                       headers=auth_headers(admin))
    assert resp.status_code == 201

    listed = client.get('/api/v1/import-sources', headers=auth_headers(admin))
    assert listed.status_code == 200
    assert len(listed.get_json()['sources']) == 1


def test_create_source_rejects_a_path_outside_the_root(
        client, db, auth_headers, tmp_path, monkeypatch):
    monkeypatch.setenv('CSV_IMPORT_ROOT', str(tmp_path / 'inbox'))
    (tmp_path / 'inbox').mkdir()
    admin = _admin(db)
    resp = client.post('/api/v1/import-sources',
                       json={'path': '/etc'},
                       headers=auth_headers(admin))
    assert resp.status_code == 400


def test_delete_batch_reverts_it(client, db, auth_headers):
    from datetime import datetime
    user = _admin(db)
    batch = ImportBatch(filename='c.csv', file_hash='h9', status='success',
                        user_id=user.id, imported_count=1)
    db.session.add(batch)
    db.session.flush()
    db.session.add(Expense(description='X', amount=1.0, date=datetime(2026, 1, 1),
                           user_id=user.id, paid_by=user.id, card_used='',
                           split_method='equal', import_batch_id=batch.id))
    db.session.commit()

    resp = client.delete(f'/api/v1/import-batches/{batch.id}',
                         headers=auth_headers(user))
    assert resp.status_code == 200
    assert resp.get_json()['reverted'] == 1
    assert Expense.query.filter_by(import_batch_id=batch.id).count() == 0


def test_batch_list_reports_whether_the_mapping_was_guessed(client, db, auth_headers):
    """The UI needs to tell a learned mapping from a guessed one.

    `confidence` alone cannot: the heuristics legitimately return 1.0 for an
    unambiguous header, so a guessed batch and a manually-mapped one are
    indistinguishable by confidence. Expose the profile's origin instead.
    """
    user = _admin(db)
    mapping = {'date': 'D', 'description': 'M', 'amount': 'V'}
    guessed = ImportProfile(name='guessed', header_fingerprint='fp-guessed',
                            mapping=mapping, origin='heuristic', confidence=1.0,
                            user_id=user.id)
    learned = ImportProfile(name='learned', header_fingerprint='fp-learned',
                            mapping=mapping, origin='manual', user_id=user.id)
    db.session.add_all([guessed, learned])
    db.session.flush()
    db.session.add_all([
        ImportBatch(filename='guessed.csv', file_hash='h11', status='success',
                    user_id=user.id, profile_id=guessed.id, confidence=1.0),
        ImportBatch(filename='learned.csv', file_hash='h12', status='success',
                    user_id=user.id, profile_id=learned.id),
        ImportBatch(filename='orphan.csv', file_hash='h13', status='failed',
                    user_id=user.id),
    ])
    db.session.commit()

    resp = client.get('/api/v1/import-batches', headers=auth_headers(user))
    assert resp.status_code == 200
    origins = {b['filename']: b['profile_origin'] for b in resp.get_json()['batches']}
    assert origins == {
        'guessed.csv': 'heuristic',
        'learned.csv': 'manual',
        'orphan.csv': None,
    }


def test_delete_another_users_batch_is_404(client, db, auth_headers):
    owner = UserFactory()
    intruder = _admin(db)
    batch = ImportBatch(filename='c.csv', file_hash='h10', status='success',
                        user_id=owner.id)
    db.session.add(batch)
    db.session.commit()

    resp = client.delete(f'/api/v1/import-batches/{batch.id}',
                         headers=auth_headers(intruder))
    assert resp.status_code == 404
