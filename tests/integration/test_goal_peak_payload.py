"""The `peak` block a goal carries, and the three states that must not collapse.

*** THE SERVER DECIDES THE MOUNTAIN; THE CLIENT DECIDES THE PIXELS. *** The band
comes from a seeded table and the magnitude from balances and APRs, neither of
which a client holds -- the same reason `_serialize` computes `progress`,
`direction` and `current_amount`. So these assert on the PAYLOAD a real request
returns, not on the helper in isolation: every bug this project has found
returned 200 and rendered fine.
"""

from decimal import Decimal

import pytest

from src.extensions import db as _db
from src.models.goal import Goal
from src.data.seed_mountains import seed_mountains
from src.services.goal.peak import peak_payload
from tests.factories import UserFactory, AccountFactory


@pytest.fixture
def seeded(db):
    seed_mountains()


def _card(user_id, balance=-800.0, apr='19.99', name='Visa'):
    account = AccountFactory(user_id=user_id, name=name, type='credit', balance=balance)
    if apr is not None:
        account.apr = Decimal(apr)
    _db.session.commit()
    return account


def _payoff(user_id, accounts, target='0.00'):
    goal = Goal(user_id=user_id, name='Pay off the Visa', kind='payoff',
                start_amount=Decimal('-1650.00'), target_amount=Decimal(target),
                account_id=accounts[0].id, currency_code='USD')
    _db.session.add(goal)
    _db.session.commit()
    return goal


def _peak(goal):
    return peak_payload(goal)['peak']


# ---------------------------------------------------------------------------
# The three states that must never look alike
# ---------------------------------------------------------------------------

def test_a_stated_rate_is_measured_and_names_a_mountain(seeded):
    user = UserFactory()
    goal = _payoff(user.id, [_card(user.id)])
    peak = _peak(goal)

    assert peak['scale'] == 'cost'
    assert peak['unmeasured'] is False
    # 800 owed at 19.99% -> 13.33 a month.
    assert round(peak['magnitude'], 2) == 13.33
    assert peak['band'] == 1
    assert peak['mountain']['name'] == 'Ben Nevis'
    assert peak['mountain']['elevation_m'] == 1345


def test_NO_RATE_ANYWHERE_IS_UNMEASURED_AND_NOT_BAND_ZERO(seeded):
    """*** A MISSING APR MUST NOT DRAW A MOLEHILL. ***

    "We do not know your rate" and "this is small" are different answers, and
    answering Table Mountain for the first is trap 3 in the design -- D-77 and
    D-108 are what that looks like when it ships. `band` must be None, NOT 0.
    """
    user = UserFactory()
    goal = _payoff(user.id, [_card(user.id, apr=None)])
    peak = _peak(goal)

    assert peak['unmeasured'] is True
    assert peak['magnitude'] is None
    assert peak['band'] is None, 'an unmeasured peak must not be band 0'
    assert peak['mountain'] is None
    assert peak['apr'] is None


def test_AN_EXPLICIT_ZERO_PERCENT_IS_MEASURED_AND_MEASURES_ZERO(seeded):
    """*** 0% IS A STATED RATE. *** A balance-transfer card is common, and
    "this costs you nothing" is the most encouraging thing the card can say. It
    is measured, it gets a mountain, and it is NOT the unmeasured state.
    """
    user = UserFactory()
    goal = _payoff(user.id, [_card(user.id, apr='0')])
    peak = _peak(goal)

    assert peak['unmeasured'] is False
    assert peak['magnitude'] == 0
    assert peak['band'] == 0
    assert peak['mountain']['name'] == 'Table Mountain'
    assert peak['apr'] == 0.0


# ---------------------------------------------------------------------------
# One APR is only ever true of a one-account goal
# ---------------------------------------------------------------------------

def test_a_single_account_goal_sends_its_apr(seeded):
    user = UserFactory()
    goal = _payoff(user.id, [_card(user.id, apr='19.99')])
    assert _peak(goal)['apr'] == 19.99


