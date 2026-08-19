"""
pointsPal ships as part of core, not as something to switch on.

It was written on both sides and shipped on neither. The backend module, its seven
tables, thirty routes and the whole web-ui half — `web-ui/src/modules/pointspal/`,
a sidebar entry, a Settings tab, its own vitest suites — were all complete, while
the deployed instance served **none** of it: `swagger.json` on the deployed host had
94 paths and not one of them pointsPal's.

The reason it was invisible is the reason this file checks two different readers.
`ModuleBase.is_enabled()` defaulted to off, *and* `docker-compose.yml` passed
`"${POINTSPAL_ENABLED:-false}"`, which forces the variable to the literal string
"false" when an operator has not set it. Fixing only the Python default would leave
production exactly as it was, and a test that only imported Python would have gone
green while nothing changed on the deploy. Both readers are asserted here.

Being enabled by default is not the same as being mandatory: an operator can still
set POINTSPAL_ENABLED=false, and a user can still be revoked through
`user_module_access`. Both of those are asserted too, so "in core" never quietly
becomes "cannot be turned off".
"""

import os
import re
import sys
from pathlib import Path

import pytest

from src.modules.pointspal.manifest import PointsPalModule


REPO_ROOT = Path(__file__).resolve().parents[2]


# ── The module's own default ───────────────────────────────────────────────────

def test_pointspal_is_enabled_without_any_configuration(monkeypatch):
    """A fresh self-hoster who has never heard of POINTSPAL_ENABLED still gets it."""
    monkeypatch.delenv('POINTSPAL_ENABLED', raising=False)
    assert PointsPalModule().is_enabled() is True


def test_pointspal_honours_an_explicit_opt_out(monkeypatch):
    """In core by default, but an operator can still decline it."""
    monkeypatch.setenv('POINTSPAL_ENABLED', 'false')
    assert PointsPalModule().is_enabled() is False


def test_a_module_that_does_not_opt_in_is_still_off_by_default(monkeypatch):
    """
    The default flipped for pointsPal specifically, not for every module. A future
    module must still declare itself part of core to be on without configuration.
    """
    from src.modules.base import ModuleBase

    class SomeOtherModule(ModuleBase):
        name = 'othermod'
        enabled_env = 'OTHERMOD_ENABLED'

    monkeypatch.delenv('OTHERMOD_ENABLED', raising=False)
    assert SomeOtherModule().is_enabled() is False


# ── The deployment's reader, which is what actually kept it off ───────────────

def _compose_files():
    return sorted(REPO_ROOT.glob('docker-compose*.yml'))


def test_there_is_at_least_one_compose_file_to_check():
    """Guard against the sweep below passing because it found nothing."""
    assert _compose_files(), 'expected docker-compose*.yml at the repo root'


@pytest.mark.parametrize('compose', _compose_files(), ids=lambda p: p.name)
def test_no_compose_file_forces_pointspal_off(compose):
    """
    A compose file may leave POINTSPAL_ENABLED alone or default it to true, but it
    may not hand the container a literal "false" — that is what made the code
    default irrelevant in production.
    """
    text = compose.read_text()
    offenders = [
        line.strip()
        for line in text.splitlines()
        if 'POINTSPAL_ENABLED' in line
        # `${POINTSPAL_ENABLED:-false}` or `POINTSPAL_ENABLED: "false"`
        and re.search(r':-\s*false|[:=]\s*["\']?false["\']?\s*$', line, re.IGNORECASE)
    ]
    assert offenders == [], (
        f'{compose.name} forces pointsPal off, which overrides the code default: '
        f'{offenders}'
    )


# ── The routes actually reach the url_map ─────────────────────────────────────

def test_every_namespace_pointspal_declares_is_served(app):
    """
    Keyed to the manifest rather than to a list of paths, so a namespace added to
    the module later is covered without editing this test.
    """
    declared_prefixes = [path for _ns, path in PointsPalModule().get_namespaces()]
    assert declared_prefixes, 'the manifest declares no namespaces'

    served = {str(rule) for rule in app.url_map.iter_rules()}

    for prefix in declared_prefixes:
        matching = [r for r in served if r.startswith(f'/api/v1{prefix}')]
        assert matching, (
            f'PointsPalModule declares namespace {prefix!r} but no rule under '
            f'/api/v1{prefix} is in the url_map'
        )


def _declared_pointspal_tables():
    """
    Every table the module's models declare, read off the models themselves.

    Keyed to the module rather than to a hand-written list: the hand-written list
    named three of the eight tables, and `optimizer_alerts` — the one a real
    instance actually 500ed on (#122) — was not among them.
    """
    import inspect as _inspect

    from src.extensions import db as _db
    from src.modules.pointspal import models as pp_models

    return {
        obj.__tablename__
        for _name, obj in _inspect.getmembers(pp_models, _inspect.isclass)
        if issubclass(obj, _db.Model) and obj is not _db.Model
        and getattr(obj, '__tablename__', None)
    }


def test_pointspal_declares_the_tables_this_file_thinks_it_does():
    """Guard against the sweep below passing because it found nothing."""
    tables = _declared_pointspal_tables()
    assert len(tables) >= 8, f'expected pointsPal to declare 8+ tables, found {tables}'
    assert 'optimizer_alerts' in tables


