"""A read token must actually be able to read something.

Minting a token that no endpoint accepts is a feature that exists only in the
database. The write path is still gated (see the deferred Task 7), but reads are
the bulk of what an MCP client does and need no guard — only authentication.
"""
from datetime import datetime, timedelta

from src.extensions import db
from src.models.personal_access_token import (
    SCOPE_READ,
    SCOPE_READ_WRITE,
    PersonalAccessToken,
)
from src.models.transaction import Expense
from tests.factories import UserFactory

READ_ENDPOINTS = [
    '/api/v1/transactions/',
    '/api/v1/accounts',
    '/api/v1/categories/',
    '/api/v1/budgets/',
]


def _token(user, scopes=SCOPE_READ):
    _, plaintext = PersonalAccessToken.generate(
        user_id=user.id, name='reader', scopes=scopes,
        expires_at=datetime.utcnow() + timedelta(days=1))
    db.session.commit()
    return plaintext


def test_a_read_token_can_read_every_wired_endpoint(client, db):
    user = UserFactory()
    plaintext = _token(user)
    for path in READ_ENDPOINTS:
        resp = client.get(path, headers={'X-API-Key': plaintext})
        assert resp.status_code == 200, (
            '%s refused a read token: %s %s'
            % (path, resp.status_code, resp.get_data(as_text=True)[:120]))


def test_a_read_write_token_can_also_read(client, db):
    """read_write implies read, or every agent needs two tokens."""
    user = UserFactory()
    plaintext = _token(user, scopes=SCOPE_READ_WRITE)
    resp = client.get('/api/v1/transactions/', headers={'X-API-Key': plaintext})
    assert resp.status_code == 200


def test_a_token_only_reads_its_own_users_data(client, db):
    """The identity shim must resolve to the token's owner, not anyone else."""
    owner = UserFactory()
    stranger = UserFactory()
    db.session.add(Expense(
        description='Owner private', amount=9.99, date=datetime(2026, 7, 1),
        user_id=owner.id, paid_by=owner.id, card_used='', split_method='equal'))
    db.session.commit()

    resp = client.get('/api/v1/transactions/',
                      headers={'X-API-Key': _token(stranger)})
    assert resp.status_code == 200
    assert 'Owner private' not in resp.get_data(as_text=True)


def test_a_revoked_token_cannot_read(client, db):
    user = UserFactory()
    plaintext = _token(user)
    token = PersonalAccessToken.find_by_plaintext(plaintext)
    token.revoked_at = datetime.utcnow()
    db.session.commit()

    resp = client.get('/api/v1/transactions/', headers={'X-API-Key': plaintext})
    assert resp.status_code == 401
    assert resp.get_json()['error'] == 'token_revoked'


def test_writes_are_still_refused_to_a_read_token(client, db):
    """Wiring reads must not accidentally open the write path."""
    user = UserFactory()
    resp = client.post('/api/v1/transactions/',
                       json={'description': 'nope', 'amount': 1.0,
                             'date': '2026-07-01'},
                       headers={'X-API-Key': _token(user)})
    assert resp.status_code in (401, 403), resp.get_data(as_text=True)[:120]
    assert Expense.query.filter_by(description='nope').count() == 0
