"""The scheduler must start only when RUN_SCHEDULER is enabled.

**Everything below the first section tests `scheduler_enabled()` as a pure
function, and that is exactly how a live scheduler ran inside this suite for as
long as it did (D-61).** The predicate was always correct. Nothing asked whether
*this test run* had a background thread in it — so the answer stayed "no" by
assumption while it was "yes" in fact. That is this project's "a check that
inspects nothing looks exactly like a check that passes", aimed one level up: the
unit tests here are true statements about a function, not about the suite.

The first test is the one that would have caught it.
"""
import importlib


def _reload_extensions():
    import src.extensions
    return importlib.reload(src.extensions)


# --- the suite's own state, not the predicate's -------------------------------

def test_this_test_run_has_no_background_scheduler(app):
    """No thread may be executing jobs while the suite runs.

    Keyed to `scheduler.running` — whether a thread is *executing* jobs — and
    deliberately NOT to `get_jobs() == []`, which was the obvious spelling and is
    wrong. `setup_scheduled_tasks()` runs the `@scheduler.task` decorators during
    create_app() whether or not `start()` was ever called, so the jobs are
    registered either way; measured with RUN_SCHEDULER=false, `csv_folder_scan` is
    still returned, as `interval[0:05:00], pending`. An empty-list assertion would
    therefore be certifying a claim that is false in both the fixed and the broken
    state — the shape re-keyed in #71.

    Registration is harmless. Execution is not: `csv_folder_scan` is an
    `interval` job on a 5-minute period and the suite takes ~8.5 minutes, so it
    fired in every full run, on a thread sharing one StaticPool'd SQLite
    connection with the request under test.
    """
    from src.extensions import scheduler, scheduler_enabled

    assert scheduler_enabled() is False, (
        'RUN_SCHEDULER is not disabled for this run. tests/conftest.py sets it '
        'before create_app(); app.config cannot, which is D-61.')
    assert scheduler.running is False, (
        f'a background scheduler is RUNNING inside the test suite with '
        f'{len(scheduler.get_jobs())} jobs registered. It shares one SQLite '
        f'connection with every request under test and silently rolls their '
        f'writes back — see D-61.')


def test_the_jobs_are_registered_even_though_none_run(app):
    """The other half, so the test above cannot be "fixed" by unregistering jobs.

    If this ever fails, the scheduled tasks have stopped being registered at all
    and the production scheduler is a no-op — the opposite defect, and one the
    assertion above would happily pass.
    """
    from src.extensions import scheduler

    assert 'csv_folder_scan' in {j.id for j in scheduler.get_jobs()}, (
        'csv_folder_scan is no longer registered; setup_scheduled_tasks() is not '
        'running, so the deployed scheduler would do nothing.')


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
