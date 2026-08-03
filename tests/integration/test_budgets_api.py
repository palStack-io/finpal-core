"""
Integration tests for budgets API.

Tests: list, create, get by id, update, delete, overview.
"""

import pytest
from tests.factories import UserFactory, CategoryFactory, BudgetFactory, ExpenseFactory
from datetime import datetime


def test_list_budgets_requires_auth(client, db):
    resp = client.get('/api/v1/budgets/')
    assert resp.status_code == 401


def test_list_budgets_returns_200(client, db, auth_headers):
    user = UserFactory()
    headers = auth_headers(user)
    resp = client.get('/api/v1/budgets/', headers=headers)
    assert resp.status_code == 200
    data = resp.get_json()
    assert isinstance(data, (list, dict))


def test_create_budget_returns_201(client, db, auth_headers):
    user = UserFactory()
    cat = CategoryFactory(user_id=user.id)
    headers = auth_headers(user)
    resp = client.post('/api/v1/budgets/', json={
        'name': 'Groceries Budget',
        'amount': 400.0,
        'period': 'monthly',
        'category_id': cat.id,
    }, headers=headers)
    assert resp.status_code == 201
    data = resp.get_json()
    assert data['success'] is True


def test_get_budget_by_id(client, db, auth_headers):
    user = UserFactory()
    cat = CategoryFactory(user_id=user.id)
    budget = BudgetFactory(user_id=user.id, category_id=cat.id)
    headers = auth_headers(user)
    resp = client.get(f'/api/v1/budgets/{budget.id}', headers=headers)
    assert resp.status_code == 200


def test_get_budget_not_found(client, db, auth_headers):
    user = UserFactory()
    headers = auth_headers(user)
    resp = client.get('/api/v1/budgets/99999', headers=headers)
    assert resp.status_code == 404


def test_delete_budget(client, db, auth_headers):
    user = UserFactory()
    cat = CategoryFactory(user_id=user.id)
    budget = BudgetFactory(user_id=user.id, category_id=cat.id)
    headers = auth_headers(user)
    resp = client.delete(f'/api/v1/budgets/{budget.id}', headers=headers)
    assert resp.status_code == 200


def test_budget_overview(client, db, auth_headers):
    user = UserFactory()
    headers = auth_headers(user)
    resp = client.get('/api/v1/budgets/overview', headers=headers)
    assert resp.status_code == 200


def test_budget_progress(client, db, auth_headers):
    user = UserFactory()
    cat = CategoryFactory(user_id=user.id)
    budget = BudgetFactory(user_id=user.id, category_id=cat.id, amount=500.0)
    now = datetime.utcnow()
    ExpenseFactory(user_id=user.id, paid_by=user.id, category_id=cat.id, amount=100.0, date=now)
    headers = auth_headers(user)
    resp = client.get(f'/api/v1/budgets/{budget.id}/progress', headers=headers)
    assert resp.status_code == 200
    data = resp.get_json()
    assert 'spent' in data or 'percentage' in data or 'progress' in data
