"""
Unit tests for ModuleBase.

Tests: is_enabled reads env var, is_user_enabled default-open behaviour,
is_user_enabled respects explicit DB row.
"""

import pytest
from src.modules.base import ModuleBase
from tests.factories import UserFactory, UserModuleAccessFactory


class ConcreteModule(ModuleBase):
    name = 'mymod'
    enabled_env = 'MYMOD_ENABLED'


def test_is_enabled_true_when_env_set(monkeypatch):
    monkeypatch.setenv('MYMOD_ENABLED', 'true')
    assert ConcreteModule().is_enabled() is True


def test_is_enabled_false_when_env_missing(monkeypatch):
    monkeypatch.delenv('MYMOD_ENABLED', raising=False)
    assert ConcreteModule().is_enabled() is False


def test_is_enabled_false_when_env_false(monkeypatch):
    monkeypatch.setenv('MYMOD_ENABLED', 'false')
    assert ConcreteModule().is_enabled() is False


def test_is_user_enabled_default_open_when_no_row(app, db):
    """No UserModuleAccess row → True (default-open)."""
    with app.app_context():
        user = UserFactory()
        mod = ConcreteModule()
        assert mod.is_user_enabled(user.id) is True


def test_is_user_enabled_respects_enabled_row(app, db):
    with app.app_context():
        user = UserFactory()
        UserModuleAccessFactory(user_id=user.id, module_name='mymod', enabled=True)
        mod = ConcreteModule()
        assert mod.is_user_enabled(user.id) is True


def test_is_user_enabled_respects_disabled_row(app, db):
    with app.app_context():
        user = UserFactory()
        UserModuleAccessFactory(user_id=user.id, module_name='mymod', enabled=False)
        mod = ConcreteModule()
        assert mod.is_user_enabled(user.id) is False
