"""Short lessons: the person's own figures, and whether each lesson is relevant at all."""

import re
from datetime import datetime, timedelta
from decimal import Decimal

import pytest

from src.extensions import db as _db
from src.models.recurring import RecurringExpense
from src.modules.learnpal.short_figures import figures_for, relevant_short_lessons
from src.modules.learnpal.short_lessons import SHORT_LESSONS
from tests.factories import (
    AccountFactory, BudgetFactory, CategoryFactory, ExpenseFactory, UserFactory)


def _last_month(day=10):
    first = datetime.utcnow().replace(day=1, hour=12, minute=0, second=0, microsecond=0)
    return (first - timedelta(days=1)).replace(day=day)


def _card(user, balance, apr, name=None, **kw):
    return AccountFactory(
        user_id=user.id, type='credit', balance=-Decimal(str(balance)),
        apr=None if apr is None else Decimal(str(apr)),
        **({'name': name} if name else {}), **kw)


def _income(user, amount=3000):
    return ExpenseFactory(user_id=user.id, amount=amount, transaction_type='income',
                          date=_last_month(1), description='Pay')


@pytest.fixture
def user(db):
    return UserFactory()


def test_new_user_has_nothing_relevant(user):
    assert relevant_short_lessons(user.id) == []
    for sid in SHORT_LESSONS:
        assert figures_for(user.id, sid) is None


def test_unknown_lesson_is_none(user):
    assert figures_for(user.id, 'nope') is None


def test_interest_uses_largest_card_with_a_rate(user):
    _card(user, 5000, None, name='Unrated')
    _card(user, 400, 20, name='Small')
    _card(user, '1860.00', '25.00', name='Visa')
    f = figures_for(user.id, 'interest')
    assert f['interest_month'] == '$38.75'
    assert f['account'] == 'Visa'
    assert f['balance'] == '$1,860.00'
    assert f['apr'] == '25%'
    assert f['try']['kind'] == 'interest'
    assert f['try']['balance'] == '1860.00'
    assert f['try']['interest_month'] == '38.75'


def test_interest_not_relevant_without_rate(user):
    _card(user, 1000, None)
    assert figures_for(user.id, 'interest') is None
    _card(user, 1000, 0)
    assert figures_for(user.id, 'interest') is None


def test_interest_not_relevant_with_zero_balance(user):
    _card(user, 0, 25)
    assert figures_for(user.id, 'interest') is None


def test_interest_base_payment_prefers_recorded_minimum(user):
    _card(user, 1000, 20, min_payment=Decimal('55.00'))
    assert figures_for(user.id, 'interest')['try']['base_payment'] == '55.00'


def test_interest_base_payment_fallback(user):
    _card(user, 500, 12)  # 5.00 + 5.00 is under the 25 floor
    assert figures_for(user.id, 'interest')['try']['base_payment'] == '25.00'
    _card(user, 5000, 20)  # 83.33 interest + 50.00
    assert figures_for(user.id, 'interest')['try']['base_payment'] == '133.33'


def test_fallback_payment_clears_the_debt(user):
    _card(user, '1860.00', '25.00')
    t = figures_for(user.id, 'interest')['try']
    assert t['base_payment'] == '57.35' and t['covers_interest'] is True
    assert t['points'][0]['months'] is not None


def test_recorded_minimum_below_interest_is_flagged(user):
    _card(user, '1860.00', '25.00', min_payment=Decimal('30.00'))
    t = figures_for(user.id, 'interest')['try']
    assert t['covers_interest'] is False
    assert t['points'][0]['months'] is None


def test_interest_slider_points_are_monotone(user):
    _card(user, 1860, 25, min_payment=Decimal('30.00'))  # recorded minimum below the 38.75 interest
    pts = figures_for(user.id, 'interest')['try']['points']
    assert [p['extra'] for p in pts] == list(range(0, 301, 10))
    assert pts[0]['months'] is None and pts[0]['interest_total'] is None
    cleared = [p for p in pts if p['months'] is not None]
    assert len(cleared) >= 20
    # once a payment clears the card, more never takes longer or costs more interest
    months = [p['months'] for p in cleared]
    totals = [Decimal(p['interest_total']) for p in cleared]
    assert months == sorted(months, reverse=True)
    assert totals == sorted(totals, reverse=True)
    # never-cleared points are only a prefix
    assert all(p['months'] is not None for p in pts[len(pts) - len(cleared):])


def test_interest_points_known_value(user):
    _card(user, 1000, 12, min_payment=Decimal('100.00'))
    p0 = figures_for(user.id, 'interest')['try']['points'][0]
    assert p0['months'] == 11  # 1% a month, 100 a month
    assert Decimal('50.00') < Decimal(p0['interest_total']) < Decimal('60.00')


def test_fixed_share_needs_income(user):
    cat = CategoryFactory(user_id=user.id, spending_type='fixed')
    BudgetFactory(user_id=user.id, category_id=cat.id, amount=1000)
    assert figures_for(user.id, 'fixed-share') is None
    _income(user, 3000)
    f = figures_for(user.id, 'fixed-share')
    assert f['fixed_amount'] == '$1,000.00'
    assert f['income'] == '$3,000.00'
    assert f['fixed_share'] == 'about a third'


