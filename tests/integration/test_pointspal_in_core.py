"""
pointsPal ships as part of core, not as something to switch on.

It was written on both sides and shipped on neither. The backend module, its seven
tables, thirty routes and the whole web-ui half — `web-ui/src/modules/pointspal/`,
a sidebar entry, a Settings tab, its own vitest suites — were all complete, while
the deployed instance served **none** of it: `swagger.json` on ubuntuloco:8094 had
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

import re
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


def test_pointspal_tables_are_created_by_the_schema_bootstrap(app, db):
    """
    Production has no alembic_version row — the schema comes from db.create_all()
    at boot. So the module's models must be imported by the time that runs, or
    enabling the routes would 500 on tables that do not exist.
    """
    from sqlalchemy import inspect

    from src.extensions import db as _db

    with app.app_context():
        tables = set(inspect(_db.engine).get_table_names())

    for expected in ('points_programs', 'user_cards', 'spend_period_totals'):
        assert expected in tables, f'{expected} was not created by create_all()'
