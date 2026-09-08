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


# These three used to call `importlib.reload(src.extensions)`, and that was both
# unnecessary and actively dangerous. Unnecessary because `scheduler_enabled()`
# reads `os.getenv` at CALL time, so monkeypatching the environment is enough —
# which is how the rate-limit tests below have always done it. Dangerous because
# **reload rebinds `src.extensions.scheduler` to a brand-new APScheduler while the
# original keeps running**: measured, `running=True` before and `running=False`
# after, at a different object id. Any later test doing
# `from src.extensions import scheduler` would then see a stopped scheduler and
# pass while a live one was still in the process — so the gate above was one
# definition-order change away from going permanently blind, which is this
# project's most-repeated failure mode. The same applies to `limiter`, and this is
# the last module-reloading test in the suite.

def test_scheduler_gate_defaults_to_enabled(monkeypatch):
    from src.extensions import scheduler_enabled
    monkeypatch.delenv('RUN_SCHEDULER', raising=False)
    assert scheduler_enabled() is True


def test_scheduler_gate_respects_false(monkeypatch):
    from src.extensions import scheduler_enabled
    monkeypatch.setenv('RUN_SCHEDULER', 'false')
    assert scheduler_enabled() is False


def test_scheduler_gate_accepts_zero(monkeypatch):
    from src.extensions import scheduler_enabled
    monkeypatch.setenv('RUN_SCHEDULER', '0')
    assert scheduler_enabled() is False


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


# --- the report jobs, and why their HOUR is not arbitrary ---------------------
#
# A9. Two claims here, and they are different: that both jobs are registered at
# all (the D-149 shape — a cron that claims a job and does nothing), and that the
# hour they fire at produces a correct period for every user on earth.

from datetime import datetime, timedelta, timezone

REPORT_JOBS = ('weekly_reports', 'monthly_reports')

# Every whole-hour offset that exists, from UTC-12 to UTC+14. `Etc/GMT+N` has the
# sign INVERTED by POSIX convention, so `Etc/GMT+12` is UTC-12 — swept
# mechanically rather than hand-listing cities, so no offset can be forgotten.
ALL_OFFSETS = tuple(f'Etc/GMT{-n:+d}' for n in range(-12, 15))


def _fields(job):
    return {f.name: str(f) for f in job.trigger.fields}


def _job(app, job_id):
    from src.extensions import scheduler
    jobs = {j.id: j for j in scheduler.get_jobs()}
    assert job_id in jobs, (
        f'{job_id} is not registered, so the deployed scheduler will never send '
        f'it. Registered: {sorted(jobs)}')
    return jobs[job_id]


def _fire_instant_utc(app, job_id, on_date):
    """The moment `job_id` fires on `on_date`, in UTC, read from the real trigger.

    Deliberately NOT a literal `13:00`: a test that hardcodes the instant passes
    when somebody changes the cron hour back, which is the exact regression this
    file is here to prevent.
    """
    hour = int(_fields(_job(app, job_id))['hour'])
    minute = int(_fields(_job(app, job_id))['minute'])
    from src.extensions import scheduler
    local = scheduler.timezone.localize(
        datetime(on_date.year, on_date.month, on_date.day, hour, minute)) \
        if hasattr(scheduler.timezone, 'localize') else \
        datetime(on_date.year, on_date.month, on_date.day, hour, minute,
                 tzinfo=scheduler.timezone)
    return local.astimezone(timezone.utc)


def test_both_report_jobs_are_registered(app):
    """D-149 was a registered cron with a one-line `logger.info` body. Registration
    is therefore necessary and nowhere near sufficient — but its absence is fatal,
    and it is what `csv_folder_scan` is already guarded this way for."""
    for job_id in REPORT_JOBS:
        _job(app, job_id)


def test_the_report_jobs_call_the_delivery_service(app):
    """The other half of D-149: a body that only logs looks identical from here.

    Reads the source of the two job functions rather than their registration, so
    "the job exists" cannot stand in for "the job does something".
    """
    import inspect

    from src import setup_scheduled_tasks

    source = inspect.getsource(setup_scheduled_tasks)
    assert source.count('send_reports(') == 2, (
        'one of the report jobs no longer calls send_reports — this is exactly '
        'D-149, where monthly_reports was registered and its body was a single '
        'logger.info line for months.')


