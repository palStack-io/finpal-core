"""The pace mark reaches the client, and says when it does not apply.

*** ASSERTED ON THE PAYLOAD, NOT ON THE SERVICE. *** `pace_for` has its own unit
tests; this is the other half — a function can be correct and unreachable, which
is D-187's whole shape (`evaluate_for_goal` was right and had no callers).
"""

from datetime import datetime
from decimal import Decimal

import pytest

from src.extensions import db as _db
from src.models.budget import Budget
from src.models.category import Category
from tests.factories import UserFactory

ENDPOINT = '/api/v1/budgets/overview'


@pytest.fixture
def user(db):
    return UserFactory(id='pace@test.com', name='Pace')


def _budget(user, name, amount, period='monthly', spending_type='flexible'):
    cat = Category(user_id=user.id, name=name, spending_type=spending_type)
    _db.session.add(cat)
    _db.session.commit()
    b = Budget(user_id=user.id, category_id=cat.id, name=name,
               amount=Decimal(amount), period=period, active=True,
               start_date=datetime.utcnow())
    _db.session.add(b)
    _db.session.commit()
    return b


def _overview(client, auth_headers, user):
    r = client.get(ENDPOINT, headers=auth_headers(user))
    assert r.status_code == 200, r.get_json()
    return r.get_json()


def test_THE_PAYLOAD_CARRIES_ONE_PACE_BLOCK(client, auth_headers, user):
    _budget(user, 'Groceries', '400.00')
    pace = _overview(client, auth_headers, user)['pace']
    assert set(pace) == {'fraction', 'day', 'days_in_month', 'as_of'}
    assert 0 < pace['fraction'] <= 1
    assert pace['day'] == datetime.now().day


def test_the_pace_block_is_SENT_ONCE_not_per_budget(client, auth_headers, user):
    """*** ONE FIGURE, NOT N COPIES. *** Every row shares today's position in the
    month. Repeating it per row invites a client to derive its own, and two
    clients working out 'today' independently draw the mark in two places."""
    for n in ('Groceries', 'Transport', 'Fun'):
        _budget(user, n, '100.00')
    data = _overview(client, auth_headers, user)
    assert 'pace' in data
    for group in data['groups']:
        for row in group['budgets']:
            assert 'pace' not in row, 'the pace figure was repeated per budget'


def test_A_MONTHLY_FLEXIBLE_BUDGET_HAS_A_READABLE_PACE(client, auth_headers, user):
    _budget(user, 'Groceries', '400.00', 'monthly', 'flexible')
    data = _overview(client, auth_headers, user)
    rows = [r for g in data['groups'] for r in g['budgets']]
    assert rows and all(r['pace_applies'] is True for r in rows)


def test_A_YEARLY_BUDGET_REPORTS_NO_PACE(client, auth_headers, user):
    """A day-of-MONTH position means nothing to a yearly budget."""
    _budget(user, 'Insurance', '462.50', 'yearly', 'flexible')
    rows = [r for g in _overview(client, auth_headers, user)['groups']
            for r in g['budgets']]
    assert rows and all(r['pace_applies'] is False for r in rows)


def test_THE_NON_MONTHLY_GROUP_REPORTS_NO_PACE_DESPITE_A_MONTHLY_PERIOD(
        client, auth_headers, user):
    """*** THE CASE A PERIOD CHECK ALONE WOULD MISS. *** `non_monthly` means
    *resupply that is not monthly*. An annual premium in a monthly-period budget
    is not 'behind' in March — it is not due — and marking it behind invents an
    urgency the data does not support."""
    _budget(user, 'Car insurance', '462.50', 'monthly', 'non_monthly')
    groups = {g['spending_type']: g for g in _overview(client, auth_headers, user)['groups']}
    rows = groups['non_monthly']['budgets']
    assert rows, 'the fixture did not land in the non_monthly group'
    assert all(r['pace_applies'] is False for r in rows)


def test_pace_applies_is_present_on_EVERY_row_so_a_client_never_guesses(
        client, auth_headers, user):
    """A missing key and `false` are different things to a client. Every row
    carries the flag, so the renderer never has to infer one."""
    _budget(user, 'Rent', '1200.00', 'monthly', 'fixed')
    _budget(user, 'Insurance', '462.50', 'yearly', 'non_monthly')
    rows = [r for g in _overview(client, auth_headers, user)['groups']
            for r in g['budgets']]
    assert len(rows) == 2
    assert all('pace_applies' in r for r in rows)
