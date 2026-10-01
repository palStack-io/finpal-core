"""D-308: every account contributes to every month of the net-worth trend.

The trend recorded an account's balance only in months where that account had a
transaction. Summed per month, a month counted only the accounts active in it, and
a month with no activity anywhere vanished from the series. Measured before the fix
on exactly this fixture: June 1100, July 5000, August 1000, (no September), current
month 6000 — for a household worth about 6000 the whole time.
"""
from datetime import date, datetime
from decimal import Decimal

from src.extensions import db as _db
from src.models.user import User
from src.utils.helpers import calculate_asset_debt_trends
from tests.factories import AccountFactory, ExpenseFactory, UserFactory


def _months_from(year, month):
    today = date.today()
    out = []
    while (year, month) <= (today.year, today.month):
        out.append(f'{year}-{month:02d}')
        year, month = (year + 1, 1) if month == 12 else (year, month + 1)
    return out


def test_each_month_counts_every_account_and_no_month_is_skipped(db):
    user = UserFactory()
    checking = AccountFactory(user_id=user.id, type='checking', balance=Decimal('1000.00'))
    savings = AccountFactory(user_id=user.id, type='savings', balance=Decimal('5000.00'))
    ExpenseFactory(user_id=user.id, account_id=checking.id, amount=Decimal('100'),
                   date=datetime(2026, 6, 10), paid_by=user.id)
    ExpenseFactory(user_id=user.id, account_id=savings.id, amount=Decimal('50'),
                   date=datetime(2026, 7, 10), paid_by=user.id)
    ExpenseFactory(user_id=user.id, account_id=checking.id, amount=Decimal('100'),
                   date=datetime(2026, 8, 10), paid_by=user.id)

    trend = calculate_asset_debt_trends(_db.session.get(User, user.id))
    by_month = dict(zip(trend['months'], trend['assets']))

    # No gaps: every calendar month from the first activity to today.
    assert trend['months'] == _months_from(2026, 6)

    # Closing balances, reconstructed backwards from today's 1000 + 5000:
    assert by_month['2026-06'] == Decimal('6150.00')   # 1100 + 5050
    assert by_month['2026-07'] == Decimal('6100.00')   # 1100 + 5000
    assert by_month['2026-08'] == Decimal('6000.00')   # 1000 + 5000
    for month in _months_from(2026, 9):
        assert by_month[month] == Decimal('6000.00'), month
