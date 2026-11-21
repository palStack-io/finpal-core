"""A goal's mountain is SIZED BY THE GOAL (Harun, 2026-11-20, binding).

The mountain is the goal's own size (a saving goal's target; a debt goal's amount to clear, target minus start)
mapped to a real peak by size on ONE money ladder, and how far up is the goal's progress (the server's
`progress`). One definition on the server, so every screen names the same mountain. Everest's climber is acts
only and is not touched here.
"""
from decimal import Decimal

import pytest

from src.extensions import db as _db
from src.models.goal import Goal
from src.data.seed_mountains import seed_mountains
from src.services.goal.mountains import goal_size
from src.services.goal.peak import peak_payload
from src.services.goal.watermark import raise_hardest_band
from tests.factories import UserFactory, AccountFactory


@pytest.fixture
def seeded(db):
    seed_mountains()


def _saving(user_id, start, target, balance):
    account = AccountFactory(user_id=user_id, name='Savings', type='savings', balance=balance)
    _db.session.commit()
    goal = Goal(user_id=user_id, name='Emergency fund', kind='savings', start_amount=Decimal(start),
                target_amount=Decimal(target), account_id=account.id, currency_code='USD')
    _db.session.add(goal)
    _db.session.commit()
    return goal, account


def _debt(user_id, start, balance, apr='19.99'):
    account = AccountFactory(user_id=user_id, name='Visa', type='credit', balance=balance)
    account.apr = Decimal(apr) if apr is not None else None
    _db.session.commit()
    goal = Goal(user_id=user_id, name='Pay off the Visa', kind='payoff', start_amount=Decimal(start),
                target_amount=Decimal('0.00'), account_id=account.id, currency_code='USD')
    _db.session.add(goal)
    _db.session.commit()
    return goal, account


def test_a_saving_goal_is_sized_by_its_target_not_what_is_left(seeded):
    user = UserFactory()
    goal, _ = _saving(user.id, '2000.00', '16000.00', 8000.0)
    peak = peak_payload(goal)['peak']
    assert peak['size'] == 16000.0
    # 16,000 sits in the 15,000-40,000 rung: Aconcagua, whatever has been saved so far.
    assert peak['mountain']['name'] == 'Aconcagua'
    assert peak['band'] == 4
    assert peak['unmeasured'] is False


def test_the_mountain_does_not_shrink_as_the_goal_fills(seeded):
    user = UserFactory()
    goal, account = _saving(user.id, '0.00', '16000.00', 1000.0)
    before = peak_payload(goal)['peak']['mountain']['name']
    account.balance = 15900.0
    _db.session.commit()
    assert peak_payload(goal)['peak']['mountain']['name'] == before


def test_a_debt_goal_is_sized_by_the_amount_to_clear(seeded):
    user = UserFactory()
    goal, _ = _debt(user.id, '-1650.00', -800.0)
    peak = peak_payload(goal)['peak']
    assert peak['scale'] == 'cost'          # still a debt: rust, and the interest wording keeps its figure
    assert peak['size'] == 1650.0
    assert peak['mountain']['name'] == 'Ben Nevis'
    assert round(peak['magnitude'], 2) == 13.33


def test_a_debt_with_no_rate_still_has_its_mountain_and_says_the_rate_is_unknown(seeded):
    user = UserFactory()
    goal, _ = _debt(user.id, '-5000.00', -4000.0, apr=None)
    peak = peak_payload(goal)['peak']
    assert peak['unmeasured'] is False
    assert peak['rate_unknown'] is True
    assert peak['magnitude'] is None
    assert peak['mountain']['name'] == 'Mount Fuji'      # 5,000 to clear


def test_a_goal_with_no_size_is_unmeasured_and_not_band_zero(seeded):
    user = UserFactory()
    goal, _ = _debt(user.id, '0.00', 0.0)                # nothing to clear: no size
    scale, size = goal_size(goal)
    assert size is None
    peak = peak_payload(goal)['peak']
    assert peak['unmeasured'] is True
    assert peak['band'] is None and peak['mountain'] is None


def test_the_band_watermark_reads_the_same_size(seeded):
    user = UserFactory()
    goal, _ = _saving(user.id, '0.00', '16000.00', 100.0)
    raise_hardest_band(goal)
    _db.session.commit()
    assert goal.hardest_band == peak_payload(goal)['peak']['band'] == 4


def test_THE_ROUTE_SENDS_SIZE_AND_PROGRESS(seeded, client, auth_headers):
    user = UserFactory(password_plain='testpassword')
    goal, _ = _saving(user.id, '0.00', '2000.00', 650.0)
    resp = client.get('/api/v1/goals', headers=auth_headers(user))
    assert resp.status_code == 200
    sent = next(g for g in resp.get_json()['goals'] if g['id'] == goal.id)
    assert sent['peak']['size'] == 2000.0
    assert sent['peak']['mountain']['name'] == 'Mount Fuji'
    assert round(sent['progress'], 3) == 0.325
