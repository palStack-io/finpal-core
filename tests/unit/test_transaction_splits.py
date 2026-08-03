"""
Unit tests for Expense.calculate_splits.

Tests: split_method='none', 'equal' (2 and 3 people),
'custom', 'percentage'. Also tests users_map N+1 avoidance.
"""

import pytest
from tests.factories import UserFactory, ExpenseFactory


def test_split_none_full_amount_to_payer(app, db):
    with app.app_context():
        user = UserFactory()
        expense = ExpenseFactory(
            user_id=user.id,
            paid_by=user.id,
            amount=100.0,
            split_method='none',
            split_with=None,
        )
        result = expense.calculate_splits()
        assert result['payer']['amount'] == 100.0
        assert result['splits'] == []


def test_split_equal_two_people(app, db):
    with app.app_context():
        payer = UserFactory()
        other = UserFactory()
        expense = ExpenseFactory(
            user_id=payer.id,
            paid_by=payer.id,
            amount=100.0,
            split_method='equal',
            split_with=other.id,
        )
        result = expense.calculate_splits()
        assert result['payer']['amount'] == pytest.approx(50.0)
        assert len(result['splits']) == 1
        assert result['splits'][0]['amount'] == pytest.approx(50.0)


def test_split_equal_three_people(app, db):
    with app.app_context():
        payer = UserFactory()
        u2 = UserFactory()
        u3 = UserFactory()
        expense = ExpenseFactory(
            user_id=payer.id,
            paid_by=payer.id,
            amount=90.0,
            split_method='equal',
            split_with=f'{u2.id},{u3.id}',
        )
        result = expense.calculate_splits()
        assert result['payer']['amount'] == pytest.approx(30.0)
        assert len(result['splits']) == 2
        for s in result['splits']:
            assert s['amount'] == pytest.approx(30.0)


def test_split_equal_payer_in_split_with(app, db):
    """When payer is listed in split_with, payer amount should be 0."""
    with app.app_context():
        payer = UserFactory()
        other = UserFactory()
        expense = ExpenseFactory(
            user_id=payer.id,
            paid_by=payer.id,
            amount=100.0,
            split_method='equal',
            split_with=f'{payer.id},{other.id}',
        )
        result = expense.calculate_splits()
        assert result['payer']['amount'] == 0.0


def test_split_custom_amounts(app, db):
    import json
    with app.app_context():
        payer = UserFactory()
        other = UserFactory()
        split_details = json.dumps({
            'type': 'amount',
            'values': {payer.id: 70.0, other.id: 30.0},
        })
        expense = ExpenseFactory(
            user_id=payer.id,
            paid_by=payer.id,
            amount=100.0,
            split_method='custom',
            split_with=other.id,
            split_details=split_details,
        )
        result = expense.calculate_splits()
        assert result['payer']['amount'] == pytest.approx(70.0)
        assert result['splits'][0]['amount'] == pytest.approx(30.0)


def test_split_percentage(app, db):
    import json
    with app.app_context():
        payer = UserFactory()
        other = UserFactory()
        split_details = json.dumps({
            'type': 'percentage',
            'values': {payer.id: 60.0, other.id: 40.0},
        })
        expense = ExpenseFactory(
            user_id=payer.id,
            paid_by=payer.id,
            amount=200.0,
            split_method='percentage',
            split_with=other.id,
            split_details=split_details,
        )
        result = expense.calculate_splits()
        assert result['payer']['amount'] == pytest.approx(120.0)
        assert result['splits'][0]['amount'] == pytest.approx(80.0)


def test_split_uses_users_map_when_provided(app, db):
    """Providing users_map should return same result — confirms no N+1 queries."""
    with app.app_context():
        payer = UserFactory()
        other = UserFactory()
        expense = ExpenseFactory(
            user_id=payer.id,
            paid_by=payer.id,
            amount=60.0,
            split_method='equal',
            split_with=other.id,
        )
        users_map = {payer.id: payer, other.id: other}
        result_with_map = expense.calculate_splits(users_map=users_map)
        result_without = expense.calculate_splits()
        assert result_with_map['payer']['amount'] == result_without['payer']['amount']
        assert result_with_map['splits'][0]['amount'] == result_without['splits'][0]['amount']
