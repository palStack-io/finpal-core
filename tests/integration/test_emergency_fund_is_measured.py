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


# ---------------------------------------------------------------------------
# The divisor — and the two errors that were cancelling each other
# ---------------------------------------------------------------------------

def _spend(user, category, amount, when):
    from src.models.transaction import Expense
    row = Expense(description=f'{category.name} spend', amount=amount, date=when,
                  user_id=user.id, paid_by=user.id, card_used='',
                  split_method='none', category_id=category.id,
                  transaction_type='expense', currency_code='USD')
    _db.session.add(row)
    _db.session.commit()
    return row


def _last_month():
    from datetime import datetime, timedelta
    first = datetime.utcnow().replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    end = first - timedelta(seconds=1)
    return end.replace(day=15, hour=12)


def _category(user, name, spending_type):
    from src.models.category import Category
    row = Category(name=name, user_id=user.id, spending_type=spending_type)
    _db.session.add(row)
    _db.session.commit()
    return row


def test_the_divisor_is_ESSENTIALS_not_everything(db):
    """*** AN EMERGENCY FUND COVERS WHAT ARRIVES WHATEVER YOU DO. ***

    Flexible spending is the first thing anyone cuts in an emergency, so
    counting it makes the buffer look shorter than it is. finPal knows which
    is which — `spending_type`, the same field Budgets groups by.
    """
    user = UserFactory()
    _account(user.id, 'savings', 6000.0)
    when = _last_month()
    _spend(user, _category(user, 'Rent', 'fixed'), 1000.0, when)
    _spend(user, _category(user, 'Dining', 'flexible'), 1000.0, when)

    need = AnalyticsService()._essential_monthly_spend(user.id, [user.id])
    assert need == Decimal('1000.00')        # not 2000: flexible is excluded


def test_NOTHING_SORTED_FALLS_BACK_TO_THE_WHOLE_MONTH_NOT_TO_ZERO(db):
    """*** A ZERO DIVISOR IS AN INFINITE RUNWAY. ***

    A user who has sorted no categories must not be told their buffer lasts
    forever. The whole month is the honest stand-in and it errs SHORT — a
    bigger divisor, fewer months — which is the safe direction for this figure.
    """
    user = UserFactory()
    _account(user.id, 'savings', 6000.0)
    when = _last_month()
    _spend(user, _category(user, 'Everything', None), 1500.0, when)

    assert AnalyticsService()._essential_monthly_spend(user.id, [user.id]) == Decimal('1500.00')


def test_no_spending_at_all_yields_no_figure_rather_than_a_wrong_one(db):
    user = UserFactory()
    _account(user.id, 'savings', 6000.0)
    assert AnalyticsService()._essential_monthly_spend(user.id, [user.id]) is None


def test_THE_TWO_ERRORS_WERE_CANCELLING_AND_BOTH_ARE_FIXED(db):
    """The regression this file exists for, end to end.

    Before: liquid was 30% of assets and the divisor was `total_expenses / 12`
    — on the demo, 2,400 over 591.85, which read 4.1 months and looked fine.
    Fixing only the numerator took it to 13.5 months against a household
    spending 2,059.49 a month on essentials. Overstating a safety buffer is
    the direction that gets somebody hurt, so both halves had to move.
    """
    user = UserFactory()
    _account(user.id, 'checking', 5000.0)
    _account(user.id, 'savings', 3000.0)
    _account(user.id, 'investment', 50000.0)      # must not count
    when = _last_month()
    _spend(user, _category(user, 'Rent', 'fixed'), 2000.0, when)
    _spend(user, _category(user, 'Fun', 'flexible'), 800.0, when)

    health = AnalyticsService().get_financial_health(user.id, [user.id])
    # 8,000 liquid over 2,000 of essentials.
    assert health['emergencyFundMonths'] == 4.0
