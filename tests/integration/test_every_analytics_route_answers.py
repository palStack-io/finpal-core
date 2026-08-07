"""Every analytics route the app registers actually answers — AUDIT D-59.

**Written because a list-keyed test let a live 500 through.**
`test_analytics_member_filter_everywhere.py` enumerates the seven endpoints
`Analytics.tsx` renders and checks each one. `/analytics/monthly-comparison` is
an eighth — rendered by *both* clients — and it was not in that list. D-56 added
`scope_ids=scope_ids` to its service call and never added the line that resolves
`scope_ids`, so the handler raised `NameError` on every request. CI was green
because nothing hit it, and it was found by curling the deploy after release.

A list of endpoints is a list of the ones somebody remembered. **This is derived
from `app.url_map`**, so a route added tomorrow is covered the day it exists, and
the only way to escape it is to delete a route.

It asserts *no 5xx*, deliberately, rather than an exact status. A 400 for a
missing required argument is a real answer; a 500 is the handler falling over,
and that is the class of failure a route inventory can actually police. Each
route is also called **with `member_id`**, because the defect was in the code
path that parameter turns on — calling them bare would have passed.
"""

import pytest

from tests.factories import AccountFactory, ExpenseFactory, UserFactory


@pytest.fixture
def alice(db):
    return UserFactory(id='alice@test.com', name='Alice', password_plain='pw-alice')


@pytest.fixture
def alice_h(client, auth_headers, alice):
    return auth_headers(alice, password='pw-alice')


@pytest.fixture
def some_money(db, alice):
    from datetime import datetime
    account = AccountFactory(user_id=alice.id, balance=1000.0, type='checking')
    ExpenseFactory(user_id=alice.id, account_id=account.id, amount=250.0,
                   date=datetime.utcnow(), transaction_type='expense')
    return account


def _analytics_routes(app):
    """Every GET rule under /api/v1/analytics that takes no path parameters.

    From the routing table rather than a literal list — that is the whole point
    of the file. Rules with converters are excluded because inventing an id would
    be testing the fixture, not the route.
    """
    seen = set()
    for rule in app.url_map.iter_rules():
        path = str(rule)
        if not path.startswith('/api/v1/analytics'):
            continue
        if 'GET' not in (rule.methods or set()) or '<' in path:
            continue
        seen.add(path)
    return sorted(seen)


def test_the_inventory_finds_the_routes_it_is_meant_to_check(app):
    """Without this the parametrised test below could pass on an empty list —
    the vacuous-check failure mode, which this project has hit repeatedly."""
    routes = _analytics_routes(app)

    assert len(routes) >= 8, routes
    assert '/api/v1/analytics/monthly-comparison' in routes, (
        'the route that started this is missing from the inventory: %s' % routes)


def test_no_analytics_route_500s_with_a_member_filter(client, app, alice_h, alice, some_money):
    """The assertion itself, over every route at once.

    Parametrising would read better; it is written as one test on purpose so the
    failure message lists **every** broken route rather than the first, which is
    what you want from an inventory when a shared helper has just changed.
    """
    broken = []
    for path in _analytics_routes(app):
        for query in ('', '?member_id=alice@test.com'):
            resp = client.get(path + query, headers=alice_h)
            if resp.status_code >= 500:
                broken.append('%s%s -> %s' % (path, query, resp.status_code))

    assert not broken, (
        'these analytics routes fall over rather than answering: %s' % '; '.join(broken))
