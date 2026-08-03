"""
Integration tests for module access gating.

Tests: is_user_enabled default-open (no DB row → True),
explicit disabled row blocks access, explicit enabled row grants access.
"""

import pytest
from src.modules.registry import module_registry
from tests.factories import UserFactory, UserModuleAccessFactory


def test_default_open_no_row(client, db):
    """No UserModuleAccess row → user has access (default-open)."""
    user = UserFactory()
    user_id = user.id
    result = module_registry.is_user_enabled('pointspal', user_id)
    assert result is True


def test_explicit_disabled_row_blocks_access(client, db):
    user = UserFactory()
    user_id = user.id
    UserModuleAccessFactory(user_id=user_id, module_name='pointspal', enabled=False)
    result = module_registry.is_user_enabled('pointspal', user_id)
    assert result is False


def test_explicit_enabled_row_grants_access(client, db):
    user = UserFactory()
    user_id = user.id
    UserModuleAccessFactory(user_id=user_id, module_name='pointspal', enabled=True)
    result = module_registry.is_user_enabled('pointspal', user_id)
    assert result is True


def test_unknown_module_returns_false(client, db):
    result = module_registry.is_user_enabled('nonexistent_module', 'user@test.com')
    assert result is False


def test_login_response_includes_modules_for_enabled_user(client, db):
    """Login response user.modules should include 'pointspal' when enabled."""
    user = UserFactory()
    user_id = user.id
    resp = client.post('/api/v1/auth/login', json={
        'email': user_id, 'password': 'testpassword',
    })
    assert resp.status_code == 200
    data = resp.get_json()
    assert 'modules' in data['user']
    assert isinstance(data['user']['modules'], list)
    assert 'pointspal' in data['user']['modules']