def test_A_MULTI_ACCOUNT_GOAL_SENDS_NO_APR_AT_ALL(seeded):
    """*** NOT THE FIRST RATE, AND NOT AN AVERAGE. ***

    `_account_name` answers "2 accounts" rather than naming one card out of two,
    and a rate is worse to get wrong than a name: printing "19.99% APR" under a
    goal spanning two cards at two rates states something true of neither. An
    average would be worse still -- a number the user cannot check against any
    statement they hold.
    """
    user = UserFactory()
    a = _card(user.id, apr='19.99', name='Visa')
    b = _card(user.id, apr='24.99', name='Amex')
    goal = _payoff(user.id, [a])
    # *** BOTH LINKS, AND THE FIRST VERSION OF THIS TEST ONLY MADE ONE. ***
    # `peak_accounts` prefers `goal.links` whenever it is non-empty, so linking
    # only the second account made this a ONE-account goal reading the wrong
    # card -- it reported 24.99 and its magnitude assertion passed for the wrong
    # reason too. The `apr` assertion is what exposed that.
    from src.models.goal_account import GoalAccount
    for account in (a, b):
        _db.session.add(GoalAccount(goal_id=goal.id, account_id=account.id,
                                    start_amount=Decimal(str(account.balance))))
    _db.session.commit()
    _db.session.refresh(goal)

    assert len(goal.links) == 2, 'the fixture did not actually span two accounts'

    peak = _peak(goal)
    assert peak['apr'] is None
    # The MAGNITUDE still counts BOTH, which is the point of the distinction:
    # the arithmetic sums fine, only the single label would be false.
    # 800 at 19.99% (13.33) + 800 at 24.99% (16.66).
    assert round(peak['magnitude'], 2) == 29.99


# ---------------------------------------------------------------------------
# The watermark
# ---------------------------------------------------------------------------

def test_THE_SUMMIT_NOTE_READS_THE_WATERMARK_NOT_THE_CURRENT_BAND(seeded):
    """*** THE MOUNTAIN SHRINKS AS THE GOAL SUCCEEDS. ***

    The band is recomputed from the CURRENT figure, so paying a card down walks
    it back down the ladder and finishing lands on the SMALLEST mountain. Without
    a watermark the card congratulates somebody on Table Mountain for clearing an
    Aconcagua.
    """
    user = UserFactory()
    goal = _payoff(user.id, [_card(user.id, balance=-40.0, apr='19.99')])
    goal.hardest_band = 4
    _db.session.commit()

    peak = _peak(goal)
    # Nearly paid off, so it sits low NOW...
    assert peak['band'] == 0
    assert peak['mountain']['name'] == 'Table Mountain'
    # ...but the note has to name what they actually beat.
    assert peak['hardest_band'] == 4
    assert peak['hardest_mountain']['name'] == 'Aconcagua'


def test_no_watermark_sends_no_hardest_mountain_rather_than_guessing(seeded):
    user = UserFactory()
    goal = _payoff(user.id, [_card(user.id)])
    assert goal.hardest_band is None
    peak = _peak(goal)
    assert peak['hardest_band'] is None
    assert peak['hardest_mountain'] is None


def test_a_watermark_off_the_end_of_the_ladder_does_not_raise(seeded):
    user = UserFactory()
    goal = _payoff(user.id, [_card(user.id)])
    goal.hardest_band = 99
    _db.session.commit()
    assert _peak(goal)['hardest_mountain'] is None


# ---------------------------------------------------------------------------
# The build scale
# ---------------------------------------------------------------------------

def test_the_build_scale_is_never_unmeasured(seeded):
    """`target_amount` is NOT NULL, so distance remaining is always computable."""
    user = UserFactory()
    account = AccountFactory(user_id=user.id, name='Savings', type='savings',
                             balance=5000.0)
    _db.session.commit()
    goal = Goal(user_id=user.id, name='Emergency fund', kind='savings',
                start_amount=Decimal('3200.00'), target_amount=Decimal('16000.00'),
                account_id=account.id, currency_code='USD')
    _db.session.add(goal)
    _db.session.commit()

    peak = _peak(goal)
    assert peak['scale'] == 'build'
    assert peak['unmeasured'] is False
    assert peak['magnitude'] == 11000.0
    assert peak['mountain'] is not None


# ---------------------------------------------------------------------------
# Through the route, because a helper's own test is not proof of its adoption
# ---------------------------------------------------------------------------

def test_THE_ROUTE_ACTUALLY_SENDS_THE_PEAK(seeded, client, auth_headers):
    """D-106's lesson: a helper's test is not proof that anything calls it.

    Three screens once bypassed a helper while 494 tests stayed green, so this
    asserts on the payload a real GET returns.
    """
    user = UserFactory(password_plain='testpassword')
    goal = _payoff(user.id, [_card(user.id)])

    response = client.get('/api/v1/goals', headers=auth_headers(user))
    assert response.status_code == 200
    body = response.get_json()
    sent = next(g for g in body['goals'] if g['id'] == goal.id)

    assert 'peak' in sent, 'the serializer is not calling peak_payload'
    assert sent['peak']['mountain']['name'] == 'Ben Nevis'
    assert sent['peak']['band'] == 1
    assert sent['peak']['unmeasured'] is False
    # And it is JSON-safe: a Decimal here would 500 on encode.
    assert isinstance(sent['peak']['magnitude'], float)