def test_the_weekly_job_fires_on_a_monday(app):
    assert _fields(_job(app, 'weekly_reports'))['day_of_week'] == 'mon'


def test_the_monthly_job_fires_on_the_first(app):
    assert _fields(_job(app, 'monthly_reports'))['day'] == '1'


def test_at_the_weekly_jobs_hour_every_timezone_on_earth_agrees(app):
    """*** THE HOUR IS LOAD-BEARING, AND THE OLD ONE WAS WRONG. ***

    Each user's window is resolved in THEIR timezone from the single instant the
    cron fires (design spec trap 10), so the firing hour decides which week a
    westward user is reported on. At the old `hour=1` (06:00 UTC) it was still
    Sunday everywhere west of about UTC-7, so `_weekly` handed those users the
    week before last — a permanent one-week lag, silently, for a whole coast.

    This asserts the property rather than the number: every offset from UTC-12 to
    UTC+14 must resolve to the SAME week, and that week must have ended within
    two days of the fire instant so it is the just-completed one and not a stale
    one. Both halves are needed — "they all agree" is also true of a run that is
    uniformly a week behind.
    """
    from src.services.report.period import resolve_period

    fired = _fire_instant_utc(app, 'weekly_reports', datetime(2026, 9, 7))  # a Monday

    periods = {tz: resolve_period('weekly', fired, tz) for tz in ALL_OFFSETS}
    distinct = {p for p in periods.values()}
    assert len(distinct) == 1, (
        'the weekly report covers different weeks depending on the reader\'s '
        f'timezone: { {tz: p.label for tz, p in periods.items()} }')

    period = distinct.pop()
    gap = fired.date() - period.end
    assert timedelta(0) <= gap <= timedelta(days=2), (
        f'the weekly report covers {period.label}, which ended {gap.days} days '
        f'before the run — that is a stale period, not the last complete one')


def test_at_the_monthly_jobs_hour_every_timezone_on_earth_agrees(app):
    """Same property, and the monthly failure was the uglier one: at `hour=1` a
    Pacific user's 1st-of-October report covered **August**, because 06:00 UTC on
    the 1st is 22:00 on the last day of September in UTC-8."""
    from src.services.report.period import resolve_period

    fired = _fire_instant_utc(app, 'monthly_reports', datetime(2026, 10, 1))

    periods = {tz: resolve_period('monthly', fired, tz) for tz in ALL_OFFSETS}
    distinct = {p for p in periods.values()}
    assert len(distinct) == 1, (
        'the monthly report covers different months depending on the reader\'s '
        f'timezone: { {tz: p.label for tz, p in periods.items()} }')

    period = distinct.pop()
    assert period.label == 'September 2026', (
        f'a run on 1 October reported on {period.label}, not the month that just '
        f'ended')


def test_the_old_firing_hour_really_did_disagree(app):
    """The failure the two tests above exist to prevent, reproduced.

    Without this, a helper that returned one period for every input would make
    them both pass while measuring nothing — the same argument as
    `test_the_maths_reproduces_the_failures_that_prompted_this` in the email
    contrast gate. `hour=1` is the value that shipped in `monthly_reports` from
    before this feature existed.
    """
    from src.services.report.period import resolve_period
    from src.extensions import scheduler

    old = datetime(2026, 10, 1, 1, 0)
    old = (scheduler.timezone.localize(old)
           if hasattr(scheduler.timezone, 'localize')
           else old.replace(tzinfo=scheduler.timezone)).astimezone(timezone.utc)

    labels = {resolve_period('monthly', old, tz).label for tz in ALL_OFFSETS}
    assert len(labels) > 1, (
        'hour=1 no longer splits the world, so either the scheduler timezone or '
        'resolve_period changed and the comment above is now misleading')
    assert 'August 2026' in labels, labels