def test_fixed_share_ignores_flexible_and_needs_a_fixed_budget(user):
    _income(user, 3000)
    cat = CategoryFactory(user_id=user.id, spending_type='flexible')
    BudgetFactory(user_id=user.id, category_id=cat.id, amount=1000)
    assert figures_for(user.id, 'fixed-share') is None


def test_fixed_share_whole_percent_when_no_plain_words(user):
    _income(user, 2500)
    cat = CategoryFactory(user_id=user.id, spending_type='fixed')
    BudgetFactory(user_id=user.id, category_id=cat.id, amount=1000)
    assert figures_for(user.id, 'fixed-share')['fixed_share'] == '40%'


def test_fixed_share_over_income_is_not_relevant(user):
    _income(user, 500)
    cat = CategoryFactory(user_id=user.id, spending_type='fixed')
    BudgetFactory(user_id=user.id, category_id=cat.id, amount=1000)
    assert figures_for(user.id, 'fixed-share') is None


def _ten_transactions(user, n=10):
    cat = CategoryFactory(user_id=user.id, name='Groceries')
    for i in range(n):
        ExpenseFactory(user_id=user.id, amount=20, category_id=cat.id,
                       date=_last_month(1 + i))


def test_month_needs_ten_transactions(user):
    _income(user)
    _ten_transactions(user, 8)  # 8 expenses + 1 income = 9
    assert figures_for(user.id, 'month') is None
    ExpenseFactory(user_id=user.id, amount=20, date=_last_month(12))
    f = figures_for(user.id, 'month')
    assert f['biggest_category'] == 'Groceries'
    assert f['biggest_amount'] == '$160.00'
    assert f['spent'] == '$180.00'
    assert f['income'] == '$3,000.00'


def test_month_ignores_this_month(user):
    cat = CategoryFactory(user_id=user.id)
    _income(user)
    for _ in range(12):
        ExpenseFactory(user_id=user.id, amount=5, category_id=cat.id)  # now
    assert figures_for(user.id, 'month') is None


def test_debt_order_needs_two_rated_debts(user):
    _card(user, 800, 29, name='Store')
    assert figures_for(user.id, 'debt-order') is None
    _card(user, 5000, None, name='Unrated')
    assert figures_for(user.id, 'debt-order') is None
    _card(user, 3000, 18, name='Bank')
    f = figures_for(user.id, 'debt-order')
    assert f['count'] == '2'
    assert f['highest_rate_account'] == 'Store'
    assert f['smallest_account'] == 'Store'
    _card(user, 200, 5, name='Tiny')
    f = figures_for(user.id, 'debt-order')
    assert (f['count'], f['highest_rate_account'], f['smallest_account']) == ('3', 'Store', 'Tiny')
    assert f['try']['kind'] == 'debt_order'


def test_buffer_needs_monthly_essentials(user):
    AccountFactory(user_id=user.id, type='savings', balance=500)
    assert figures_for(user.id, 'buffer') is None


def test_buffer_figures(user):
    AccountFactory(user_id=user.id, type='savings', balance=500, name='Rainy day')
    cat = CategoryFactory(user_id=user.id, spending_type='fixed')
    ExpenseFactory(user_id=user.id, amount=1600, category_id=cat.id, date=_last_month(3))
    f = figures_for(user.id, 'buffer')
    assert f['account'] == 'Rainy day'
    assert f['buffer_amount'] == '$800.00'
    assert f['buffer_months'] == 'about two weeks'
    assert f['try']['kind'] == 'buffer'


def test_non_monthly_budget_not_yet_a_sinking_fund(user):
    cat = CategoryFactory(user_id=user.id, spending_type='non_monthly')
    BudgetFactory(user_id=user.id, category_id=cat.id, amount=600, period='monthly',
                  name='Car tax')
    f = figures_for(user.id, 'non-monthly')
    assert (f['item'], f['yearly'], f['monthly']) == ('Car tax', '$600.00', '$50.00')


def test_non_monthly_not_relevant_when_already_a_sinking_fund(user):
    cat = CategoryFactory(user_id=user.id, spending_type='non_monthly')
    BudgetFactory(user_id=user.id, category_id=cat.id, amount=600, period='yearly')
    assert figures_for(user.id, 'non-monthly') is None


def test_non_monthly_from_a_yearly_recurring_item(user):
    r = RecurringExpense(
        description='Home insurance', amount=Decimal('1200.00'), card_used='x',
        split_method='none', paid_by=user.id, user_id=user.id, frequency='yearly',
        start_date=datetime.utcnow() - timedelta(days=100), active=True)
    _db.session.add(r)
    _db.session.commit()
    f = figures_for(user.id, 'non-monthly')
    assert (f['item'], f['yearly'], f['monthly']) == ('Home insurance', '$1,200.00', '$100.00')


