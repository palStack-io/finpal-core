"""Approval is a human-only act. If an agent can approve, the guard is theatre."""
from datetime import datetime, timedelta

from src.extensions import db
from src.models.agent_action import (
    STATUS_APPROVED,
    STATUS_PENDING,
    STATUS_REJECTED,
    AgentAction,
)
from src.models.personal_access_token import (
    SCOPE_READ_WRITE,
    PersonalAccessToken,
)
from tests.factories import UserFactory


def _pending(user, action='create_transaction', payload=None):
    row = AgentAction.record(
        user_id=user.id, token_id=None, action=action,
        payload=payload or {'amount': 12.5, 'description': 'Agent proposal'},
        status=STATUS_PENDING)
    db.session.commit()
    return row


def _write_token(user):
    token, plaintext = PersonalAccessToken.generate(
        user_id=user.id, name='agent', scopes=SCOPE_READ_WRITE,
        expires_at=datetime.utcnow() + timedelta(days=1))
    db.session.commit()
    return plaintext


def test_a_token_cannot_reach_any_agent_action_endpoint(client, db, auth_headers):
    """The most important access rule in the feature."""
    user = UserFactory()
    row = _pending(user)
    plaintext = _write_token(user)
    hdr = {'X-API-Key': plaintext}

    # 401 specifically, not >= 400: a 404 (route missing) or 500 (handler
    # broken) would also satisfy >= 400 while proving nothing about refusal.
    # This assertion guards the rule the whole feature rests on.
    assert client.get('/api/v1/agent-actions', headers=hdr).status_code == 401
    assert client.post('/api/v1/agent-actions/%d/approve' % row.id,
                       headers=hdr).status_code == 401
    assert client.post('/api/v1/agent-actions/%d/reject' % row.id,
                       headers=hdr).status_code == 401
    assert client.delete('/api/v1/agent-actions/%d' % row.id,
                         headers=hdr).status_code == 401

    db.session.refresh(row)
    assert row.status == STATUS_PENDING, 'a token changed a proposal'


def test_owner_lists_their_pending_actions(client, db, auth_headers):
    user = UserFactory()
    _pending(user)
    resp = client.get('/api/v1/agent-actions', headers=auth_headers(user))
    assert resp.status_code == 200
    assert len(resp.get_json()['actions']) == 1


def test_another_user_cannot_see_or_approve_it(client, db, auth_headers):
    owner = UserFactory()
    intruder = UserFactory()
    row = _pending(owner)

    listing = client.get('/api/v1/agent-actions', headers=auth_headers(intruder))
    assert listing.get_json()['actions'] == []

    resp = client.post('/api/v1/agent-actions/%d/approve' % row.id,
                       headers=auth_headers(intruder))
    assert resp.status_code == 404
    db.session.refresh(row)
    assert row.status == STATUS_PENDING


def test_approving_applies_the_change_once(client, db, auth_headers):
    from src.models.transaction import Expense
    user = UserFactory()
    row = _pending(user, payload={'amount': 12.5, 'description': 'Agent proposal',
                                  'date': '2026-07-01'})

    first = client.post('/api/v1/agent-actions/%d/approve' % row.id,
                        headers=auth_headers(user))
    assert first.status_code == 200
    db.session.refresh(row)
    assert row.status == STATUS_APPROVED
    assert row.decided_at is not None
    assert row.target_ref is not None
    assert Expense.query.filter_by(description='Agent proposal').count() == 1

    second = client.post('/api/v1/agent-actions/%d/approve' % row.id,
                         headers=auth_headers(user))
    assert second.status_code == 409, 'approval was not idempotent'
    assert Expense.query.filter_by(description='Agent proposal').count() == 1


def test_rejecting_leaves_data_untouched(client, db, auth_headers):
    from src.models.transaction import Expense
    user = UserFactory()
    row = _pending(user)

    resp = client.post('/api/v1/agent-actions/%d/reject' % row.id,
                       headers=auth_headers(user))
    assert resp.status_code == 200
    db.session.refresh(row)
    assert row.status == STATUS_REJECTED
    assert Expense.query.count() == 0


def test_an_expired_proposal_cannot_be_approved(client, db, auth_headers):
    user = UserFactory()
    row = _pending(user)
    row.expires_at = datetime.utcnow() - timedelta(seconds=1)
    db.session.commit()

    resp = client.post('/api/v1/agent-actions/%d/approve' % row.id,
                       headers=auth_headers(user))
    assert resp.status_code == 409
    db.session.refresh(row)
    assert row.status != STATUS_APPROVED
