"""
Integration tests for transactions API.

Tests: list (authed/unauthed), create, get by id, update, delete.
All requests use JWT Bearer tokens from auth_headers fixture.
"""

import pytest
from tests.factories import UserFactory, CategoryFactory, ExpenseFactory


def test_list_transactions_requires_auth(client, db):
    resp = client.get('/api/v1/transactions')
    assert resp.status_code == 401


def test_list_transactions_returns_200(client, db, auth_headers):
    user = UserFactory()
    headers = auth_headers(user)
    resp = client.get('/api/v1/transactions', headers=headers)
    assert resp.status_code == 200
    data = resp.get_json()
    assert isinstance(data, (list, dict))


def test_create_transaction_returns_201(client, db, auth_headers):
    user = UserFactory()
    cat = CategoryFactory(user_id=user.id)
    headers = auth_headers(user)
    resp = client.post('/api/v1/transactions', json={
        'description': 'Coffee',
        'amount': 4.50,
        'date': '2026-03-01',
        'category_id': cat.id,
        'transaction_type': 'expense',
        # Was 'none', which no client offers and `TransactionInput`'s OneOf has
        # never accepted. It only passed because the unvalidated legacy blueprint
        # served this slash-less path; now that restx serves both spellings the
        # payload is validated. The model's `split_method == 'none'` branch is
        # reachable only for legacy rows and is equivalent to its own
        # `or not self.split_with`, so the schema is right and this test was
        # asserting on a value nothing writes.
        'split_method': 'equal',
    }, headers=headers)
    assert resp.status_code == 201, resp.get_data(as_text=True)[:300]


def test_create_transaction_requires_auth(client, db):
    resp = client.post('/api/v1/transactions', json={
        'description': 'Coffee', 'amount': 4.50, 'date': '2026-03-01',
    })
    assert resp.status_code == 401


def test_get_transaction_by_id(client, db, auth_headers):
    user = UserFactory()
    expense = ExpenseFactory(user_id=user.id, paid_by=user.id, amount=20.0)
    headers = auth_headers(user)
    resp = client.get(f'/api/v1/transactions/{expense.id}', headers=headers)
    assert resp.status_code == 200


def test_get_transaction_not_found(client, db, auth_headers):
    user = UserFactory()
    headers = auth_headers(user)
    resp = client.get('/api/v1/transactions/99999', headers=headers)
    assert resp.status_code == 404


def test_delete_transaction(client, db, auth_headers):
    user = UserFactory()
    expense = ExpenseFactory(user_id=user.id, paid_by=user.id)
    headers = auth_headers(user)
    resp = client.delete(f'/api/v1/transactions/{expense.id}', headers=headers)
    assert resp.status_code == 200


def test_update_transaction(client, db, auth_headers):
    user = UserFactory()
    expense = ExpenseFactory(user_id=user.id, paid_by=user.id, amount=10.0)
    headers = auth_headers(user)
    resp = client.put(f'/api/v1/transactions/{expense.id}', json={
        'description': 'Updated', 'amount': 15.0, 'date': '2026-03-01',
    }, headers=headers)
    assert resp.status_code == 200
