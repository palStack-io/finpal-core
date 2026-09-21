"""The module boundary, pinned.

*** A BOUNDARY NOTHING CHECKS IS A CONVENTION, AND CONVENTIONS DRIFT. *** The
predicates lived in an optional module for four milestones before anybody
noticed that hiding learnPal cost a user the engine that rewards them for
understanding their own money. This fails the moment that starts happening
again.

Keyed on the IMPORT GRAPH rather than on a list of names, because a guard keyed
to a spelling goes blind the moment somebody renames something -- that has
bitten this project twice, and it bit again while this very milestone was being
built: a sweep for `from src.modules.learnpal.checks import ...` did not see
`from src.modules.learnpal import checks`, and nine tests failed two commits
later. `ast` sees both, because it parses rather than matches.
"""

import ast
import pathlib

CORE_CHECKS = pathlib.Path('src/services/literacy/checks.py')
LEARNPAL_CHECKS = pathlib.Path('src/modules/learnpal/checks.py')


# *** THE ALLOWLIST IS A DICT SO ADDING AN ENTRY FORCES YOU TO WRITE DOWN WHY. ***
# A bare list of paths is a rule nobody can argue with later; a reason is.
ALLOWED = {
    'src/modules/learnpal/checks.py':
        "the module's own file",
    'src/modules/learnpal/manifest.py':
        'the deliberate contribution hook — this is the ONE production reference',
    'tests/unit/test_literacy_registry.py':
        'asserts WHICH function holds the slug, so a future core predicate with '
        'the same name cannot quietly take it over. That assertion cannot be '
        'written without importing the module function.',
}


def _imported_modules(path):
    """Every module name this file imports, in BOTH import shapes.

    `from a.b import c` yields `a.b`; `import a.b` yields `a.b`. A name imported
    as `from a import b` yields `a`, which is why the caller checks prefixes
    rather than equality.
    """
    tree = ast.parse(path.read_text())
    out = set()
    for node in ast.walk(tree):
        if isinstance(node, ast.ImportFrom) and node.module:
            out.add(node.module)
            # `from src.modules.learnpal import checks` — the module is the
            # PACKAGE and the interesting part is the name. Record both.
            for alias in node.names:
                out.add(f'{node.module}.{alias.name}')
        elif isinstance(node, ast.Import):
            out.update(a.name for a in node.names)
    return out


def test_core_predicates_import_nothing_from_any_module():
    """Core must not depend on an optional module, in either direction."""
    offenders = {m for m in _imported_modules(CORE_CHECKS)
                 if m.startswith('src.modules.')}
    assert offenders == set(), (
        f'{CORE_CHECKS} imports from an optional module: {sorted(offenders)}. '
        "A predicate that needs a module's tables belongs in that module and "
        'registers through ModuleBase.get_checks().')


def test_learnpals_own_predicate_file_holds_exactly_one_predicate():
    """If a second one appears here, ask whether its subject is really a lesson."""
    tree = ast.parse(LEARNPAL_CHECKS.read_text())
    fns = [n.name for n in tree.body
           if isinstance(n, ast.FunctionDef) and not n.name.startswith('_')]
    assert fns == ['has_completed_three_lessons'], (
        f'learnPal now defines {fns}. Only a predicate whose SUBJECT is a '
        "lesson belongs here; anything reading Account, Category, Budget, "
        "Expense or Goal is core's.")


def test_the_core_registry_holds_the_twelve_that_moved():
    from src.services.literacy.checks import CHECKS
    expected = {
        'categorised_transactions_at_least', 'has_active_budget',
        'categories_classified_at_least', 'credit_utilisation_below',
        'has_debt_account_with_a_rate', 'has_two_months_of_income',
        'has_debt_account_and_income', 'has_two_or_more_debt_accounts',
        'has_debt_and_no_savings_goal', 'has_non_monthly_spending',
        'has_recurring_income', 'has_buffer_and_debt',
    }
    assert expected <= set(CHECKS), (
        f'missing from the core registry: {sorted(expected - set(CHECKS))}')


