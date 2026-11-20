"""The "Why?" slot on more pages (Wave 0, critique-2026-11-20 C2): which lessons each screen teaches, and the
one-card fallback for Goals, Accounts (`debt`) and Budgets when none of the screen's own lessons is open.

The fallback must keep the two rules every card follows: a skill already used on the person's money, or set aside in
the last 30 days, never shows, whether as a screen's own card or as its fallback.
"""
from datetime import datetime, timedelta
from decimal import Decimal

import pytest

from src.extensions import db as _db
from src.models.recurring import RecurringExpense
from src.modules.learnpal import routes as learn_routes
from src.modules.learnpal.learn_skills import LEARN_SKILLS, WHY_FALLBACKS, WHY_SCREENS, skill_by_id
from src.modules.learnpal.models import LearnSkillMark
from tests.factories import AccountFactory, BudgetFactory, CategoryFactory, ExpenseFactory, UserFactory
from tests.integration.test_learnpal_short_figures import _income, _last_month, _ten_transactions

BASE = '/api/v1/learnpal'

# The table in learn_skills.py's docstring, restated: a change to either must be a decision, not a drift.
OWN = {
    'dashboard': {'read-your-month'},
    'transactions': {'read-your-month'},
    'analytics': {'read-your-month', 'fixed-costs'},
    'budgets': {'fixed-costs', 'non-monthly'},
    'categories': {'fixed-costs'},
    'recurring': {'fixed-costs', 'non-monthly'},
    'goals': {'buffer'},
    'debt': {'interest', 'pay-down'},
}


@pytest.fixture
def user(db):
    return UserFactory(id='why-screens@test.com', name='Learner')


@pytest.fixture
def h(auth_headers, user):
    return auth_headers(user)


def _ids(client, h, screen):
    r = client.get(f'{BASE}/why?screen={screen}', headers=h)
    assert r.status_code == 200, (screen, r.get_json())
    return [c['id'] for c in r.get_json()['cards']]


def _month(user):
    """`month` open: ten spends and an income last month."""
    _income(user)
    _ten_transactions(user, 10)


def _fixed_share(user):
    """`fixed-share` open: a fixed budget under last month's income (call after `_month` or `_income`)."""
    fixed = CategoryFactory(user_id=user.id, spending_type='fixed')
    ExpenseFactory(user_id=user.id, amount=1000, category_id=fixed.id, date=_last_month(5))
    BudgetFactory(user_id=user.id, category_id=fixed.id, amount=1000)


def _non_monthly(user):
    """`non-monthly` open: a yearly bill planned monthly."""
    cat = CategoryFactory(user_id=user.id, spending_type='non_monthly')
    BudgetFactory(user_id=user.id, category_id=cat.id, amount=600, period='monthly', name='Car tax')


def _buffer(user):
    """`buffer` open: a savings account and a month of essentials."""
    AccountFactory(user_id=user.id, type='savings', balance=500, name='Rainy day')
    cat = CategoryFactory(user_id=user.id, spending_type='fixed')
    ExpenseFactory(user_id=user.id, amount=1600, category_id=cat.id, date=_last_month(3))


def _set_aside(client, h, short_id):
    assert client.post(f'{BASE}/short/{short_id}/finish', headers=h,
                       json={'outcome': 'not_now'}).status_code == 200


# ------------------------------------------------------------------ the map itself

def test_every_screen_and_its_own_skills():
    assert set(WHY_SCREENS) == set(OWN)
    assert {s: {k['id'] for k in LEARN_SKILLS if s in k['screens']} for s in WHY_SCREENS} == OWN


def test_fallbacks_name_real_skills_and_never_a_screens_own():
    assert set(WHY_FALLBACKS) == {'goals', 'debt', 'budgets'}
    for screen, skills in WHY_FALLBACKS.items():
        assert screen in WHY_SCREENS
        assert all(skill_by_id(s) for s in skills), screen
        assert not set(skills) & OWN[screen], screen


# ------------------------------------------------------------------ the endpoint

def test_new_user_gets_no_card_on_any_screen(client, h):
    for screen in WHY_SCREENS:
        assert _ids(client, h, screen) == [], screen
    assert client.get(f'{BASE}/why?screen=nope', headers=h).status_code == 400
    assert client.get(f'{BASE}/why?screen=accounts', headers=h).status_code == 400


def test_new_pages_show_the_lessons_that_teach_their_figures(client, h, user):
    _month(user)
    _fixed_share(user)
    _non_monthly(user)
    assert _ids(client, h, 'transactions') == ['month']
    assert _ids(client, h, 'analytics') == ['fixed-share', 'month']   # priority order (short_lessons.py)
    assert _ids(client, h, 'categories') == ['fixed-share']
    assert _ids(client, h, 'recurring') == ['fixed-share', 'non-monthly']
    assert _ids(client, h, 'dashboard') == ['month']


def test_a_screens_own_lesson_wins_over_its_fallback(client, h, user):
    _buffer(user)
    _non_monthly(user)
    assert _ids(client, h, 'goals') == ['buffer']


def _used(monkeypatch, *skills):
    """Mark skills as used on the person's money (the demo persona's buffer is, which is why Goals was empty)."""
    real = learn_routes._marks.used_on_money
    monkeypatch.setattr(learn_routes._marks, 'used_on_money',
                        lambda uid, skill: skill in skills or real(uid, skill))


def test_goals_falls_back_to_one_open_lesson(client, h, user, monkeypatch):
    _month(user)                                                  # spending makes `buffer` relevant too
    _non_monthly(user)
    assert _ids(client, h, 'goals') == ['buffer']
    _used(monkeypatch, 'buffer')
    assert _ids(client, h, 'goals') == ['non-monthly']            # one card, the most relevant
    _set_aside(client, h, 'non-monthly')
    assert _ids(client, h, 'goals') == ['month']                  # set aside: never shown, the next one is


def test_goals_fallback_skips_a_skill_used_on_money(client, h, user, monkeypatch):
    _month(user)
    _non_monthly(user)
    _used(monkeypatch, 'buffer', 'non-monthly')
    assert _ids(client, h, 'goals') == ['month']


def test_debt_falls_back_to_the_buffer_then_the_month(client, h, user):
    _buffer(user)
    assert _ids(client, h, 'debt') == ['buffer']
    _set_aside(client, h, 'buffer')
    assert _ids(client, h, 'debt') == []
    row = LearnSkillMark.query.filter_by(user_id=user.id, skill='buffer').one()
    row.set_aside_at = datetime.utcnow() - timedelta(days=31)
    _db.session.commit()
    assert _ids(client, h, 'debt') == ['buffer']


def test_budgets_falls_back_to_reading_the_month(client, h, user):
    _month(user)
    assert _ids(client, h, 'budgets') == ['month']
    _non_monthly(user)
    assert _ids(client, h, 'budgets') == ['non-monthly']          # its own lesson takes the slot back


def test_screens_without_a_fallback_stay_empty(client, h, user):
    _buffer(user)                                                  # only `buffer` is open
    for screen in ('dashboard', 'transactions', 'analytics', 'categories', 'recurring'):
        assert _ids(client, h, screen) == [], screen


def test_recurring_shows_a_yearly_bill(client, h, user):
    r = RecurringExpense(
        description='Home insurance', amount=Decimal('1200.00'), card_used='x', split_method='none',
        paid_by=user.id, user_id=user.id, frequency='yearly',
        start_date=datetime.utcnow() - timedelta(days=100), active=True)
    _db.session.add(r)
    _db.session.commit()
    assert _ids(client, h, 'recurring') == ['non-monthly']
