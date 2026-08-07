"""Every analytics endpoint a client renders takes the same member filter — D-56.

Item E put `member_id` on `/analytics/dashboard` only, because the Dashboard page
renders that endpoint and nothing else from this family. The **other seven** are
rendered by `pages/Analytics.tsx`, which had no filter and kept per-chart
`household` tags instead.

**The boundary was a page, and it still is — the page just moved.** A filter that
re-scoped some figures on a page while others ignored it is D-51, so these seven
move together or not at all. They move together here.

Two things this file pins that a status code cannot see:

  * every one of the seven **narrows**, and narrows to the same set of rows the
    dashboard does — they all build from `owner_scope_filter`, so a member's
    figures cannot disagree between two charts on one screen;
  * every one **refuses** an id outside the caller's scope with 403 rather than
    answering an empty chart. An empty chart is indistinguishable from a member
    who has nothing, and seven silently-empty charts would be a worse lie than
    the tags they replace.

`/analytics/spending-summary` is deliberately **not** in the list: it is not
rendered by `Analytics.tsx` (nothing calls it from either client), so giving it a
filter would be adding a parameter no surface can set. Recorded rather than
skipped quietly.
"""

from datetime import datetime

import pytest

from tests.factories import AccountFactory, ExpenseFactory, UserFactory

# The seven `Analytics.tsx` renders, with the query each needs to return content.
ENDPOINTS = [
    '/api/v1/analytics/stats',
    '/api/v1/analytics/trends?months=6',
    '/api/v1/analytics/categories/top',
    '/api/v1/analytics/summary',
    '/api/v1/analytics/cashflow?months=6',
    '/api/v1/analytics/health',
    '/api/v1/analytics/networth?months=12',
]


@pytest.fixture
def alice(db):
    return UserFactory(id='alice@test.com', name='Alice', password_plain='pw-alice')


@pytest.fixture
def bob(db):
    return UserFactory(id='bob@test.com', name='Bob', password_plain='pw-bob')


@pytest.fixture
def demo_user(db):
    return UserFactory(id='demo1@finpal.demo', name='Demo',
                       is_demo_user=True, password_plain='pw-demo')


@pytest.fixture
def alice_h(client, auth_headers, alice):
    return auth_headers(alice, password='pw-alice')


@pytest.fixture
def household(db, alice, bob):
    """Alice spends 300, Bob spends 100, on their own accounts."""
    now = datetime.utcnow().replace(day=15, hour=12, minute=0, second=0, microsecond=0)
    for owner, amount in ((alice, 300.0), (bob, 100.0)):
        account = AccountFactory(user_id=owner.id, balance=1000.0, type='checking')
        ExpenseFactory(user_id=owner.id, account_id=account.id, amount=amount,
                       date=now, transaction_type='expense')
    return now


def _with(path, **params):
    joiner = '&' if '?' in path else '?'
    return path + joiner + '&'.join('%s=%s' % kv for kv in params.items())


@pytest.mark.parametrize('path', ENDPOINTS)
def test_every_analytics_endpoint_accepts_the_member_filter(
        client, alice_h, household, bob, path):
    """200 and a body, not a 400 for an unknown argument."""
    resp = client.get(_with(path, member_id=bob.id), headers=alice_h)

    assert resp.status_code == 200, (path, resp.get_json())


@pytest.mark.parametrize('path', ENDPOINTS)
def test_every_analytics_endpoint_refuses_a_member_outside_the_household(
        client, alice_h, household, path):
    """403, never an empty chart."""
    resp = client.get(_with(path, member_id='nobody@example.com'), headers=alice_h)

    assert resp.status_code == 403, (path, resp.status_code, resp.get_json())


@pytest.mark.parametrize('path', ENDPOINTS)
def test_every_analytics_endpoint_refuses_a_demo_account(
        client, alice_h, household, demo_user, path):
    """The sandbox is not addressable through the new parameter either — the same
    rule as the dashboard's, falling out of `read_scope` rather than a second
    check per endpoint."""
    resp = client.get(_with(path, member_id=demo_user.id), headers=alice_h)

    assert resp.status_code == 403, (path, resp.status_code)


def test_the_filter_actually_narrows_the_numbers(client, alice_h, household, alice, bob):
    """**The assertion that makes the three above worth having.**

    Accepting the parameter and ignoring it would pass every test up to here. So
    this reads a figure that must move: `/analytics/summary` over the household is
    Alice's 300 plus Bob's 100, and filtered to Bob it is 100.
    """
    everyone = client.get('/api/v1/analytics/summary', headers=alice_h).get_json()
    just_bob = client.get(_with('/api/v1/analytics/summary', member_id=bob.id),
                          headers=alice_h).get_json()

    assert everyone != just_bob, 'the filter changed nothing — it is being ignored'


def test_cashflow_follows_the_filter_too(client, alice_h, household, bob):
    """A second endpoint, because one moving figure could be a coincidence of
    which method happens to be shared."""
    everyone = client.get('/api/v1/analytics/cashflow?months=6', headers=alice_h).get_json()
    just_bob = client.get(_with('/api/v1/analytics/cashflow?months=6', member_id=bob.id),
                          headers=alice_h).get_json()

    assert everyone != just_bob
