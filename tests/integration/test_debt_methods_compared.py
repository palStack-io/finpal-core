"""The debt-order lesson carries both payoff methods, from core's one computation (`debt_comparison`)."""
from decimal import Decimal

from src.extensions import db as _db
from src.models.debt_plan import DebtPlan
from src.modules.learnpal.short_figures import figures_for
from tests.factories import AccountFactory, UserFactory


def _debt(user, name, balance, apr, minimum=None, type_='credit'):
    a = AccountFactory(user_id=user.id, name=name, type=type_, balance=-Decimal(str(balance)))
    a.apr = Decimal(str(apr)) if apr is not None else None
    a.min_payment = Decimal(str(minimum)) if minimum is not None else None
    _db.session.commit()
    return a


def test_alex(db):
    user = UserFactory()
    _debt(user, 'Visa Credit Card', 800, 19.99, 35)
    _debt(user, 'Student Loan', 14500, 4.5, None, type_='loan')
    _debt(user, 'Store Card', 350, 0, 25)
    _db.session.add(DebtPlan(user_id=user.id, method='snowball', monthly_amount=Decimal('250')))
    _db.session.commit()
    f = figures_for(user.id, 'debt-order')
    cmp = f['try']['compare']
    assert cmp['basis'] == 'plan' and cmp['monthly'] == '250.00'
    assert cmp['avalanche'] == {'first': 'Visa Credit Card', 'never': False, 'months': 72, 'span': '6 years',
                                'interest_total': '2239.89'}
    assert cmp['snowball'] == {'first': 'Store Card', 'never': False, 'months': 72, 'span': '6 years',
                               'interest_total': '2266.40'}
    # Where each method starts is the comparison's own answer, so the chart and the sentence agree.
    assert (f['try']['highest_rate'], f['try']['smallest'], f['count']) == ('Visa Credit Card', 'Store Card', '3')


def test_minimums_basis_without_a_plan(db):
    user = UserFactory()
    _debt(user, 'A', 300, 12, 50)
    _debt(user, 'B', 400, 24, 50)
    cmp = figures_for(user.id, 'debt-order')['try']['compare']
    assert (cmp['basis'], cmp['monthly'], cmp['avalanche']['first'], cmp['snowball']['first']) == \
        ('minimums', '100.00', 'B', 'A')


def test_no_amount_no_comparison(db):
    user = UserFactory()
    _debt(user, 'A', 300, 12, 50)
    _debt(user, 'B', 400, 24, None)
    f = figures_for(user.id, 'debt-order')
    assert 'compare' not in f['try'] and (f['try']['highest_rate'], f['try']['smallest']) == ('B', 'A')


def test_never_is_said_not_bluffed(db):
    user = UserFactory()
    _debt(user, 'Big', 10000, 24, 100)
    _debt(user, 'Small', 500, 10, 25)
    cmp = figures_for(user.id, 'debt-order')['try']['compare']
    for m in ('avalanche', 'snowball'):
        assert cmp[m]['never'] is True and cmp[m]['months'] is None and cmp[m]['interest_total'] is None
