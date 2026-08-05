"""
Every variable .env.example documents must be able to reach the application.

This is D-05 generalised. That finding was two fields documented in swagger for
which no column, schema or handler existed: a client that followed the docs got a
201 and silently lost what it sent. The same shape exists in deployment config — a
variable named in `.env.example` that `docker-compose.yml` never passes into the
container is read by nobody, and the self-hoster who sets it gets no error, no
warning and no effect.

Found four of them while adding POINTSPAL_SYNC_URL to `.env.example`, and two were
security boundaries rather than preferences:

  JWT_SECRET_KEY      — src/__init__.py falls back to SECRET_KEY, so tokens are
                        signed with the Flask session key. Not a weak secret, but
                        no key separation: rotating one rotates both, and a
                        SECRET_KEY disclosure becomes JWT forgery.
  CSV_IMPORT_ROOT     — the root that csv_import/paths.py confines import paths to.
                        Set it to confine imports and the default applies instead.
  CSV_IMPORT_MAX_BYTES— the size ceiling on a single imported file.
  POINTSPAL_SYNC_URL  — where the rewards catalogue is fetched from.

Scoped to `docker-compose.yml`, the file a self-hoster actually runs.
`docker-compose.portainer.yml` is a self-contained stack template that inlines
literal values rather than forwarding `${VAR}`, and `docker-compose.dev.yml` is a
development override, so neither is the passthrough contract.

Keyed to the mechanism: the variable list comes from `.env.example` and the readers
from the source tree, so a variable added to either side tomorrow is covered without
editing this file.
"""

import re
from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parents[2]

# Directories that run inside the container.
APP_DIRS = ('src', 'api', 'integrations')

# Variables that are deliberately not passed through, with the reason. Empty on
# purpose — add an entry only with a reason a reviewer would accept, because the
# alternative is documenting a setting that does nothing.
EXEMPT: dict[str, str] = {}


def _documented_vars() -> list[str]:
    text = (REPO_ROOT / '.env.example').read_text()
    return [m.group(1) for m in re.finditer(r'^([A-Z][A-Z0-9_]+)=', text, re.M)]


def _app_source() -> str:
    return ' '.join(
        p.read_text()
        for d in APP_DIRS
        for p in (REPO_ROOT / d).rglob('*.py')
    )


def _is_read_by_app(var: str, source: str) -> bool:
    return bool(
        re.search(
            rf"getenv\(\s*['\"]{var}['\"]"
            rf"|environ\[['\"]{var}['\"]\]"
            rf"|environ\.get\(\s*['\"]{var}['\"]",
            source,
        )
    )


def test_env_example_is_not_empty():
    """Guard against the sweep below passing because it parsed nothing."""
    assert len(_documented_vars()) > 10


@pytest.mark.parametrize('var', _documented_vars())
def test_documented_var_is_passed_into_the_container(var):
    """
    A variable that .env.example documents AND the app reads must appear in
    docker-compose.yml, or setting it has no effect and says so nowhere.
    """
    if var in EXEMPT:
        pytest.skip(f'{var}: {EXEMPT[var]}')

    if not _is_read_by_app(var, _app_source()):
        pytest.skip(f'{var} is not read by {"/".join(APP_DIRS)} — nothing to pass through')

    compose = (REPO_ROOT / 'docker-compose.yml').read_text()
    assert re.search(rf'\b{var}\b', compose), (
        f'.env.example documents {var} and the application reads it, but '
        f'docker-compose.yml never passes it into the container, so a self-hoster '
        f'who sets it is silently ignored'
    )
