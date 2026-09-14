"""*** NO CLIENT MAY BE ABLE TO RECONSTRUCT A DENOMINATOR. ***

Design decision 5: *no denominator unless the user chose the target.* Six were
live on 2026-09-13 — `16 of 19` twice on the learnPal home, `band 4 of 6`,
`16 of 19 lessons read` on the goals banner, `4 of 4 · nothing more here` on
every goal card, and `16 of 19 unlocked` on mobile.

Removing them from the VIEW is not enough. A count still on the payload is one
render away from coming back, and the next person to add a progress bar will
reach for whatever the API already sends. So the fields left the wire, and this
is what stops them returning.

*** MONEY TOTALS ARE NOT DENOMINATORS AND MUST SURVIVE. *** *"What's costing you
$13.33"* and *"the ground: $1,588"* are sums of money, not counts of things
finPal chose. The allowlist below is explicit about which is which, so this
guard cannot be satisfied by deleting a figure the product needs.
"""

import pytest

from src.extensions import db as _db
from src.models.goal import Goal
from src.modules.learnpal.range import range_for_user
from src.modules.learnpal.seed import seed_milestones
from src.modules.learnpal.stats import stats_for_user
from tests.factories import AccountFactory, UserFactory

# Paths where a key called `total` is a sum of MONEY and is correct.
MONEY_TOTALS = {
    ('cost', 'total'),
    ('build', 'total'),
    ('ground', 'total'),
}


@pytest.fixture
def learner(db):
    seed_milestones()
    user = UserFactory(id='counted@test.com', name='Counted')
    acct = AccountFactory(user_id=user.id, name='Visa', type='credit',
                          balance=-800.0)
    _db.session.commit()
    acct.apr = 19.99
    _db.session.add(Goal(user_id=user.id, name='Pay it off', start_amount=-800,
                         target_amount=0, status='active', account_id=acct.id))
    _db.session.commit()
    return user


def _counts(node, path=()):
    """Every `total`-ish key in a payload, with the path that reached it."""
    found = []
    if isinstance(node, dict):
        for key, value in node.items():
            here = path + (key,)
            if key in ('total', 'band_total', 'of_total', 'max') \
                    and here[-2:] not in MONEY_TOTALS:
                found.append(('.'.join(here), value))
            found.extend(_counts(value, here))
    elif isinstance(node, list):
        for item in node:
            found.extend(_counts(item, path))
    return found


def test_the_range_payload_carries_no_denominator(learner):
    offenders = _counts(range_for_user(learner.id))
    assert offenders == [], (
        f'these are on the range payload: {offenders}. A client can render '
        '"n of m" from any of them. Money totals are allowlisted in '
        'MONEY_TOTALS; a COUNT of things finPal chose is not allowed at all.')


def test_the_stats_payload_carries_no_denominator(learner):
    offenders = _counts(stats_for_user(learner.id))
    assert offenders == [], (
        f'these are on the stats payload: {offenders}.')


def test_the_money_totals_ARE_still_there(learner):
    """*** THE CONTROL. *** Without this, the guard above is satisfied by
    deleting figures the product needs, and nobody would notice for a release."""
    payload = range_for_user(learner.id)
    assert 'total' in payload['cost']
    assert 'total' in payload['build']
    assert 'total' in payload['ground']


def test_the_strip_says_WHETHER_there_are_lessons_without_saying_how_many(learner):
    strip = range_for_user(learner.id)['cost']['peaks'][0]['strip']
    assert strip['has_lessons'] is True
    assert isinstance(strip['has_lessons'], bool), (
        'has_lessons must be a boolean. A count here is a denominator wearing '
        'a different name.')
    assert 'total' not in strip
