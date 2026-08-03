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
