"""D-189: a budget on an income category was summed as planned SPENDING.

*** MEASURED ON THE LIVE DEMO BEFORE ANY CODE WAS WRITTEN. *** `POST /budgets`
on *Salary* answered 201, landed in `unsorted`, and took `totals.planned` from
1,400.00 to **5,900.00** with `remaining` at **5,554.46** — the page told the
user they had £4,500 of unearned money left to spend. `left_to_budget`
(`income − planned`) then subtracted the same row FROM income, so one row was
wrong twice, in opposite directions.

The fix is a `Category.kind` column, because finPal genuinely could not tell:
income and expense live on the TRANSACTION, and the seeded "Income" tree is a
naming convention a user can rename.
"""

from datetime import datetime
from decimal import Decimal

import pytest

from src.extensions import db as _db
from src.models.budget import Budget
from src.models.category import Category
from src.services.category.kind import backfill_category_kind, kind_for_seeded
from tests.factories import UserFactory

ENDPOINT = '/api/v1/budgets/overview'


@pytest.fixture
def user(db):
    return UserFactory(id='kind@test.com', name='Kind')


def _cat(user, name, kind=None, spending_type='flexible'):
    c = Category(user_id=user.id, name=name, spending_type=spending_type)
    c.kind = kind
    _db.session.add(c)
    _db.session.commit()
    return c


def _budget(user, cat, amount):
    b = Budget(user_id=user.id, category_id=cat.id, name=cat.name,
               amount=Decimal(amount), period='monthly', active=True,
               start_date=datetime.utcnow())
    _db.session.add(b)
    _db.session.commit()
    return b


def _overview(client, auth_headers, user):
    r = client.get(ENDPOINT, headers=auth_headers(user))
    assert r.status_code == 200, r.get_json()
    return r.get_json()


# ---------------------------------------------------------------------------
# The defect itself
# ---------------------------------------------------------------------------

def test_AN_INCOME_BUDGET_IS_NOT_COUNTED_AS_PLANNED_SPENDING(
        client, auth_headers, user):
    """The exact shape measured on the demo: £1,400 of expenses and a £4,500
    salary budget. Before the fix `totals.planned` read 5,900."""
    _budget(user, _cat(user, 'Groceries', kind='expense'), '1400.00')
    _budget(user, _cat(user, 'Salary', kind='income'), '4500.00')

    data = _overview(client, auth_headers, user)
    assert data['totals']['planned'] == 1400.00, \
        'the salary was summed as planned spending'
    assert data['totals']['remaining'] == 1400.00


def test_the_income_budget_gets_its_OWN_section_with_its_own_columns(
        client, auth_headers, user):
    """*** "REMAINING" MEANS DIFFERENT THINGS ON THE TWO SIDES. *** On an
    expense it is *still available to spend*; on income it is *still to
    arrive*. One figure answering two questions is D-102's shape."""
    _budget(user, _cat(user, 'Salary', kind='income'), '4500.00')

    section = _overview(client, auth_headers, user)['income_section']
    assert section['planned'] == 4500.00
    assert section['still_to_come'] == 4500.00
    assert len(section['budgets']) == 1


def test_AN_INCOME_BUDGET_DOES_NOT_FALL_INTO_unsorted(client, auth_headers, user):
    """That is where it went before, and `unsorted` feeds `totals.planned`."""
    _budget(user, _cat(user, 'Salary', kind='income'), '4500.00')
    data = _overview(client, auth_headers, user)
    assert data['unsorted']['budget_count'] == 0
    for group in data['groups']:
        assert group['budgets'] == [], group['spending_type']


def test_A_NULL_KIND_IS_TREATED_AS_EXPENSE_AND_NEVER_LABELLED_ONE(
        client, auth_headers, user):
    """*** NOT STATED IS A REAL STATE. *** The totals have to put it somewhere,
    and expense is the safe direction — but the payload must not CLAIM the user
    said so, or the client would render a fact nobody stated."""
    _budget(user, _cat(user, 'Consulting', kind=None), '900.00')
    data = _overview(client, auth_headers, user)
    assert data['totals']['planned'] == 900.00, 'an unstated kind vanished'
    assert data['income_section']['planned'] == 0.0


# ---------------------------------------------------------------------------
# The backfill
# ---------------------------------------------------------------------------

def test_THE_BACKFILL_KEYS_ON_THE_SEEDER_TABLE_NOT_ON_A_STRING_MATCH(app):
    """*** THE RULE THAT KEEPS THIS HONEST IN ANY LOCALE. *** `DEFAULT_CATEGORIES`
    is finPal's own record of what it seeded, so reading it is reading our own
    data. Matching the WORD "income" against a name would be matching a
    user-editable string — D-191's account-type inference refuses exactly that,
    and D-189 rejected it when it was first designed."""
    assert kind_for_seeded('Income') == 'income'
    assert kind_for_seeded('Salary') == 'income'
    assert kind_for_seeded('Refunds') == 'income'
    assert kind_for_seeded('Housing') == 'expense'
    # A user's own category is NOT guessed at, however income-ish it sounds.
    assert kind_for_seeded('Consulting income') is None
    assert kind_for_seeded('My Salary') is None


def test_the_backfill_stamps_seeded_rows_and_leaves_a_users_own_alone(user, app):
    _cat(user, 'Salary', kind=None)
    _cat(user, 'Housing', kind=None)
    mine = _cat(user, 'Consulting', kind=None)

    assert backfill_category_kind() == 2
    _db.session.refresh(mine)
    kinds = {c.name: c.kind for c in Category.query.filter_by(user_id=user.id)}
    assert kinds['Salary'] == 'income'
    assert kinds['Housing'] == 'expense'
    assert kinds['Consulting'] is None, "a user's own category was guessed at"


def test_THE_BACKFILL_IS_IDEMPOTENT_AND_NEVER_OVERWRITES_A_SET_VALUE(user, app):
    """Run twice — the half of D-178 that gets missed. And a user who decides
    their "Salary" category is actually an expense keeps that."""
    c = _cat(user, 'Salary', kind=None)
    assert backfill_category_kind() == 1

    c.kind = 'expense'          # the user disagrees, deliberately
    _db.session.commit()

    assert backfill_category_kind() == 0, 'the second pass wrote again'
    _db.session.refresh(c)
    assert c.kind == 'expense', 'the backfill overwrote a value the user set'
