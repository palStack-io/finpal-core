"""The sinking-fund figure: what arrives once a year, divided by twelve.

*** THE ONE CALCULATION IN GOALS THAT IS ALLOWED TO NAME A NUMBER. ***
`buffer_picture` offers three months and six and refuses to choose, because
the right size of an emergency fund depends on job security and dependants.
A sinking fund has no judgement in it — the annual total is observed and the
divisor is twelve — so stating the twelfth is arithmetic, not advice.

Every assertion below is on the PAYLOAD, never on a status code.
"""
from datetime import datetime, timedelta
from decimal import Decimal

from src.extensions import db as _db
from src.models.category import Category
from src.models.transaction import Expense
from src.services.goal.sinking import LOOKBACK_MONTHS, sinking_picture
from tests.factories import UserFactory, AccountFactory

URL = '/api/v1/goals/sinking-picture'


def _category(user_id, name, spending_type):
    category = Category(user_id=user_id, name=name, spending_type=spending_type)
    _db.session.add(category)
    _db.session.commit()
    return category


def _spend(user, account, category, amount, days_ago):
    # `card_used`, `split_method` and `paid_by` are NOT NULL and the factory
    # supplies them; building the row by hand means supplying them here.
    row = Expense(user_id=user.id, account_id=account.id, category_id=category.id,
                  description=f'{category.name} {days_ago}',
                  amount=Decimal(str(amount)), transaction_type='expense',
                  date=datetime.utcnow() - timedelta(days=days_ago),
                  currency_code='USD', card_used='Test Card',
                  split_method='none', paid_by=user.id)
    _db.session.add(row)
    _db.session.commit()
    return row


def test_nothing_classified_non_monthly_is_None_not_zero(db):
    """*** FAIL CLOSED. *** "Set aside $0.00 a month" is a sentence finPal
    cannot justify, and a zero target would render a calculator that looks
    authoritative and says nothing."""
    user = UserFactory()
    account = AccountFactory(user_id=user.id)
    flexible = _category(user.id, 'Going out', 'flexible')
    _spend(user, account, flexible, 60, days_ago=40)

    assert sinking_picture(user.id) is None


def test_classified_but_no_spending_is_also_None(db):
    """A category with the right label and nothing in it is still nothing."""
    user = UserFactory()
    _category(user.id, 'Car tax', 'non_monthly')
    assert sinking_picture(user.id) is None


def test_the_twelfth_is_the_annual_total_divided_by_twelve(db):
    user = UserFactory()
    account = AccountFactory(user_id=user.id)
    annual = _category(user.id, 'Car tax', 'non_monthly')
    _spend(user, account, annual, 180, days_ago=200)
    _spend(user, account, annual, 120, days_ago=90)

    picture = sinking_picture(user.id)

    assert picture['annual'] == 300.0
    assert picture['monthly'] == 25.0
    assert picture['months_counted'] == LOOKBACK_MONTHS


def test_the_twelfth_ROUNDS_UP(db):
    """*** NEVER DOWN. *** Same rule as `monthly_contribution`: a twelfth
    rounded down is short by December, and a plan that quietly misses is worse
    than one that asks for a penny more. 100/12 is 8.333...; the answer is
    8.34, not 8.33."""
    user = UserFactory()
    account = AccountFactory(user_id=user.id)
    annual = _category(user.id, 'Renewals', 'non_monthly')
    _spend(user, account, annual, 100, days_ago=60)

    assert sinking_picture(user.id)['monthly'] == 8.34


def test_only_NON_MONTHLY_categories_count(db):
    """*** THE WHOLE POINT IS THE THING THAT DOES NOT ARRIVE MONTHLY. ***
    Folding in fixed or flexible spending would make the twelfth a fraction of
    everything, which is a different and useless number."""
    user = UserFactory()
    account = AccountFactory(user_id=user.id)
    annual = _category(user.id, 'Car tax', 'non_monthly')
    rent = _category(user.id, 'Rent', 'fixed')
    _spend(user, account, annual, 240, days_ago=100)
    _spend(user, account, rent, 9000, days_ago=100)

    assert sinking_picture(user.id)['annual'] == 240.0


def test_spending_older_than_the_window_is_not_counted(db):
    """*** THE FIXTURE STRADDLES THE BOUNDARY ON PURPOSE. *** A window test
    whose rows are all inside it passes whatever the window is — the hole that
    let three sabotages through earlier in this work."""
    user = UserFactory()
    account = AccountFactory(user_id=user.id)
    annual = _category(user.id, 'Car tax', 'non_monthly')
    _spend(user, account, annual, 300, days_ago=30)     # inside
    _spend(user, account, annual, 999, days_ago=800)    # two years ago

    assert sinking_picture(user.id)['annual'] == 300.0


def test_the_endpoint_answers_with_the_picture_under_its_own_key(client, db, auth_headers):
    user = UserFactory()
    account = AccountFactory(user_id=user.id)
    annual = _category(user.id, 'Car tax', 'non_monthly')
    _spend(user, account, annual, 600, days_ago=120)

    body = client.get(URL, headers=auth_headers(user)).get_json()

    assert body['success'] is True
    assert body['sinking']['annual'] == 600.0
    assert body['sinking']['monthly'] == 50.0
    # D-278: a money figure travels with the code it is in.
    assert body['sinking']['currency_code']


def test_the_endpoint_sends_null_rather_than_an_empty_object(client, db, auth_headers):
    """A client distinguishes "finPal cannot say" from "the answer is zero"
    only if the null survives the envelope."""
    user = UserFactory()
    body = client.get(URL, headers=auth_headers(user)).get_json()
    assert body['sinking'] is None
