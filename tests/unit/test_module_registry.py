"""
Unit tests for ModuleRegistry.

Tests: register (enabled/disabled), dispatch_event isolation,
background_sync isolation, is_user_enabled delegation.
"""

import pytest
from unittest.mock import MagicMock
from src.modules.registry import ModuleRegistry
from src.modules.base import ModuleBase


class AlwaysOnModule(ModuleBase):
    name = 'test_on'
    enabled_env = 'TEST_ON_ENABLED'

    def is_enabled(self):
        return True


class AlwaysOffModule(ModuleBase):
    name = 'test_off'
    enabled_env = 'TEST_OFF_ENABLED'

    def is_enabled(self):
        return False


class BrokenEventModule(AlwaysOnModule):
    name = 'test_broken'

    def on_event(self, event_name, **kwargs):
        raise RuntimeError("boom")


class SpyModule(AlwaysOnModule):
    name = 'test_spy'

    def __init__(self):
        self.events = []
        self.syncs = []

    def on_event(self, event_name, **kwargs):
        self.events.append(event_name)

    def on_background_sync(self, app, user_id):
        self.syncs.append(user_id)


def test_register_enabled_module():
    registry = ModuleRegistry()
    registry.register(AlwaysOnModule())
    assert len(registry.modules) == 1
    assert registry.modules[0].name == 'test_on'


def test_register_disabled_module_is_skipped():
    registry = ModuleRegistry()
    registry.register(AlwaysOffModule())
    assert len(registry.modules) == 0


def test_dispatch_event_reaches_module():
    registry = ModuleRegistry()
    spy = SpyModule()
    registry.register(spy)
    registry.dispatch_event('expense_created', amount=50)
    assert 'expense_created' in spy.events


def test_dispatch_event_does_not_raise_on_module_error():
    """A broken module must never crash the caller."""
    registry = ModuleRegistry()
    registry.register(BrokenEventModule())
    # Should not raise
    registry.dispatch_event('expense_created')


def test_dispatch_event_continues_after_broken_module():
    """Broken module doesn't stop subsequent modules from receiving event."""
    registry = ModuleRegistry()
    registry.register(BrokenEventModule())
    spy = SpyModule()
    registry.register(spy)
    registry.dispatch_event('expense_created')
    assert 'expense_created' in spy.events


def test_background_sync_reaches_module():
    registry = ModuleRegistry()
    spy = SpyModule()
    registry.register(spy)
    app = MagicMock()
    registry.background_sync(app, 'user@test.com')
    assert 'user@test.com' in spy.syncs


def test_is_user_enabled_returns_false_for_unknown_module():
    registry = ModuleRegistry()
    assert registry.is_user_enabled('nonexistent', 'user@test.com') is False


def test_is_user_enabled_delegates_to_module(app, db):
    """is_user_enabled calls module.is_user_enabled inside app context."""
    with app.app_context():
        registry = ModuleRegistry()
        mod = AlwaysOnModule()
        registry.register(mod)
        # No UserModuleAccess row → default-open → True
        result = registry.is_user_enabled('test_on', 'any@user.com')
        assert result is True
