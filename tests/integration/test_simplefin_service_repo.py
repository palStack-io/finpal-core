"""SimpleFin sync crashed on every call, for every user.

`SimpleFinService.__init__` was `pass`, while four of its methods use `self.repo`. So
`sync_all_accounts`, `sync_account` and the account-matching paths all raised
`AttributeError: 'SimpleFinService' object has no attribute 'repo'` before doing
anything — a 500 every time.

Its sibling `AccountService` in the same module sets `self.repo = AccountRepository()`
in `__init__`, and `AccountRepository` already provides all three methods the missing
attribute was expected to have (`get_by_id`, `get_by_external_id`,
`get_by_import_source`), so this was a constructor that was never written rather than
a design gap.

Found by `test_malformed_body_never_500s.py` sweeping every write route — the sync
endpoints surfaced as 5xx alongside the body-handling failures it was actually looking
for, which is the argument for keying a gate to a mechanism rather than to a list of
suspects. SimpleFin bank sync is a headline feature in the README.

The tests assert on the *service* rather than only the endpoint, because
`_simplefin_required()` gates the routes behind `SIMPLEFIN_ENABLED` and a
configuration-dependent 503 would hide the crash again.
"""
import inspect

from src.extensions import db
from src.models.account import Account
from src.services.account.service import SimpleFinService
from tests.factories import UserFactory


def test_the_service_has_the_repository_its_methods_use():
    """The invariant, not the one call site.

    Written against every `self.repo` reference in the class, so a fifth method using
    it keeps working and a regressed `__init__` fails here.
    """
    service = SimpleFinService()
    source = inspect.getsource(SimpleFinService)
    assert 'self.repo' in source, (
        'this test is guarding an attribute the class no longer uses'
    )
    assert hasattr(service, 'repo'), (
        "SimpleFinService uses self.repo in %d places but __init__ never sets it, so "
        "every one of those methods raises AttributeError"
        % source.count('self.repo')
    )

    for method in ('get_by_id', 'get_by_external_id', 'get_by_import_source'):
        assert hasattr(service.repo, method), (
            'the repository is missing %s, which SimpleFinService calls' % method)


def test_syncing_with_no_linked_accounts_reports_that_rather_than_crashing(
        client, db, auth_headers):
    """The behaviour, over the real call path.

    A user with no SimpleFin accounts is the ordinary empty case and must come back
    as an answer, not an exception.
    """
    user = UserFactory()
    service = SimpleFinService()

    success, message, results = service.sync_all_accounts(user.id)

    assert isinstance(message, str) and message, message
    assert results is None or isinstance(results, (list, dict)), results


def test_syncing_only_considers_the_callers_accounts(client, db, auth_headers):
    """`get_by_import_source` is filtered by user, so a second user's SimpleFin
    account must not be swept into someone else's sync."""
    mine = UserFactory()
    theirs = UserFactory()
    other_account = Account(name='Their bank', type='checking', balance=10.0,
                            user_id=theirs.id, currency_code='USD',
                            import_source='simplefin')
    db.session.add(other_account)
    db.session.commit()

    service = SimpleFinService()
    found = service.repo.get_by_import_source(mine.id, 'simplefin')

    assert [a.id for a in found] == [], (
        "another user's SimpleFin account was returned for this caller: %s"
        % [(a.id, a.user_id) for a in found])
