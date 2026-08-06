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
import ast
import re
import textwrap
from pathlib import Path

import pytest

from tests.factories import CategoryFactory, UserFactory

ROOT = Path(__file__).resolve().parents[2]

# `src/services` alone was the original scan root, and it was too narrow by
# exactly the layer the restx port moved handlers into: `api/v1/team.py` and
# `api/v1/users.py` held six more of these, one of them serving the very route
# whose `src/services` twin was counted. A guard keyed to where the code used to
# live goes quiet as soon as the code moves, so scan every directory that can
# put a string in a response.
SCANNED = ('api', 'src', 'integrations', 'schemas')

# `return False, f'...{str(e)}...'` / `return ..., f'...{e}...'` — a formatted
# exception on a *return*, which is what reaches a client. Logging it is fine
# and required.
LEAKY_RETURN = re.compile(
    r'return\b[^\n]*\bf["\'][^"\'\n]*\{\s*(?:str\(\s*e\s*\)|e)\s*[}!:]')

# The inventory this file used to carry — 43 sites across ten services, plus
# the six in `api/v1` that the old scan root could not see — is EMPTY as of
# 2026-08-06. Every one was read and given a message chosen for it; none was
# swept with a regex. An entry here means a site is still leaking and is owed a
# fix, so the dict may grow only with a reason written next to it.
KNOWN_LEAKS = {}


def _leaks_by_file():
    found = {}
    for root in SCANNED:
        for path in sorted((ROOT / root).rglob('*.py')):
            hits = [f'{lineno}: {line.strip()}'
                    for lineno, line in enumerate(path.read_text().splitlines(), 1)
                    if LEAKY_RETURN.search(line)]
            if hits:
                found[str(path.relative_to(ROOT))] = hits
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


def test_nothing_leaks_anywhere():
    """The inventory is empty; say so as an assertion, not as a comment."""
    assert _leaks_by_file() == {}


# --------------------------------------------------------------------------
# the same defect, in a spelling the regex above cannot see
# --------------------------------------------------------------------------
#
# The regex wants an f-string interpolating a variable named `e`. Twenty-six
# sites said `return {'error': str(exc)}` instead and it matched none of them —
# thirteen of those were the real thing, including all of pointsPal's writes and
# both SimpleFin sync paths. So the second detector is keyed to the MECHANISM:
# a handler that catches `Exception` cannot know what it caught, so returning
# the object it caught is a leak whatever the spelling.
#
# The other thirteen are not leaks and this is why they pass: each catches a
# NARROW, authored type — `FieldError`, `InvalidSummaryRequest`,
# `OidcConfigError`, `OidcVerificationError`, or a `ValueError` this codebase
# raises itself with a user-facing message. There the exception's text *is* the
# authored message. Breadth of the `except` is the whole distinction.

BROAD_CATCHES = {'Exception', 'BaseException'}


def _handler_catches_everything(handler):
    if handler.type is None:          # bare `except:`
        return True
    caught = (handler.type.elts if isinstance(handler.type, ast.Tuple)
              else [handler.type])
    return any(getattr(node, 'id', None) in BROAD_CATCHES for node in caught)


def _broad_handlers_returning_the_exception():
    found = []
    for root in SCANNED:
        for path in sorted((ROOT / root).rglob('*.py')):
            try:
                tree = ast.parse(path.read_text())
            except SyntaxError:       # not ours to fix here
                continue
            for handler in (n for n in ast.walk(tree)
                            if isinstance(n, ast.ExceptHandler)):
                if handler.name is None or not _handler_catches_everything(handler):
                    continue
                for node in ast.walk(handler):
                    if not isinstance(node, ast.Return) or node.value is None:
                        continue
                    if any(isinstance(sub, ast.Name) and sub.id == handler.name
                           for sub in ast.walk(node.value)):
                        found.append(
                            f'{path.relative_to(ROOT)}:{node.lineno} '
                            f'(except ... as {handler.name})')
    return found


def test_no_broad_handler_returns_what_it_caught():
    assert _broad_handlers_returning_the_exception() == []


def test_the_second_detector_tells_the_two_cases_apart():
    """Without this, "no broad handler leaks" could mean "nothing was read"."""
    def scan(src):
        tree = ast.parse(textwrap.dedent(src))
        return [h for h in ast.walk(tree)
                if isinstance(h, ast.ExceptHandler)
                and h.name and _handler_catches_everything(h)
                and any(isinstance(sub, ast.Name) and sub.id == h.name
                        for node in ast.walk(h)
                        if isinstance(node, ast.Return) and node.value
                        for sub in ast.walk(node.value))]

    # The shapes that were actually found, in the spellings they were found in.
    assert scan("try:\n  x()\nexcept Exception as e:\n  return False, str(e)")
    assert scan("try:\n  x()\nexcept Exception as exc:\n  return {'e': str(exc)}")
    assert scan("try:\n  x()\nexcept (TypeError, Exception) as e:\n  return f'{e}'")
    # Narrow, authored types are the point of the distinction — not flagged.
    assert not scan("try:\n  x()\nexcept FieldError as exc:\n  return str(exc)")
    assert not scan("try:\n  x()\nexcept ValueError as exc:\n  return str(exc)")
    # Logging it and returning something else is correct — not flagged.
    assert not scan("try:\n  x()\nexcept Exception as e:\n  log(e)\n  return 'nope'")


