"""The emergency-fund figure is SUMMED, not estimated at 30%.

*** IT WAS A HEURISTIC OVER A NUMBER SITTING IN THE DATABASE. ***
`get_financial_health` read `total_assets * Decimal('0.3')` under the comment
"Assume liquid assets are 30% of total assets". Which accounts are liquid is
not something finPal has to estimate — `Account.type` says so. Measured on the
demo 2026-09-19: demo1 holds 5,000.00 checking and 3,000.00 savings, so the
knowable figure is 8,000.00 and the guess produced 2,400.00. The headline
understated their buffer by 3.3x.

The other rule-of-thumb ratios in that method are heuristics over figures
nobody can know (what share of a debt is repaid each month). This one was not,
which is the difference between an approximation and a fabricated figure.
"""
from decimal import Decimal

from src.extensions import db as _db
from src.services.analytics.service import AnalyticsService
from tests.factories import UserFactory, AccountFactory


def _account(user_id, kind, balance, name=None):
    account = AccountFactory(user_id=user_id, name=name or kind.title(),
                             type=kind, balance=balance)
    _db.session.commit()
    return account


def test_liquid_assets_are_checking_plus_savings(db):
    user = UserFactory()
    _account(user.id, 'checking', 5000.0)
    _account(user.id, 'savings', 3000.0)

    liquid = AnalyticsService()._liquid_assets(user.id, [user.id])
    assert liquid == Decimal('8000.00')


def test_AN_INVESTMENT_IS_NOT_AN_EMERGENCY_FUND(db):
    """Selling it takes days and may crystallise a loss.

    A figure that counts a brokerage account as "three months of expenses"
    tells somebody they are safe when they are not — which is the direction
    this metric must never be wrong in.
    """
    user = UserFactory()
    _account(user.id, 'checking', 1000.0)
    _account(user.id, 'investment', 50000.0)

    assert AnalyticsService()._liquid_assets(user.id, [user.id]) == Decimal('1000.00')


def test_A_CREDIT_CARD_BALANCE_IS_A_DEBT_NOT_A_NEGATIVE_BUFFER(db):
    """It must not be subtracted from the cash on hand.

    The buffer answers "how long could I pay my bills"; a card's balance is
    what is owed, and netting it here would answer neither question.
    """
    user = UserFactory()
    _account(user.id, 'checking', 2000.0)
    _account(user.id, 'credit', -800.0)

    assert AnalyticsService()._liquid_assets(user.id, [user.id]) == Decimal('2000.00')


def test_an_overdrawn_current_account_does_not_count_as_a_buffer(db):
    """A negative checking balance is not cash. It is refused, not netted."""
    user = UserFactory()
    _account(user.id, 'checking', -300.0)
    _account(user.id, 'savings', 1000.0)

    assert AnalyticsService()._liquid_assets(user.id, [user.id]) == Decimal('1000.00')
