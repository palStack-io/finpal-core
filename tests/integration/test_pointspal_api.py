"""
Integration tests for pointsPal API.

Tests: wallet cards (list, create), optimizer, alerts, overview.
All require JWT auth.
"""

import pytest
from tests.factories import UserFactory


def test_wallet_cards_requires_auth(client, db):
    resp = client.get('/api/v1/wallet/cards')
    assert resp.status_code == 401


def test_wallet_cards_list_empty(client, db, auth_headers):
    user = UserFactory()
    headers = auth_headers(user)
    resp = client.get('/api/v1/wallet/cards', headers=headers)
    assert resp.status_code == 200
    data = resp.get_json()
    assert isinstance(data, list)
    assert data == []


def test_wallet_alerts_requires_auth(client, db):
    resp = client.get('/api/v1/wallet/alerts')
    assert resp.status_code == 401


def test_wallet_alerts_list_empty(client, db, auth_headers):
    user = UserFactory()
    headers = auth_headers(user)
    resp = client.get('/api/v1/wallet/alerts', headers=headers)
    assert resp.status_code == 200
    data = resp.get_json()
    assert isinstance(data, list)


def test_pointspal_overview_requires_auth(client, db):
    resp = client.get('/api/v1/pointspal/overview')
    assert resp.status_code == 401


def test_pointspal_overview_returns_200(client, db, auth_headers):
    user = UserFactory()
    headers = auth_headers(user)
    resp = client.get('/api/v1/pointspal/overview', headers=headers)
    assert resp.status_code == 200


def test_optimizer_requires_auth(client, db):
    resp = client.get('/api/v1/optimizer')
    assert resp.status_code == 401


def test_optimizer_returns_empty_for_user_with_no_cards(client, db, auth_headers):
    user = UserFactory()
    headers = auth_headers(user)
    resp = client.get('/api/v1/optimizer', headers=headers)
    assert resp.status_code == 200
    data = resp.get_json()
    assert isinstance(data, list)
    assert data == []


def test_pointspal_alerts_returns_200(client, db, auth_headers):
    user = UserFactory()
    headers = auth_headers(user)
    resp = client.get('/api/v1/pointspal/alerts', headers=headers)
    assert resp.status_code == 200