def test_the_scan_reaches_the_files_that_used_to_leak():
    """An empty inventory and a scan that reads nothing look identical.

    Every path below held at least one leak before this was cleared, so if the
    scan stops reaching them the emptiness above stops meaning anything.
    """
    scanned = {str(p.relative_to(ROOT))
               for root in SCANNED for p in (ROOT / root).rglob('*.py')}

    for once_leaked in ('src/services/group/service.py',
                        'src/services/auth/service.py',
                        'src/services/transaction/service.py',
                        'src/services/category/service.py',
                        'api/v1/users.py',
                        'api/v1/team.py'):
        assert once_leaked in scanned, f'{once_leaked} is no longer scanned'


def test_the_detector_actually_matches_the_shape_it_hunts():
    """A detector that matches nothing looks exactly like one that passes."""
    assert LEAKY_RETURN.search("return False, f'Error creating group: {str(e)}', None")
    assert LEAKY_RETURN.search("        return False, f'Error adding member: {e}'")
    # Logging the exception is correct and must NOT be flagged.
    assert not LEAKY_RETURN.search('current_app.logger.exception("Error creating group")')
    assert not LEAKY_RETURN.search("logger.error(f'Error creating group: {str(e)}')")


def test_scanned_a_non_trivial_number_of_files():
    assert sum(len(list((ROOT / root).rglob('*.py'))) for root in SCANNED) > 100


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


# --------------------------------------------------------------------------
# every OTHER leak a client can actually reach
# --------------------------------------------------------------------------
#
# The source scan above counts sites; it says nothing about whether a client can
# reach one. Checked method by method: most of the inventoried sites sit in
# methods with **no caller anywhere in the repo** — all seven of
# `TransactionService`'s (its last caller went with the balances rewrite), all
# six of `AuthService`'s (`/api/v1/auth/register` never calls the service), the
# five `CategoryMapping` ones, `CurrencyService`'s four and
# `InvestmentService`'s. The cases below are the ones a request really does
# reach, and each was watched printing the secret before the fix landed.

SECRET = ('(psycopg2.errors.UniqueViolation) duplicate key value violates '
          'unique constraint DETAIL:  Failing row contains (7, Rent, '
          'victim@example.com) [SQL: INSERT INTO categories (name, user_id)')


def _a_recurring_row(user):
    from datetime import datetime

    from src.extensions import db as _db
    from src.models.recurring import RecurringExpense

    row = RecurringExpense(
        description='Rent', amount=100.0, card_used='Visa',
        split_method='equal', paid_by=user.id, user_id=user.id,
        frequency='monthly', start_date=datetime.utcnow(), active=True)
    _db.session.add(row)
    _db.session.commit()
    return row


def _a_simplefin_row(user):
    from src.extensions import db as _db
    from src.models.account import SimpleFin

    row = SimpleFin(user_id=user.id, access_url='https://example.invalid/x')
    _db.session.add(row)
    _db.session.commit()
    return row


def _an_invitation(user):
    from src.extensions import db as _db
    from src.models.invitation import Invitation

    row = Invitation(email='invitee@example.com', status='pending',
                     invited_by=user.id, token='tok-123')
    _db.session.add(row)
    _db.session.commit()
    return row


def _a_category(user):
    from src.extensions import db as _db

    cat = CategoryFactory(user_id=user.id, is_system=False)
    _db.session.commit()
    return cat


