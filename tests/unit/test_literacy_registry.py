"""The contribution hook — core owns the registry, modules own their entries.

*** IT HAS TWO USERS, WHICH IS WHAT MAKES IT AN INTERFACE. *** learnPal
contributes `has_completed_three_lessons`; pointsPal will contribute its
community acts. A hook built for one exception would be a special case.
"""

import pytest

from src.modules.base import ModuleBase
from src.services.literacy import checks as literacy


@pytest.fixture(autouse=True)
def _restore_registry():
    """The registries are module-level dicts. Snapshot and restore them, or one
    test's contribution leaks into every test that runs after it."""
    checks_before = dict(literacy.CHECKS)
    reasons_before = dict(literacy.CHECK_REASONS)
    yield
    literacy.CHECKS.clear()
    literacy.CHECKS.update(checks_before)
    literacy.CHECK_REASONS.clear()
    literacy.CHECK_REASONS.update(reasons_before)


def test_base_contributes_nothing_by_default():
    assert ModuleBase().get_checks() == {}


def test_a_contribution_becomes_runnable_and_explainable():
    literacy.register_check(
        'always_true', lambda user_id, args=None: True,
        ('Do the thing {n} times', {'n': 3}))

    assert literacy.run_check('always_true', 'anyone@test.com') is True
    assert literacy.check_reason('always_true', {'n': 5}) == 'Do the thing 5 times'


def test_a_name_core_already_owns_is_REFUSED_not_overridden():
    """*** THE ONE THAT MATTERS. *** A module shadowing a core predicate would
    change what a seeded milestone means, invisibly from core."""
    original = literacy.CHECKS['has_active_budget']

    literacy.register_check('has_active_budget', lambda user_id, args=None: True)

    assert literacy.CHECKS['has_active_budget'] is original


def test_an_unknown_check_still_fails_closed():
    assert literacy.run_check('no_such_check', 'anyone@test.com') is False
    assert literacy.check_reason('no_such_check') is None
