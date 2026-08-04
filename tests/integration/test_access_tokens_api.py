"""Minting and revoking tokens. JWT-only: a token cannot mint another token."""
from datetime import datetime, timedelta

from src.extensions import db
from src.models.agent_action import STATUS_PENDING, STATUS_REJECTED, AgentAction
from src.models.personal_access_token import (
    DEFAULT_LIFETIME_DAYS,
    MAX_LIFETIME_DAYS,
    SCOPE_READ,
    SCOPE_READ_WRITE,
    PersonalAccessToken,
)
from tests.factories import UserFactory


def test_minting_returns_the_plaintext_exactly_once(client, db, auth_headers):
    user = UserFactory()
    resp = client.post('/api/v1/access-tokens',
                       json={'name': 'Claude Desktop', 'scopes': SCOPE_READ},
                       headers=auth_headers(user))
    assert resp.status_code == 201
    body = resp.get_json()
    plaintext = body['token']
    assert plaintext.startswith('fp_live_')

    listing = client.get('/api/v1/access-tokens', headers=auth_headers(user))
    assert listing.status_code == 200
    tokens = listing.get_json()['tokens']
    assert len(tokens) == 1
    assert 'token' not in tokens[0], 'the listing leaked the plaintext'
    assert 'token_hash' not in tokens[0], 'the listing leaked the hash'
    assert plaintext not in listing.get_data(as_text=True)
    assert tokens[0]['token_prefix'] in plaintext


def test_default_expiry_is_applied_and_the_cap_enforced(client, db, auth_headers):
    user = UserFactory()
    resp = client.post('/api/v1/access-tokens',
                       json={'name': 'default expiry'},
                       headers=auth_headers(user))
    assert resp.status_code == 201
    expires = datetime.fromisoformat(resp.get_json()['token_info']['expires_at'])
    days = (expires - datetime.utcnow()).days
    assert DEFAULT_LIFETIME_DAYS - 1 <= days <= DEFAULT_LIFETIME_DAYS

    too_long = client.post(
        '/api/v1/access-tokens',
        json={'name': 'forever', 'expires_in_days': MAX_LIFETIME_DAYS + 1},
        headers=auth_headers(user))
    assert too_long.status_code == 400


def test_an_unknown_scope_is_rejected(client, db, auth_headers):
    user = UserFactory()
    resp = client.post('/api/v1/access-tokens',
                       json={'name': 'bad', 'scopes': 'admin'},
                       headers=auth_headers(user))
    assert resp.status_code == 400


def test_revoking_also_rejects_that_tokens_pending_proposals(client, db, auth_headers):
    """A withdrawn credential's proposals must not stay approvable."""
    user = UserFactory()
    token, _ = PersonalAccessToken.generate(
        user_id=user.id, name='n', scopes=SCOPE_READ_WRITE,
        expires_at=datetime.utcnow() + timedelta(days=1))
    db.session.commit()
    pending = AgentAction.record(
        user_id=user.id, token_id=token.id, action='create_transaction',
        payload={}, status=STATUS_PENDING)
    db.session.commit()

    resp = client.delete('/api/v1/access-tokens/%d' % token.id,
                         headers=auth_headers(user))
    assert resp.status_code == 200

    db.session.refresh(token)
    db.session.refresh(pending)
    assert token.revoked_at is not None
    assert pending.status == STATUS_REJECTED


def test_a_user_cannot_see_or_revoke_another_users_token(client, db, auth_headers):
    owner = UserFactory()
    intruder = UserFactory()
    token, _ = PersonalAccessToken.generate(
        user_id=owner.id, name='n', scopes=SCOPE_READ,
        expires_at=datetime.utcnow() + timedelta(days=1))
    db.session.commit()

    listing = client.get('/api/v1/access-tokens', headers=auth_headers(intruder))
    assert listing.get_json()['tokens'] == []

    resp = client.delete('/api/v1/access-tokens/%d' % token.id,
                         headers=auth_headers(intruder))
    assert resp.status_code == 404
    db.session.refresh(token)
    assert token.revoked_at is None


def test_a_token_cannot_mint_or_list_tokens(client, db):
    """Otherwise a leaked read token escalates to a write token."""
    user = UserFactory()
    _, plaintext = PersonalAccessToken.generate(
        user_id=user.id, name='n', scopes=SCOPE_READ_WRITE,
        expires_at=datetime.utcnow() + timedelta(days=1))
    db.session.commit()
    hdr = {'X-API-Key': plaintext}

    # 401 specifically, not >= 400: a 404 (route missing) or 500 (handler
    # broken) would also satisfy >= 400 while proving nothing about refusal.
    # This assertion guards the rule the whole feature rests on.
    assert client.get('/api/v1/access-tokens', headers=hdr).status_code == 401
    assert client.post('/api/v1/access-tokens', json={'name': 'x'},
                       headers=hdr).status_code == 401
