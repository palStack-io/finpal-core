"""The Kit's income line names how often the money arrives (UI audit 2026-11-20, P1-5).

"finPal now knows $4,500.00 arrives" sat beside the Dashboard's $4,750.00 "Monthly Income", the
lesson's $5,200.00 "Came in" and Analytics' $5,050.00 "Total Income", as a fourth unexplained
income. It is a different thing (one expected pay, from the recurring rules), so it says so: "every
month", "every two weeks". With several income rules it names the largest, not whichever came first.
"""
from datetime import datetime
from decimal import Decimal

from src.extensions import db as _db
from src.models.recurring import RecurringExpense
from src.services.literacy.payoff import income_recorded
from tests.factories import UserFactory


def _pay(user, amount, frequency):
    _db.session.add(RecurringExpense(description='Pay', amount=Decimal(amount), card_used='', split_method='none',
                                     paid_by=user.id, user_id=user.id, frequency=frequency,
                                     start_date=datetime(2026, 1, 1), transaction_type='income', active=True))
    _db.session.commit()


def test_monthly_pay_says_every_month(db):
    user = UserFactory(default_currency_code='USD')
    _pay(user, '4500', 'monthly')
    assert income_recorded(user.id).startswith('finPal now knows $4,500.00 arrives every month.')


def test_the_largest_rule_is_named_with_its_own_frequency(db):
    user = UserFactory(default_currency_code='USD')
    _pay(user, '120', 'monthly')
    _pay(user, '1800', 'biweekly')
    assert income_recorded(user.id).startswith('finPal now knows $1,800.00 arrives every two weeks.')
