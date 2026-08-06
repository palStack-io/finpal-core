"""No service may hand a database exception's text to a client.

CLAUDE.md forbids returning `str(e)` in an error response, and the reason is not
style. `GroupService.create_group` caught the IntegrityError from a missing
`name` and returned it verbatim, so `POST /api/v1/groups` with no name answered,
on the live deployed instance:

    Error creating group: (psycopg2.errors.NotNullViolation) null value in
    column "name" of relation "groups" violates not-null constraint
    DETAIL:  Failing row contains (10, null, no name here, 2026-08-06 ...,
    claude-test@finpal.local, null, equal, null, f).
    [SQL: INSERT INTO groups (name, description, created_at, created_by, ...

That is the schema, the SQL, the column order and the row's own contents —
including the caller's email — handed to any client that omits a field.

Found while completing the restx port (#64): the ported handler reproduced the
blueprint faithfully, which meant reproducing this. Two earlier fixes had closed
the same class one site at a time — #62 in `update_settings`, and D-39's
`update_group` was written not to do it — which is exactly why this is now a
gate keyed to the mechanism rather than a third individual fix.

The source check is what makes it general: any *future* `str(e)` in a service
error return fails here, including on paths no test exercises.
"""
import re
from pathlib import Path

import pytest

from tests.factories import UserFactory

SERVICES = Path(__file__).resolve().parents[2] / 'src' / 'services'

# `return False, f'...{str(e)}...'` / `return ..., f'...{e}...'` — a formatted
# exception on a *return*, which is what reaches a client. Logging it is fine
# and required.
LEAKY_RETURN = re.compile(
    r'return\b[^\n]*\bf["\'][^"\'\n]*\{\s*(?:str\(\s*e\s*\)|e)\s*[}!:]')

# Inventory of the sites that still leak, counted on 2026-08-05. This is a debt
# list, not an exemption: the whole point is that the number may go DOWN and may
# never go UP. `group/service.py` is absent because this session cleared it,
# which is the only reason that file is not here too.
#
# All 43 are the identical shape — `except Exception as e:` then
# `return False, f'...: {str(e)}'` — so the sweep is mechanical but must not be
# done blind: it needs a sensible message chosen per site, and the rule in this
# repo is never to apply a mechanical change across many sites without reading
# every one. Tracked in AUDIT.md; `auth/service.py` is the priority, since
# registration returning an IntegrityError verbatim also enumerates users.
KNOWN_LEAKS = {
    'services/account/service.py': 4,
    'services/auth/service.py': 6,
    'services/budget/service.py': 4,
    'services/category/service.py': 8,
    'services/currency/service.py': 4,
    'services/investment/service.py': 3,
    'services/notification/service.py': 1,
    'services/recurring/service.py': 5,
    'services/team/api_routes.py': 1,
    'services/transaction/service.py': 7,
}


def _leaks_by_file():
    found = {}
    for path in sorted(SERVICES.rglob('*.py')):
        hits = [f'{lineno}: {line.strip()}'
                for lineno, line in enumerate(path.read_text().splitlines(), 1)
                if LEAKY_RETURN.search(line)]
        if hits:
            found[str(path.relative_to(SERVICES.parents[0]))] = hits
    return found


def test_no_service_grows_a_new_exception_leak():
    """Returning `str(e)` hands the client the SQL, the schema and the row."""
    found = _leaks_by_file()

    new_files = sorted(set(found) - set(KNOWN_LEAKS))
    assert not new_files, (
        f'these files newly return an exception\'s text to the client: '
        f'{ {f: found[f] for f in new_files} }')

    grown = {f: (len(hits), KNOWN_LEAKS[f])
             for f, hits in found.items() if len(hits) > KNOWN_LEAKS[f]}
    assert not grown, (
        f'new exception leaks added (found, allowed): {grown}')


def test_the_leak_inventory_is_not_stale():
    """Fixing sites must shrink the list, not leave it overstating the debt."""
    found = _leaks_by_file()

    fixed = {f: (len(found.get(f, [])), allowed)
             for f, allowed in KNOWN_LEAKS.items()
             if len(found.get(f, [])) < allowed}
    assert not fixed, (
        f'these were fixed — lower or remove their entry in KNOWN_LEAKS '
        f'(found, allowed): {fixed}')


def test_the_group_service_stays_clean():
    """The one this session cleared, named so it cannot quietly regress."""
    assert 'services/group/service.py' not in _leaks_by_file()


def test_the_detector_actually_matches_the_shape_it_hunts():
    """A detector that matches nothing looks exactly like one that passes."""
    assert LEAKY_RETURN.search("return False, f'Error creating group: {str(e)}', None")
    assert LEAKY_RETURN.search("        return False, f'Error adding member: {e}'")
    # Logging the exception is correct and must NOT be flagged.
    assert not LEAKY_RETURN.search('current_app.logger.exception("Error creating group")')
    assert not LEAKY_RETURN.search("logger.error(f'Error creating group: {str(e)}')")


def test_scanned_a_non_trivial_number_of_services():
    assert len(list(SERVICES.rglob('*.py'))) > 20


# --------------------------------------------------------------------------
# the live path that exposed it
# --------------------------------------------------------------------------

@pytest.mark.parametrize('payload', [
    {'description': 'no name here'},
    {'name': ''},
    {'name': '   '},
])
def test_creating_a_group_without_a_name_is_a_clean_400(client, db,
                                                        auth_headers, payload):
    user = UserFactory()

    resp = client.post('/api/v1/groups', headers=auth_headers(user),
                       json=payload)

    assert resp.status_code == 400
    error = resp.get_json()['error']
    assert error == 'Group name is required', (
        'a missing name must be refused before it reaches the NOT NULL '
        f'constraint, not after: {error}')
    for leak in ('psycopg2', 'SQL:', 'INSERT INTO', 'Failing row', 'Traceback'):
        assert leak not in error


def test_a_failed_group_commit_reports_nothing_about_the_database(
        client, db, auth_headers, monkeypatch):
    """The general case, forced rather than hoped for."""
    from src.extensions import db as _db
    secret = '(psycopg2.errors.NotNullViolation) null value in column "name"'

    # The user and its token must exist BEFORE commit is sabotaged, or the
    # factory is what explodes.
    user = UserFactory()
    headers = auth_headers(user)

    def explode():
        raise RuntimeError(secret)

    monkeypatch.setattr(_db.session, 'commit', explode)

    resp = client.post('/api/v1/groups', headers=headers, json={'name': 'Trip'})

    assert resp.status_code >= 400
    assert secret not in resp.get_json()['error']
    assert 'psycopg2' not in resp.get_json()['error']
