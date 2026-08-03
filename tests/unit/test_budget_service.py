"""
Unit tests for Budget model methods.

Tests: calculate_spent_amount (with/without expenses),
status thresholds (under/approaching/over),
get_current_period_dates for weekly/monthly/yearly.
"""

import pytest
from datetime import datetime
from tests.factories import UserFactory, CategoryFactory, ExpenseFactory, BudgetFactory


def test_calculate_spent_amount_no_expenses(app, db):
    with app.app_context():
        user = UserFactory()
        cat = CategoryFactory(user_id=user.id)
        budget = BudgetFactory(user_id=user.id, category_id=cat.id, amount=500.0)
        now = datetime.utcnow()
        spent = budget.calculate_spent_amount(year=now.year, month=now.month)
        assert spent == 0.0


def test_calculate_spent_amount_with_expense(app, db):
    with app.app_context():
        user = UserFactory()
        cat = CategoryFactory(user_id=user.id)
        budget = BudgetFactory(user_id=user.id, category_id=cat.id, amount=500.0)
        now = datetime.utcnow()
        ExpenseFactory(
            user_id=user.id,
            paid_by=user.id,
            category_id=cat.id,
            amount=120.0,
            date=now,
            split_method='none',
        )
        spent = budget.calculate_spent_amount(year=now.year, month=now.month)
        assert spent == pytest.approx(120.0)


def test_calculate_spent_amount_different_category_excluded(app, db):
    with app.app_context():
        user = UserFactory()
        cat = CategoryFactory(user_id=user.id)
        other_cat = CategoryFactory(user_id=user.id)
        budget = BudgetFactory(user_id=user.id, category_id=cat.id, amount=500.0)
        now = datetime.utcnow()
        # Expense in a different category — should not count
        ExpenseFactory(
            user_id=user.id,
            paid_by=user.id,
            category_id=other_cat.id,
            amount=200.0,
            date=now,
            split_method='none',
        )
        spent = budget.calculate_spent_amount(year=now.year, month=now.month)
        assert spent == 0.0


def test_get_status_under(app, db):
    with app.app_context():
        user = UserFactory()
        cat = CategoryFactory(user_id=user.id)
        budget = BudgetFactory(user_id=user.id, category_id=cat.id, amount=500.0)
        # No expenses → 0% → 'under'
        assert budget.get_status() == 'under'


def test_get_status_approaching(app, db):
    with app.app_context():
        user = UserFactory()
        cat = CategoryFactory(user_id=user.id)
        budget = BudgetFactory(user_id=user.id, category_id=cat.id, amount=500.0)
        now = datetime.utcnow()
        # 85% spent → 'approaching'
        ExpenseFactory(
            user_id=user.id,
            paid_by=user.id,
            category_id=cat.id,
            amount=425.0,
            date=now,
            split_method='none',
        )
        assert budget.get_status() == 'approaching'


def test_get_status_over(app, db):
    with app.app_context():
        user = UserFactory()
        cat = CategoryFactory(user_id=user.id)
        budget = BudgetFactory(user_id=user.id, category_id=cat.id, amount=500.0)
        now = datetime.utcnow()
        # 110% spent → 'over'
        ExpenseFactory(
            user_id=user.id,
            paid_by=user.id,
            category_id=cat.id,
            amount=550.0,
            date=now,
            split_method='none',
        )
        assert budget.get_status() == 'over'


def test_get_current_period_dates_monthly(app, db):
    with app.app_context():
        user = UserFactory()
        cat = CategoryFactory(user_id=user.id)
        budget = BudgetFactory(user_id=user.id, category_id=cat.id, period='monthly')
        start, end = budget.get_current_period_dates()
        assert start.day == 1
        assert end > start


def test_get_current_period_dates_weekly(app, db):
    with app.app_context():
        user = UserFactory()
        cat = CategoryFactory(user_id=user.id)
        budget = BudgetFactory(user_id=user.id, category_id=cat.id, period='weekly')
        start, end = budget.get_current_period_dates()
        assert (end - start).days == 6
        assert start.weekday() == 0  # Monday


def test_get_current_period_dates_yearly(app, db):
    with app.app_context():
        user = UserFactory()
        cat = CategoryFactory(user_id=user.id)
        budget = BudgetFactory(user_id=user.id, category_id=cat.id, period='yearly')
        start, end = budget.get_current_period_dates()
        assert start.month == 1 and start.day == 1
        assert end.year == start.year and end.month == 12 and end.day == 31
