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
    '/api/v1/analytics/networth',
    '/api/v1/recurring/',
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
    """The identity shim must resolve to the token's owner, not anyone else.

    **This survived the household change on purpose — D-50.** When the transactions
    list went household-wide (D-18 items B+D), every read went with it, and a PAT
    resolves through the same `get_jwt_identity()` shim. That would have widened a
    long-lived credential's reach as a *side effect* of a UI decision.

    `AgentAccess.tsx:386` tells the user "A token reads only your own data", and a
    PAT is what gets pasted into an MCP client or a cron script. So token reads stay
    caller-scoped and the household widening applies to sessions only. The two
    users below are both ordinary household members now, which is precisely why this
    test still has teeth: under the session rule the row WOULD be returned.
    """
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


def test_the_two_newly_wired_endpoints_reject_a_revoked_token(client, db):
    """Wiring an endpoint must not skip the revocation check."""
    user = UserFactory()
    plaintext = _token(user)
    token = PersonalAccessToken.find_by_plaintext(plaintext)
    token.revoked_at = datetime.utcnow()
    db.session.commit()

    for path in ('/api/v1/analytics/networth', '/api/v1/recurring/'):
        resp = client.get(path, headers={'X-API-Key': plaintext})
        assert resp.status_code == 401, path
        assert resp.get_json()['error'] == 'token_revoked', path


def test_whoami_tells_a_token_which_identity_it_belongs_to(client, db):
    """An API client cannot infer the caller from the data.

    finPal returns household-wide rows for accounts, categories and budgets, so
    "all rows share one user_id" gives a confident but wrong answer in a
    two-person household. Without this endpoint an MCP client cannot tell "you"
    from "another member" and must label everyone a pseudonym.
    """
    user = UserFactory()
    resp = client.get('/api/v1/auth/whoami', headers={'X-API-Key': _token(user)})

    assert resp.status_code == 200, resp.get_data(as_text=True)[:200]
    assert resp.get_json()['id'] == user.id


def test_whoami_returns_nothing_beyond_identity(client, db):
    """It is reachable by a token, so it must not become a data leak."""
    user = UserFactory()
    resp = client.get('/api/v1/auth/whoami', headers={'X-API-Key': _token(user)})
    assert set(resp.get_json().keys()) == {'id', 'name'}


def test_whoami_rejects_a_revoked_token(client, db):
    user = UserFactory()
    plaintext = _token(user)
    token = PersonalAccessToken.find_by_plaintext(plaintext)
    token.revoked_at = datetime.utcnow()
    db.session.commit()

    resp = client.get('/api/v1/auth/whoami', headers={'X-API-Key': plaintext})
    assert resp.status_code == 401
    assert resp.get_json()['error'] == 'token_revoked'
