"""An agent recategorising a transaction, on the real endpoint.

BLOCKED — these are the requirements, and they fail for a reason in the routing
table rather than in this feature. `PUT /api/v1/transactions/<id>` is served by
`src/services/transaction/api_routes.py:update_transaction`, not by the flask-restx
`TransactionDetail.put` the guard was meant to decorate:

  * The two rules are `/api/v1/transactions/<int:transaction_id>` (legacy
    blueprint, registered first) and `/api/v1/transactions/<int:id>` (restx).
    `strict_slashes` is off, so both rules match both URL forms and Werkzeug's
    stable sort hands every GET, PUT and DELETE to the legacy blueprint. The
    restx class is unreachable code. `_KNOWN_DUPLICATE_RULES` does not catch this
    because it compares rule strings, and `<int:id>` != `<int:transaction_id>`.
  * The reachable legacy handler cannot express this operation. It rebuilds a
    full form from the JSON body, so `{'category_id': N}` alone means
    `description=None` and `float(None)`; and every JSON PUT hard-deletes the
    expense's `CategorySplit` rows and clears `has_category_splits`, which no
    `undo_state` of `{'category_id': N}` can restore. Marking that write SAFE
    would make the guardrail's reversibility promise false.

The route now resolves to `TransactionDetail` (the legacy detail handlers were
retired), so these run for real. They were xfail(strict=True) until then, which is
what forced this to be finished rather than forgotten. Nothing in
the assertions below needs to change.
"""
from datetime import datetime, timedelta

import pytest

from src.extensions import db
from src.models.agent_action import STATUS_APPLIED, STATUS_REVERTED, AgentAction
from src.models.category import Category
from src.models.personal_access_token import (
    SCOPE_READ,
    SCOPE_READ_WRITE,
    PersonalAccessToken,
)
from src.models.transaction import Expense
from tests.factories import UserFactory


def _setup(db, scopes=SCOPE_READ_WRITE):
    user = UserFactory()
    old = Category(name='Uncategorised', user_id=user.id)
    new = Category(name='Groceries', user_id=user.id)
    db.session.add_all([old, new])
    db.session.flush()
    expense = Expense(description='Tesco', amount=20.0, date=datetime(2026, 7, 1),
                      user_id=user.id, paid_by=user.id, card_used='',
                      split_method='equal', category_id=old.id)
    db.session.add(expense)
    _, plaintext = PersonalAccessToken.generate(
        user_id=user.id, name='agent', scopes=scopes,
        expires_at=datetime.utcnow() + timedelta(days=1))
    db.session.commit()
    return user, expense, old, new, plaintext


def test_agent_recategorises_and_the_change_is_reversible(client, db):
    user, expense, old, new, plaintext = _setup(db)

    resp = client.put('/api/v1/transactions/%d/' % expense.id,
                      json={'category_id': new.id},
                      headers={'X-API-Key': plaintext})
    assert resp.status_code == 200, resp.get_json()

    db.session.refresh(expense)
    assert expense.category_id == new.id

    row = AgentAction.query.filter_by(action='update_transaction_category').first()
    assert row is not None, 'the write was not audited'
    assert row.status == STATUS_APPLIED
    assert row.undo_state == {'category_id': old.id}, (
        'undo_state must hold the PRIOR category or the change cannot be reversed')


def test_reverting_restores_the_previous_category(client, db, auth_headers):
    user, expense, old, new, plaintext = _setup(db)
    client.put('/api/v1/transactions/%d/' % expense.id,
               json={'category_id': new.id},
               headers={'X-API-Key': plaintext})
    row = AgentAction.query.filter_by(action='update_transaction_category').first()

    resp = client.delete('/api/v1/agent-actions/%d' % row.id,
                         headers=auth_headers(user))
    assert resp.status_code == 200

    db.session.refresh(expense)
    db.session.refresh(row)
    assert expense.category_id == old.id
    assert row.status == STATUS_REVERTED

    again = client.delete('/api/v1/agent-actions/%d' % row.id,
                          headers=auth_headers(user))
    assert again.status_code == 409, 'revert must not be repeatable'


def test_a_read_token_cannot_recategorise(client, db):
    user, expense, old, new, plaintext = _setup(db, scopes=SCOPE_READ)

    resp = client.put('/api/v1/transactions/%d/' % expense.id,
                      json={'category_id': new.id},
                      headers={'X-API-Key': plaintext})

    assert resp.status_code == 403
    db.session.refresh(expense)
    assert expense.category_id == old.id
