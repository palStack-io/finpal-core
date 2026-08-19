"""
A handler that answers "Internal server error" must say so in the log.

This is the reason palStack-io/finpal-core#124 took a screenshot to diagnose. The reporter
saw **"Internal server error"** in the Add Transaction dialog and attached the only backend
line their container produced:

    INFO:src.utils.rule_engine:Applying 0 rules for user mattia.bruno@my.email

That line is benign. The exception that actually failed the request was caught by

    except Exception as e:
        db.session.rollback()
        return {'success': False, 'error': 'Internal server error'}, 400

which binds the exception, **discards it**, and logs nothing — so the one artifact that
would have identified the fault never existed. The underlying cause turned out to be
D-121 (their `expenses` table has no `notes` column, so the INSERT raised), and it was
reproducible in ten seconds once known and unguessable until then.

**24 handlers across eight route modules were doing this**, and every one of those modules
already defined a `logger` it never used in them. That is what makes it a class rather
than an oversight, and why the guard is a sweep.

WHAT THIS DELIBERATELY DOES NOT REQUIRE:

  * A narrow `except ValueError` that returns a specific, useful message is fine and is not
    swept. `except (TypeError, ValueError) -> 'expires_in_days must be a number'` tells the
    caller exactly what to fix; there is nothing for an operator to investigate.
  * `except SomeDomainError -> validation_error_response(exc.errors)` likewise. The
    exception IS the response.

The line being drawn is: **if the answer is the generic "Internal server error", nobody
downstream can act on it, so the log is the only place the information can go.**

NOT FIXED HERE, AND WORTH A DECISION: most of these return **400** for a server-side
failure, which tells the client its request was malformed when it was not. That misled this
investigation twice — #123's genuine 400 and #124's fake one look identical in an nginx
log. Changing them to 500 is a behaviour change for every client and belongs in its own
commit, so this file pins the logging only.
"""

import ast
from pathlib import Path

import pytest

API_ROOT = Path(__file__).resolve().parents[2] / 'api'

GENERIC = 'Internal server error'
LOG_MARKERS = ('logger.', 'current_app.logger', 'logging.', 'log.')


def _handlers():
    """Every `except` block in api/, with the source of its body."""
    found = []
    for path in sorted(API_ROOT.rglob('*.py')):
        tree = ast.parse(path.read_text())
        for node in ast.walk(tree):
            if isinstance(node, ast.ExceptHandler):
                found.append((path, node))
    return found


def test_there_are_handlers_to_check():
    """Guard against the sweep passing because it walked nothing."""
    handlers = _handlers()
    assert len(handlers) > 30, f'expected many except-handlers under api/, found {len(handlers)}'


def test_no_handler_answers_internal_server_error_without_logging():
    offenders = []
    checked = 0

    for path, node in _handlers():
        body = ast.unparse(node)
        if GENERIC not in body:
            continue
        checked += 1
        if any(marker in body for marker in LOG_MARKERS):
            continue
        if any(isinstance(n, ast.Raise) for n in ast.walk(node)):
            continue  # re-raised, so something above it will log
        offenders.append(f'{path.relative_to(API_ROOT.parent)}:{node.lineno}')

    assert checked > 0, (
        "found no handler returning 'Internal server error' at all — the string has "
        'probably been reworded, and this gate is now blind'
    )
    assert offenders == [], (
        'these answer "Internal server error" and leave no trace for an operator to '
        'read, which is what made #124 undiagnosable:\n  ' + '\n  '.join(offenders)
    )


@pytest.mark.parametrize('module', [
    'accounts', 'budgets', 'categories', 'groups',
    'investments', 'recurring', 'transaction_rules', 'transactions',
])
def test_each_route_module_defines_the_logger_it_uses(module):
    """
    Every one of these already had a module logger and never called it in the handlers
    above. Asserting it exists keeps the fix from being reverted by deleting the logger
    instead of the call.
    """
    source = (API_ROOT / 'v1' / f'{module}.py').read_text()
    assert 'logger = logging.getLogger' in source, f'{module}.py defines no logger'
    assert 'logger.exception(' in source, f'{module}.py never calls logger.exception'
