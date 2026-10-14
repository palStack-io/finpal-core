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


@pytest.mark.parametrize("kind,pct,next_step", [
    ("capped", 100, "Review your cards to choose where to put your next purchase."),
    ("warning_95", 95, "Review the cap before your next purchase."),
    ("warning_80", 80, "Review the cap before your next purchase."),
])
def test_persisted_alert_preserves_data_and_gives_next_step(client, db, auth_headers, kind, pct, next_step):
    from src.modules.pointspal.models import UserCard, OptimizerAlert
    user = UserFactory()
    card = UserCard(user_id=user.id, card_nickname="My everyday card")
    db.session.add(card)
    db.session.flush()
    alert = OptimizerAlert(user_id=user.id, user_card_id=card.id, category="groceries", period_type="monthly", period_key="2026-10", alert_type=kind, pct_used=pct)
    db.session.add(alert)
    db.session.commit()
    response = client.get("/api/v1/pointspal/alerts", headers=auth_headers(user))
    assert response.status_code == 200
    item = next(x for x in response.get_json() if x["id"] == alert.id)
    assert item["type"] == kind and item["dismissed"] is False
    assert "Groceries" in item["message"] and "My everyday card" in item["message"]
    assert next_step in item["message"]
    if kind != "capped":
        assert f"{pct}%" in item["message"]
