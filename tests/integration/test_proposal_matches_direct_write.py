"""An approved proposal must build the same transaction a direct POST would.

The first version of apply.py hand-built the Expense and silently diverged in
seven ways — no rule engine, no validation, account_id and currency_code
dropped, notes/tags/splits discarded, a different card_used default, and the date
truncated to a day. Someone approving a proposal has no reason to expect a
different transaction from the one they were shown, so this pins the equivalence
rather than trusting a shared-code comment.
"""
from datetime import datetime, timedelta

from src.extensions import db
from src.models.account import Account
from src.models.agent_action import STATUS_PENDING, AgentAction
from src.models.transaction import Expense
from tests.factories import UserFactory

FIELDS = ('description', 'amount', 'currency_code', 'card_used', 'account_id',
          'category_id', 'transaction_type', 'notes', 'split_method', 'paid_by')


def _payload(account_id):
    return {
        'description': 'Rich payload',
        'amount': 41.5,
        'date': '2026-07-04T13:45:00',
        'currency_code': 'GBP',
        'card_used': 'Amex',
        'account_id': account_id,
        'transaction_type': 'expense',
        'notes': 'agent note',
        'split_method': 'equal',
    }


def test_approved_proposal_equals_a_direct_post(client, db, auth_headers):
    user = UserFactory()
    account = Account(name='Current', type='checking', user_id=user.id)
    db.session.add(account)
    db.session.commit()

    direct = client.post('/api/v1/transactions/', json=_payload(account.id),
                         headers=auth_headers(user))
    assert direct.status_code == 201, direct.get_json()

    row = AgentAction.record(user_id=user.id, token_id=None,
                             action='create_transaction',
                             payload=_payload(account.id), status=STATUS_PENDING)
    db.session.commit()
    approved = client.post('/api/v1/agent-actions/%d/approve' % row.id,
                           headers=auth_headers(user))
    assert approved.status_code == 200, approved.get_json()

    rows = Expense.query.filter_by(description='Rich payload').order_by(
        Expense.id).all()
    assert len(rows) == 2
    posted, from_proposal = rows

    for field in FIELDS:
        assert getattr(posted, field) == getattr(from_proposal, field), (
            'approved proposal differs from a direct POST on %r: '
            '%r vs %r' % (field, getattr(posted, field),
                          getattr(from_proposal, field)))
    # Time-of-day must survive; the old version truncated to the day.
    assert posted.date == from_proposal.date == datetime(2026, 7, 4, 13, 45)


def test_an_invalid_proposal_is_refused_at_approval_not_applied(client, db,
                                                                auth_headers):
    """guarded_write records proposals before validation runs, so the queue can
    hold a malformed one. Approving it must refuse, not create rubbish."""
    user = UserFactory()
    row = AgentAction.record(user_id=user.id, token_id=None,
                             action='create_transaction',
                             payload={'description': 'no amount or date'},
                             status=STATUS_PENDING)
    db.session.commit()
    before = Expense.query.count()

    resp = client.post('/api/v1/agent-actions/%d/approve' % row.id,
                       headers=auth_headers(user))

    assert resp.status_code == 422, resp.get_json()
    assert Expense.query.count() == before
    db.session.refresh(row)
    assert row.status == STATUS_PENDING, 'a refused proposal must stay pending'
