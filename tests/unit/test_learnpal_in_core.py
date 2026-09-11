"""learnPal's enablement has TWO readers, and they must not disagree.

*** THIS FILE EXISTS BECAUSE pointsPal SHIPPED THE BUG IT GUARDS AGAINST. ***
`src/models/__init__.py` imports learnPal's models only when
`LearnPalModule().is_enabled()`, and `create_all()` can only build a table whose
model has been imported. So that one `if` decides whether `learn_milestones` and
`learn_completions` exist at all. pointsPal had the same shape and its own test
could never run the default it claimed to cover, because the repo's `.env` set
the variable and `load_dotenv()` ran first.

These drive `is_enabled()` DIRECTLY with monkeypatched environments — no app, no
fixtures, nothing that `tests/conftest.py` has already forced on — which is the
only way to test the DISABLED path from inside a suite that sets
LEARNPAL_ENABLED=true for every other file.
"""

import os
import re

import pytest

from src.modules.learnpal.manifest import LearnPalModule


def test_learnpal_is_OFF_without_any_configuration(monkeypatch):
    # Unlike pointsPal. At C1b this is an engine with no UI, so switching it on
    # for every self-hoster would create two tables and a nightly task in
    # exchange for nothing they can see. C1f is where this flips.
    monkeypatch.delenv('LEARNPAL_ENABLED', raising=False)
    assert LearnPalModule().is_enabled() is False


def test_an_explicit_true_opts_in(monkeypatch):
    monkeypatch.setenv('LEARNPAL_ENABLED', 'true')
    assert LearnPalModule().is_enabled() is True


def test_it_is_case_and_whitespace_tolerant(monkeypatch):
    # An operator writing `LEARNPAL_ENABLED=True ` in a .env file means yes.
    monkeypatch.setenv('LEARNPAL_ENABLED', '  True ')
    assert LearnPalModule().is_enabled() is True


def test_anything_that_is_not_true_is_off(monkeypatch):
    for value in ('false', '0', 'yes', '', 'enabled'):
        monkeypatch.setenv('LEARNPAL_ENABLED', value)
        assert LearnPalModule().is_enabled() is False, value


def test_THE_MODEL_IMPORT_GUARD_READS_THE_SAME_SOURCE_OF_TRUTH():
    """*** THE PIN. ***

    If `src/models/__init__.py` ever grows its own copy of the rule —
    `os.getenv('LEARNPAL_ENABLED') == 'true'`, say — it would disagree with the
    manifest the moment the manifest changed, and the symptom would be a missing
    table rather than a failing assertion. So the guard must call `is_enabled()`
    and nothing else.
    """
    here = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    source = open(os.path.join(here, 'src', 'models', '__init__.py')).read()

    assert '_LearnPalModule().is_enabled()' in source, \
        'the model import guard no longer asks the manifest'
    # And it must not have re-derived the rule locally.
    assert not re.search(r"getenv\(\s*['\"]LEARNPAL_ENABLED", source), \
        'the model import guard reads the env var directly — that is a second ' \
        'source of truth, and pointsPal shipped exactly this'


def test_the_suite_runs_with_learnpal_ENABLED_so_its_tables_exist():
    # Stated rather than assumed. If conftest stops setting this, every
    # learnPal integration test starts erroring on a missing table, and this
    # says why in one line instead of twenty stack traces.
    assert os.environ.get('LEARNPAL_ENABLED') == 'true'
