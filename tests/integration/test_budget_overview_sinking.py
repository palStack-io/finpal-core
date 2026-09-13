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

from datetime import datetime, timedelta
from decimal import Decimal

import pytest

from src.extensions import db as _db
from src.models.budget import Budget
from src.models.category import Category
from src.models.transaction import Expense
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
    return b, cat


def _spend(user, category, amount, when):
    """One real expense, because a fixture with none cannot tell two spans apart."""
    e = Expense(description='car tax', amount=Decimal(amount), date=when,
                card_used='card', split_method='equal', paid_by=user.id,
                user_id=user.id, category_id=category.id,
                transaction_type='expense')
    _db.session.add(e)
    _db.session.commit()
    return e


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


# ---------------------------------------------------------------------------
# The two spans, and the only test that can tell them apart
# ---------------------------------------------------------------------------

def _earlier_this_year_but_not_this_month(today):
    """A date in this calendar year that is NOT in this calendar month.

    January has no earlier month, so it borrows a LATER one instead — still this
    year, still outside this month, which is all the test needs. A fixture that
    quietly fell back to "this month" in January would make the whole file
    vacuous for one month a year, and nobody would be looking in January.
    """
    if today.month == 1:
        return today.replace(month=2, day=15)
    return today.replace(month=today.month - 1, day=15)


def test_THE_ROW_IS_THE_YEAR_AND_THE_GROUP_IS_THE_MONTH_AND_BOTH_SAY_SO(
        client, auth_headers, user):
    """*** THE FIGURES HAVE TO AGREE WITHIN EACH SPAN, NOT ACROSS THEM. ***

    `spent` on a yearly budget is the CALENDAR YEAR TO DATE — that is
    `get_current_period_dates`, not a choice made here — so the row reads
    "£X of £600 for the year" and `remaining` and `percentage` follow from it.

    The GROUP is a month: planned is one twelfth. Summing the YEAR's spending
    into that group would subtract a year from a month and call the difference
    "remaining", which is D-102's shape — a number and a caption describing
    different things.

    The earlier fixture here had no transactions at all, so `spent` was 0
    everywhere and every figure agreed trivially. That is the inverse of D-107:
    a fixture gentler than reality hides the defect rather than inventing one.
    """
    budget, cat = _budget(user, 'Car tax', '600.00', 'yearly', 'non_monthly')
    today = datetime.utcnow()
    _spend(user, cat, '400.00', _earlier_this_year_but_not_this_month(today))
    _spend(user, cat, '30.00', today)

    data = _overview(client, auth_headers, user)
    row = _group(data, 'non_monthly')['budgets'][0]
    group = _group(data, 'non_monthly')

    # THE ROW — every figure on it is the year's.
    assert float(row['spent']) == 430.0
    assert float(row['amount']) == 600.0
    assert float(row['remaining']) == 170.0
    assert round(float(row['percentage'])) == 72       # 430/600

    # THE GROUP — every figure on it is this month's.
    assert float(group['planned']) == 50.0
    assert float(group['actual']) == 30.0
    assert float(group['remaining']) == 20.0
    # and the page-level total is built from the same month, not from the year
    assert float(data['totals']['planned']) == 50.0
    assert float(data['totals']['actual']) == 30.0


def test_AN_ORDINARY_ROW_STILL_CONTRIBUTES_ITS_OWN_SPENT(client, auth_headers, user):
    """*** THE SABOTAGE GUARD. *** Reading `month_spent` for every row, rather
    than only for a sinking fund, would pass the test above and break every
    monthly budget on the page — the failure would land on the common case while
    the special case stayed green."""
    budget, cat = _budget(user, 'Groceries', '500.00', 'monthly', 'flexible')
    today = datetime.utcnow()
    _spend(user, cat, '120.00', today)

    group = _group(_overview(client, auth_headers, user), 'flexible')

    assert float(group['actual']) == 120.0
    assert 'month_spent' not in group['budgets'][0]