def _rich_user(user):
    """Every lesson relevant."""
    _card(user, '1860.00', '25.00', name='Visa')
    _card(user, 3000, 18, name='Bank')
    AccountFactory(user_id=user.id, type='savings', balance=500, name='Rainy day')
    _income(user, 3000)
    _ten_transactions(user, 10)
    fixed = CategoryFactory(user_id=user.id, spending_type='fixed')
    ExpenseFactory(user_id=user.id, amount=1000, category_id=fixed.id, date=_last_month(5))
    BudgetFactory(user_id=user.id, category_id=fixed.id, amount=1000)
    nm = CategoryFactory(user_id=user.id, spending_type='non_monthly')
    BudgetFactory(user_id=user.id, category_id=nm.id, amount=600, period='monthly',
                  name='Car tax')


def test_relevant_short_lessons_in_priority_order(user):
    _rich_user(user)
    assert relevant_short_lessons(user.id) == list(SHORT_LESSONS)


def test_templates_format_with_figures(user):
    _rich_user(user)
    relevant = relevant_short_lessons(user.id)
    assert len(relevant) == len(SHORT_LESSONS)
    for sid in relevant:
        f = figures_for(user.id, sid)
        lesson = SHORT_LESSONS[sid]
        card = lesson['card'].format(**f)
        number = lesson['number'].format(**f)
        for text in (card, number):
            assert not re.search(r'\b(\w+)\s+\1\b', text, re.I), text
            assert 'None' not in text and '{' not in text and '}' not in text
            # no bare leading-zero decimals ("0.4 months"); "$1,860.00" is fine
            assert not re.search(r'(?<![\d,.])0\.\d', text), text
            assert not re.search(r'\d\.\d+%', text), text
        assert f['try']['kind'] == lesson['try_kind']


def test_interest_ignores_loans(user):
    AccountFactory(user_id=user.id, type='loan', balance=Decimal('-8000'), apr=Decimal('6'))
    assert figures_for(user.id, 'interest') is None
    _card(user, 1000, 20, name='Visa')
    assert figures_for(user.id, 'interest')['account'] == 'Visa'


def test_every_try_block_carries_the_currency(user):
    _rich_user(user)
    for sid in relevant_short_lessons(user.id):
        assert figures_for(user.id, sid)['try']['currency'] == 'USD', sid


def test_try_currency_follows_the_person(user):
    from src.models.currency import Currency
    if _db.session.get(Currency, 'GBP') is None:
        _db.session.add(Currency(code='GBP', name='Pound', symbol='£'))
    user.default_currency_code = 'GBP'
    _db.session.commit()
    AccountFactory(user_id=user.id, type='savings', balance=500, name='Rainy day',
                   currency_code='GBP')
    cat = CategoryFactory(user_id=user.id, spending_type='fixed')
    ExpenseFactory(user_id=user.id, amount=1600, category_id=cat.id, date=_last_month(3))
    f = figures_for(user.id, 'buffer')
    assert f['try']['currency'] == 'GBP' and f['buffer_amount'].startswith('£')


# --- UI audit 2026-11-20, P1-5: "Came in" names its month, and is the same income every screen counts ---------

def test_fixed_share_names_the_month_its_income_came_in(user):
    """The card says "Some of November"; the income is October's. The number line and the try block say so."""
    from calendar import month_name
    _income(user, 3000)
    cat = CategoryFactory(user_id=user.id, spending_type='fixed')
    BudgetFactory(user_id=user.id, category_id=cat.id, amount=1000)
    f = figures_for(user.id, 'fixed-share')
    october = month_name[_last_month().month]
    assert f['income_month'] == october
    assert f['try']['month'] == october
    number = SHORT_LESSONS['fixed-share']['number'].format(**f)
    assert october in number and '$3,000.00' in number


def test_month_lesson_names_its_month_in_the_number_and_the_try_block(user):
    from calendar import month_name
    _income(user)
    _ten_transactions(user)
    f = figures_for(user.id, 'month')
    october = month_name[_last_month().month]
    assert f['try']['month'] == october
    assert october in SHORT_LESSONS['month']['number'].format(**f)


def test_lesson_income_is_the_shared_converted_income(user):
    """One income definition: the lesson's "Came in" equals `income_between` for the same month and person,
    and a row in another currency is converted (it used to be summed raw)."""
    from src.services.analytics.service import AnalyticsService
    from src.utils.currency_converter import convert_currency
    _income(user, 3000)
    ExpenseFactory(user_id=user.id, amount=100, transaction_type='income', date=_last_month(2),
                   description='Refund', currency_code='EUR')
    cat = CategoryFactory(user_id=user.id, spending_type='fixed')
    BudgetFactory(user_id=user.id, category_id=cat.id, amount=1000)
    first = datetime.utcnow().replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    start = (first - timedelta(days=1)).replace(day=1)
    shared = AnalyticsService().income_between(user.id, start, first - timedelta(seconds=1), scope_ids=[user.id])
    expected = Decimal('3000') + Decimal(str(convert_currency(Decimal('100'), 'EUR', 'USD')))
    assert round(Decimal(str(shared)), 2) == round(expected, 2)
    assert figures_for(user.id, 'fixed-share')['try']['income'] == f'{round(expected, 2):.2f}'
