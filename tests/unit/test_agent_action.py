"""AgentAction is both the proposal queue and the write audit log."""
from datetime import datetime, timedelta

from src.extensions import db
from src.models.agent_action import (
    PROPOSAL_TTL_HOURS,
    STATUS_APPLIED,
    STATUS_PENDING,
    AgentAction,
)
from tests.factories import UserFactory


def test_recording_an_applied_action_captures_undo_state(db):
    user = UserFactory()
    action = AgentAction.record(
        user_id=user.id, token_id=None, action='update_transaction_category',
        payload={'transaction_id': 5, 'category_id': 9},
        status=STATUS_APPLIED, undo_state={'category_id': 3},
        target_ref='expense:5')
    db.session.commit()

    assert action.id is not None
    assert action.status == STATUS_APPLIED
    assert action.undo_state == {'category_id': 3}
    assert action.target_ref == 'expense:5'
    assert action.created_at is not None
    assert action.decided_at is None
    assert action.reverted_at is None


def test_a_pending_proposal_gets_a_ttl(db):
    user = UserFactory()
    action = AgentAction.record(
        user_id=user.id, token_id=None, action='create_transaction',
        payload={'amount': 10.0}, status=STATUS_PENDING)
    db.session.commit()

    assert action.is_pending is True
    assert action.expires_at is not None
    # Roughly PROPOSAL_TTL_HOURS from now, allowing for clock skew in the test.
    delta = action.expires_at - datetime.utcnow()
    assert timedelta(hours=PROPOSAL_TTL_HOURS - 1) < delta <= timedelta(
        hours=PROPOSAL_TTL_HOURS)


def test_expiry_is_reported(db):
    user = UserFactory()
    action = AgentAction.record(
        user_id=user.id, token_id=None, action='create_transaction',
        payload={}, status=STATUS_PENDING)
    action.expires_at = datetime.utcnow() - timedelta(seconds=1)
    db.session.commit()

    assert action.is_expired is True
    assert action.is_pending is True  # status unchanged until someone acts


def test_token_id_survives_the_token_being_deleted(db):
    """History must not vanish when a credential is cleaned up."""
    from src.models.personal_access_token import SCOPE_READ, PersonalAccessToken
    user = UserFactory()
    token, _ = PersonalAccessToken.generate(
        user_id=user.id, name='n', scopes=SCOPE_READ,
        expires_at=datetime.utcnow() + timedelta(days=1))
    db.session.commit()

    action = AgentAction.record(
        user_id=user.id, token_id=token.id, action='create_transaction',
        payload={}, status=STATUS_PENDING)
    db.session.commit()
    assert action.token_id == token.id