def test_pointspal_tables_are_created_by_the_schema_bootstrap(app, db):
    """
    Production has no alembic_version row — the schema comes from db.create_all()
    at boot. So the module's models must be imported by the time that runs, or
    enabling the routes would 500 on tables that do not exist.

    EVERY declared table, not a sample. #122 was `optimizer_alerts` specifically,
    and the three-table sample here missed it.
    """
    from sqlalchemy import inspect

    from src.extensions import db as _db

    with app.app_context():
        tables = set(inspect(_db.engine).get_table_names())

    missing = sorted(_declared_pointspal_tables() - tables)
    assert missing == [], f'create_all() did not build: {missing}'


# ── The two readers must agree, with no .env in reach ──────────────────────────
#
# This is the guard that #122 needed and did not have.
#
# `src/models/__init__.py` decides whether to import the module's models, and
# `ModuleBase.is_enabled()` decides whether to register its routes. When those two
# disagree you get a live API on a schema with no tables — a 500 on the dashboard
# at login, which is what a self-hoster reported.
#
# Everything above runs in-process, and in-process is exactly why the old suite
# was green: `src/config.py` calls `load_dotenv()`, this repo's `.env` sets
# POINTSPAL_ENABLED=true, and the models gate is evaluated once at import time. So
# the suite only ever exercised the true branch while the reported failure needed
# the variable to be ABSENT. monkeypatch cannot help — the import has already
# happened by the time a test body runs.
#
# So this runs a fresh interpreter, from a directory that contains no .env, with
# the variable genuinely unset.

READERS_PROBE = """
import json, os, sys
from src.modules.pointspal.manifest import PointsPalModule
import src.models  # noqa: F401  -- evaluates the models gate at import time
from src.extensions import db
print(json.dumps({
    'routes_enabled': PointsPalModule().is_enabled(),
    'models_imported': 'optimizer_alerts' in db.metadata.tables,
}))
"""


def _probe_readers(tmp_path, raw):
    """Run both readers in a clean interpreter with no .env on the search path."""
    import json
    import subprocess

    env = {
        k: v for k, v in os.environ.items()
        # Let the child find the venv and the repo, drop the flag and anything
        # that would make load_dotenv() succeed from the temp cwd.
        if k not in ('POINTSPAL_ENABLED',)
    }
    env['PYTHONPATH'] = str(REPO_ROOT)
    if raw is not None:
        env['POINTSPAL_ENABLED'] = raw

    proc = subprocess.run(
        [sys.executable, '-c', READERS_PROBE],
        cwd=str(tmp_path), env=env, capture_output=True, text=True, timeout=120,
    )
    assert proc.returncode == 0, f'probe failed:\n{proc.stdout}\n{proc.stderr}'
    return json.loads(proc.stdout.strip().splitlines()[-1])


def test_the_probe_cannot_pick_up_a_dotenv(tmp_path):
    """
    The probe below is only meaningful if `load_dotenv()` finds nothing from the child's
    cwd. It searches from cwd UPWARD, so this walks the whole parent chain.

    *** AN EARLIER VERSION OF THIS TEST ASSERTED `(REPO_ROOT / '.env').exists()`, AND IT
    FAILED ON CI ON BOTH PYTHON VERSIONS WHILE PASSING ON EVERY DEVELOPER MACHINE. ***
    The reasoning was that this repo's `.env` is the thing the probe must escape, so its
    absence would make the probe vacuous. But `.env` is gitignored, so a fresh checkout has
    none, and the assertion was really "this is a machine where somebody has run the app".

    That is the same class of mistake as the defect this whole file exists to catch: a
    check keyed to one environment, quietly asserting something about the machine rather
    than about the code. It is worth the paragraph because it happened while fixing an
    identical shape, in the same file, in the same afternoon.

    What actually has to be true is asserted now, and it holds everywhere: nothing on the
    child's search path can supply the variable. Whether the repo happens to have a `.env`
    is not this test's business, because the repo directory is not on that path either way.
    """
    for directory in [tmp_path, *tmp_path.parents]:
        assert not (directory / '.env').exists(), (
            f"{directory}/.env is on the probe's search path and would defeat it"
        )

    assert REPO_ROOT not in tmp_path.parents and tmp_path != REPO_ROOT, (
        'the probe runs inside the repo, so it could read the repo .env'
    )


@pytest.mark.parametrize('raw', [None, 'true', 'false'], ids=['unset', 'true', 'false'])
def test_the_models_gate_and_the_route_gate_never_disagree(tmp_path, raw):
    """
    Whatever the variable says — including saying nothing — a registered route must
    have its table, and a table must not be built for routes that are switched off.

    With `raw=None` this failed before #122's fix: routes_enabled True (pointsPal is
    `default_enabled`) while models_imported was False (the gate defaulted 'false').
    """
    result = _probe_readers(tmp_path, raw)
    assert result['routes_enabled'] == result['models_imported'], (
        f'POINTSPAL_ENABLED={raw!r}: routes_enabled='
        f"{result['routes_enabled']} but models_imported="
        f"{result['models_imported']} — a live route on a table that does not exist"
    )


def test_pointspal_is_on_when_the_variable_is_absent(tmp_path):
    """
    Pins the direction, not just the agreement. Two readers that both defaulted to
    off would satisfy the test above while shipping none of pointsPal.
    """
    result = _probe_readers(tmp_path, None)
    assert result == {'routes_enabled': True, 'models_imported': True}