# Each entry builds whatever rows it needs and returns the request to fire.
# Setup runs BEFORE the sabotage, or the setup is what explodes.
REACHABLE = {
    'create category':
        lambda u: ('post', '/api/v1/categories', {'name': 'Coffee'}),
    'update category':
        lambda u: ('put', f'/api/v1/categories/{_a_category(u).id}',
                   {'name': 'Renamed'}),
    'delete category':
        lambda u: ('delete', f'/api/v1/categories/{_a_category(u).id}', None),
    'create recurring':
        lambda u: ('post', '/api/v1/recurring/',
                   {'description': 'Rent', 'amount': 100.0,
                    'frequency': 'monthly'}),
    'update recurring':
        lambda u: ('put', f'/api/v1/recurring/{_a_recurring_row(u).id}',
                   {'amount': 120.0}),
    'toggle recurring':
        lambda u: ('post', f'/api/v1/recurring/{_a_recurring_row(u).id}/toggle',
                   None),
    'delete recurring':
        lambda u: ('delete', f'/api/v1/recurring/{_a_recurring_row(u).id}',
                   None),
    'ignore a detected pattern':
        lambda u: ('post', '/api/v1/recurring/ignore',
                   {'pattern_key': 'rent|100.0|monthly'}),
    'create budget':
        lambda u: ('post', '/api/v1/budgets/',
                   {'name': 'Food', 'amount': 200.0, 'period': 'monthly',
                    'category_id': _a_category(u).id}),
    'disconnect simplefin':
        lambda u: (_a_simplefin_row(u) and 'post',
                   '/api/v1/accounts/simplefin/disconnect', None),
    'resend an invitation':
        lambda u: ('post',
                   f'/api/v1/team/invitations/{_an_invitation(u).id}/resend',
                   None),
    'reset categories':
        lambda u: ('post', '/api/v1/users/reset-categories', None),
    'delete all data':
        lambda u: ('post', '/api/v1/users/delete-all-data',
                   {'password': 'testpassword'}),
    'delete the account':
        lambda u: ('delete', '/api/v1/users/account',
                   {'password': 'testpassword'}),
    # pointsPal is part of core (#56) and every one of its writes leaked, in the
    # `return False, str(e), None` spelling the first detector could not see.
    'add a pointspal card':
        lambda u: ('post', '/api/v1/pointspal/cards',
                   {'card_nickname': 'Amex Gold', 'last_four': '1234'}),
}


def test_the_sync_log_never_serves_the_exception_it_stored(client, db,
                                                           auth_headers):
    """Both detectors watch *returns*. This one leaks by being stored.

    `_write_sync_log(status='error', error_message=str(e))` keeps the exception
    text on purpose — it is the operator's only diagnostic for a failed catalogue
    fetch. But it keeps it in a **database column**, and `GET
    /pointspal/sync/status` already reads that very row. Only the handler's
    hand-written field list stands between the two, so adding an obvious-looking
    `'error': log.error_message` would restore the leak by a path no `return`
    scan can see. Checked 2026-08-06: not served. Pinned so it stays that way.
    """
    from src.extensions import db as _db
    from src.modules.pointspal.models import PointspalSyncLog

    user = UserFactory()
    headers = auth_headers(user)

    _db.session.add(PointspalSyncLog(
        status='error', programs_upserted=0,
        error_message='HTTPSConnectionPool(host=raw.githubusercontent.com) '
                      'Max retries exceeded with token ghp_SECRETLEAK'))
    _db.session.commit()

    resp = client.get('/api/v1/points/sync/status', headers=headers)

    assert resp.status_code == 200, resp.get_data(as_text=True)
    body = resp.get_data(as_text=True)
    assert 'error' == resp.get_json()['status'], (
        'the row under test must be the one being served')
    for leak in ('ghp_SECRETLEAK', 'HTTPSConnectionPool', 'Max retries'):
        assert leak not in body, f'the stored exception text is served: {body}'


@pytest.mark.parametrize('case', sorted(REACHABLE))
def test_no_reachable_write_reports_the_database_to_the_client(
        client, db, auth_headers, monkeypatch, case):
    """Forced, not hoped for: every one of these leaked before the fix."""
    from src.extensions import db as _db

    user = UserFactory(is_admin=True)
    headers = auth_headers(user)

    method, path, payload = REACHABLE[case](user)

    # A URL that matches no rule answers 404 from the framework, which reads
    # exactly like a handler refusing — `delete the account` was written against
    # `/users/me`, answered 404 and passed while proving nothing. Status codes
    # cannot tell the two apart (a failed `DELETE /recurring/<id>` is a genuine
    # 404), so ask the routing table instead of the response.
    from flask import current_app
    current_app.url_map.bind('localhost').match(path, method.upper())

    def explode(*args, **kwargs):
        raise RuntimeError(SECRET)

    # `resend an invitation` never commits — its leak is the SMTP exception, so
    # the send is what has to fail there.
    monkeypatch.setattr(_db.session, 'commit', explode)
    from src.services.email_service import email_service
    monkeypatch.setattr(email_service, 'send_invite_email', explode)

    resp = getattr(client, method)(path, headers=headers, json=payload)

    body = resp.get_data(as_text=True)
    assert resp.status_code >= 400, (
        f'{case} answered {resp.status_code} — the sabotage never reached the '
        f'code under test, so this case proves nothing: {body[:300]}')
    for leak in (SECRET, 'psycopg2', 'SQL:', 'INSERT INTO', 'Failing row',
                 'victim@example.com', 'Traceback'):
        assert leak not in body, f'{case} leaked {leak!r}: {body[:400]}'