def test_nothing_outside_learnpal_imports_learnpals_checks():
    """*** THE GUARD THAT WOULD HAVE CAUGHT THE MISS, IN BOTH IMPORT SHAPES. ***

    `from src.modules.learnpal.checks import run_check` and
    `from src.modules.learnpal import checks` are the same dependency written
    two ways, and a grep for one does not see the other.
    """
    offenders = []
    for path in pathlib.Path('.').glob('**/*.py'):
        parts = path.parts
        if '__pycache__' in parts or 'venv' in parts or 'migrations' in parts:
            continue
        if str(path) in ALLOWED:
            continue
        try:
            imports = _imported_modules(path)
        except SyntaxError:
            continue
        if 'src.modules.learnpal.checks' in imports:
            offenders.append(str(path))
    assert offenders == [], (
        f'these import learnPal\'s checks: {offenders}. Twelve of the thirteen '
        'predicates are core\'s and live in src/services/literacy/checks.py.')


# ══════════════════════════════════════════════════════════════════════
# Added 2026-09-17: the boundary covers the whole literacy package, not
# just `checks.py`.
# ══════════════════════════════════════════════════════════════════════

CORE_LITERACY = pathlib.Path('src/services/literacy')

# *** ONE FILE MAY IMPORT A MODULE, AND IT IS AN OWNER DECISION, NOT AN
# OVERSIGHT. *** `everest.py` reads learnPal's completions because the owner
# chose that altitude is coins PLUS lessons (§14.10, taken against my
# recommendation). It is guarded: the import sits inside a `try` and a missing
# or empty learnPal returns a lesson fraction of 0, so Everest works with the
# module switched off. Declared here so the exception is visible and the rest
# of the package stays closed.
MAY_IMPORT_A_MODULE = {
    'everest.py': 'owner decision §14.10 — lessons lift altitude; guarded by '
                  'try/except so a missing learnPal returns 0',
}


def test_the_WHOLE_literacy_package_imports_nothing_from_a_module():
    """*** THE ORIGINAL GUARD ONLY COVERED `checks.py`. ***

    It was written when `checks.py` was the only core literacy file. The
    package now holds `acts.py`, `coverage.py`, `payoff.py`, `gear.py`,
    `teaching.py`, `badges.py` and `everest.py`, and the same rule applies to
    all of them: a predicate that needs a module's tables belongs in that
    module and registers through a hook.

    `badges.py` is why this was widened — pointsPal's contributor badges read
    its card tables, and putting them in core would have been the easy wrong
    move.
    """
    offenders = {}
    for path in sorted(CORE_LITERACY.glob('*.py')):
        if path.name in MAY_IMPORT_A_MODULE:
            continue
        bad = {m for m in _imported_modules(path)
               if m.startswith('src.modules.')}
        if bad:
            offenders[path.name] = sorted(bad)

    assert offenders == {}, (
        f'core literacy files import from an optional module: {offenders}. '
        'A predicate that needs a module\'s tables belongs in that module and '
        'registers through get_checks(), get_acts() or get_badges().')


def test_NO_STALE_EXEMPTION_IN_THE_BOUNDARY():
    """A file declared as importing a module that no longer does. A stale
    exemption is how a guard quietly stops covering things."""
    stale = []
    for name in MAY_IMPORT_A_MODULE:
        path = CORE_LITERACY / name
        if not path.exists():
            stale.append(f'{name} (file gone)')
            continue
        if not {m for m in _imported_modules(path)
                if m.startswith('src.modules.')}:
            stale.append(f'{name} (no longer imports a module)')
    assert stale == [], f'stale boundary exemptions: {stale} — delete them'


def test_pointspals_badges_live_in_pointspal():
    """The positive half: the badges exist, in the module, not in core."""
    assert pathlib.Path('src/modules/pointspal/badges.py').exists()
    core_badges = (CORE_LITERACY / 'badges.py').read_text()
    for slug in ("'first-light'", "'cairn-builder'", "'map-maker'"):
        assert slug not in core_badges, (
            f'{slug} is hardcoded in core badges.py; it needs pointsPal tables')
