"""The emergency-fund calculator states the arithmetic and picks nothing.

*** THREE AND SIX MONTHS ARE CONVENTIONS, NOT FACTS. *** Which is right depends
on job security, dependants and health, none of which finPal knows. It offers
both with what each costs; the user chooses. The same line
`avalanche-vs-snowball` walks.
"""
from datetime import datetime, timedelta
from decimal import Decimal

from src.extensions import db as _db
from src.models.category import Category
from src.models.transaction import Expense
from src.services.goal.buffer import buffer_picture, monthly_contribution
from tests.factories import UserFactory, AccountFactory


def _last_month():
    first = datetime.utcnow().replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    return (first - timedelta(seconds=1)).replace(day=15, hour=12)


def _seed(db, essentials=2000.0, liquid=8000.0):
    user = UserFactory()
    AccountFactory(user_id=user.id, name='Checking', type='checking', balance=liquid)
    cat = Category(name='Rent', user_id=user.id, spending_type='fixed')
    _db.session.add(cat)
    _db.session.commit()
    _db.session.add(Expense(
        description='Rent', amount=essentials, date=_last_month(), user_id=user.id,
        paid_by=user.id, card_used='', split_method='none', category_id=cat.id,
        transaction_type='expense', currency_code='USD'))
    _db.session.commit()
    return user


def test_it_offers_both_conventions_and_recommends_neither(db):
    user = _seed(db)
    picture = buffer_picture(user.id, [user.id])

    assert picture['essential_monthly'] == 2000.0
    assert picture['held'] == 8000.0
    assert picture['months_covered'] == 4.0
    assert [t['months'] for t in picture['targets']] == [3, 6]
    # 3 months is already covered; 6 is not.
    by_months = {t['months']: t for t in picture['targets']}
    assert by_months[3]['target'] == 6000.0
    assert by_months[6]['target'] == 12000.0
    # *** NOT CLAMPED. *** "you are 2,000 past three months" is worth knowing,
    # and a 0 would read as "exactly enough", which is a different fact.
    assert by_months[3]['short_by'] == -2000.0
    assert by_months[6]['short_by'] == 4000.0


def test_NO_SPENDING_MEANS_NO_PICTURE_RATHER_THAN_A_ZERO_TARGET(db):
    """*** "YOU NEED $0.00" IS A SENTENCE finPal CANNOT JUSTIFY. ***

    Same fail-closed rule as the coin payoffs: no computable consequence, no
    sentence.
    """
    user = UserFactory()
    AccountFactory(user_id=user.id, name='Checking', type='checking', balance=5000.0)
    _db.session.commit()
    assert buffer_picture(user.id, [user.id]) is None


def test_it_counts_only_what_could_be_reached_this_week(db):
    """An investment is not a buffer — the same rule `_liquid_assets` enforces."""
    user = _seed(db, liquid=1000.0)
    AccountFactory(user_id=user.id, name='Brokerage', type='investment', balance=90000.0)
    _db.session.commit()
    assert buffer_picture(user.id, [user.id])['held'] == 1000.0


def test_the_monthly_contribution_rounds_UP(db):
    """Rounded down reaches the target a month late.

    A plan that quietly misses is worse than one that asks for a little more.
    """
    assert monthly_contribution(1000.0, 3) == Decimal('333.34')
    assert monthly_contribution(-500.0, 12) == Decimal('0')
    assert monthly_contribution(1000.0, 0) is None


def test_the_endpoint_answers_with_the_same_figures(client, db, auth_headers):
    user = _seed(db)
    body = client.get('/api/v1/goals/buffer-picture',
                      headers=auth_headers(user)).get_json()
    assert body['success'] is True
    assert body['buffer']['months_covered'] == 4.0
