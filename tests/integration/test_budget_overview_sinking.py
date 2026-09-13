"""The sinking fund reaches the client, and the group total agrees with it.

*** ASSERTED ON THE PAYLOAD, NOT ON THE SERVICE. *** `monthly_set_aside` has its
own unit tests in `test_sinking_fund.py`; this is the other half. A function can
be correct and unreachable -- D-187's whole shape, where `evaluate_for_goal` was
right and had no callers at all.

*** AND THE TOTAL IS ASSERTED BESIDE THE ROW, NOT INSTEAD OF IT. *** The row
says "set aside 50 a month" while the group's `planned` is what the page adds up.
If those two disagree the page states a figure and then contradicts it one line
higher, which is D-102's shape -- a caption saying net worth rose 43% above a
line that fell.
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
    return UserFactory(id='sink@test.com', name='Sink')


def _budget(user, name, amount, period, spending_type):
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


def _group(data, spending_type):
    return next(g for g in data['groups'] if g['spending_type'] == spending_type)


def test_A_YEARLY_NON_MONTHLY_BUDGET_CARRIES_ITS_MONTHLY_SET_ASIDE(
        client, auth_headers, user):
    _budget(user, 'Car tax', '600.00', 'yearly', 'non_monthly')

    row = _group(_overview(client, auth_headers, user), 'non_monthly')['budgets'][0]

    assert row['is_sinking_fund'] is True
    assert float(row['monthly_set_aside']) == 50.0
    # *** THE ANNUAL FIGURE IS STILL THERE, UNTOUCHED. *** The set-aside is an
    # addition to the row, not a replacement for what the user typed -- the page
    # shows both, and a client on an older build renders `amount` as it always
    # did.
    assert float(row['amount']) == 600.0


def test_THE_GROUP_TOTAL_COUNTS_THE_MONTH_NOT_THE_WHOLE_BILL(
        client, auth_headers, user):
    """*** THE POINT OF THE WHOLE CHANGE. *** A 600 car tax compared against one
    month is why Non-Monthly always read as an overspend."""
    _budget(user, 'Car tax', '600.00', 'yearly', 'non_monthly')

    data = _overview(client, auth_headers, user)

    assert float(_group(data, 'non_monthly')['planned']) == 50.0
    # And the page-level total is built from the same figure, so the header and
    # the section cannot disagree.
    assert float(data['totals']['planned']) == 50.0


def test_A_MONTHLY_NON_MONTHLY_BUDGET_IS_LEFT_EXACTLY_ALONE(
        client, auth_headers, user):
    """*** THE ONE THAT PROTECTS EVERY ROW ALREADY IN A DATABASE. ***

    Nothing in the data distinguishes an annual figure from a monthly one, so
    reinterpreting `amount` would be D-178's failure with real money attached.
    `period='yearly'` is the carrier, and every Non-Monthly budget typed before
    2026-09-13 has `period='monthly'` and keeps meaning what its author meant.
    """
    _budget(user, 'Gifts', '600.00', 'monthly', 'non_monthly')

    data = _overview(client, auth_headers, user)
    row = _group(data, 'non_monthly')['budgets'][0]

    assert row['is_sinking_fund'] is False
    assert 'monthly_set_aside' not in row
    assert float(_group(data, 'non_monthly')['planned']) == 600.0


def test_A_YEARLY_FLEXIBLE_BUDGET_IS_NOT_A_SINKING_FUND(
        client, auth_headers, user):
    """*** BOTH CONDITIONS, NOT EITHER. *** A yearly budget on a flexible
    category is still a yearly budget, not a fund you draw down."""
    _budget(user, 'Insurance', '600.00', 'yearly', 'flexible')

    data = _overview(client, auth_headers, user)
    row = _group(data, 'flexible')['budgets'][0]

    assert row['is_sinking_fund'] is False
    assert float(_group(data, 'flexible')['planned']) == 600.0
