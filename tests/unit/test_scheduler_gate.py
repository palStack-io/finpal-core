"""The scheduler must start only when RUN_SCHEDULER is enabled."""
import importlib


def _reload_extensions():
    import src.extensions
    return importlib.reload(src.extensions)


def test_scheduler_gate_defaults_to_enabled(monkeypatch):
    monkeypatch.delenv('RUN_SCHEDULER', raising=False)
    ext = _reload_extensions()
    assert ext.scheduler_enabled() is True


def test_scheduler_gate_respects_false(monkeypatch):
    monkeypatch.setenv('RUN_SCHEDULER', 'false')
    ext = _reload_extensions()
    assert ext.scheduler_enabled() is False


def test_scheduler_gate_accepts_zero(monkeypatch):
    monkeypatch.setenv('RUN_SCHEDULER', '0')
    ext = _reload_extensions()
    assert ext.scheduler_enabled() is False


# --- rate limit storage ------------------------------------------------------

def test_rate_limit_storage_defaults_to_memory(monkeypatch):
    from src.extensions import rate_limit_storage_uri
    monkeypatch.delenv('RATELIMIT_STORAGE_URI', raising=False)
    assert rate_limit_storage_uri() == 'memory://'


def test_rate_limit_storage_honours_the_env_var(monkeypatch):
    from src.extensions import rate_limit_storage_uri
    monkeypatch.setenv('RATELIMIT_STORAGE_URI', 'redis://cache:6379/0')
    assert rate_limit_storage_uri() == 'redis://cache:6379/0'


def test_blank_storage_uri_falls_back_rather_than_breaking_boot(monkeypatch):
    """An empty env var is a very common compose mistake."""
    from src.extensions import rate_limit_storage_uri
    monkeypatch.setenv('RATELIMIT_STORAGE_URI', '   ')
    assert rate_limit_storage_uri() == 'memory://'


def test_memory_storage_warns_that_limits_are_per_process(monkeypatch, caplog):
    """Silently enforcing 3x the documented limit looks fixed when it is not."""
    import logging

    from flask import Flask

    from src.extensions import _warn_if_rate_limits_are_per_process

    monkeypatch.delenv('RATELIMIT_STORAGE_URI', raising=False)
    app = Flask('probe')
    with caplog.at_level(logging.WARNING, logger=app.logger.name):
        _warn_if_rate_limits_are_per_process(app)
    assert any('process memory' in r.message for r in caplog.records), caplog.text


def test_shared_storage_does_not_warn(monkeypatch, caplog):
    import logging

    from flask import Flask

    from src.extensions import _warn_if_rate_limits_are_per_process

    monkeypatch.setenv('RATELIMIT_STORAGE_URI', 'redis://cache:6379/0')
    app = Flask('probe')
    with caplog.at_level(logging.WARNING, logger=app.logger.name):
        _warn_if_rate_limits_are_per_process(app)
    assert not [r for r in caplog.records if r.levelno >= logging.WARNING], caplog.text
