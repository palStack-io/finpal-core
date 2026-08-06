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
import re

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

    # Derived from the source rather than listed, because a hardcoded list of method
    # names is a guard keyed to a spelling: renaming a repository method would leave
    # this passing while the service called something that no longer exists. The
    # names are read off the actual `self.repo.<x>` call sites.
    called = set(re.findall(r'self\.repo\.(\w+)', source))
    assert called, 'no self.repo call sites found — this guard is inspecting nothing'
    for method in sorted(called):
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


def test_syncing_does_not_cross_the_demo_boundary(client, db, auth_headers):
    """The isolation boundary that survives the household model, re-keyed.

    **This test previously asserted the opposite of what it now asserts**, and the
    reason is a ruling rather than a bug fix. It read "`get_by_import_source` is
    filtered by user, so a second user's SimpleFin account must not be swept into
    someone else's sync" — and under the household model settled on 2026-08-06, one
    server *is* one household, accounts are assignable between members, and a
    housemate's account being swept into the sync is now **required**: the account can
    move to a member who holds no SimpleFin credential of their own, since
    `SimpleFin.user_id` is unique per user, so keying the sync to the owner meant a
    reassigned account could never be synced by anyone.

    So the per-user boundary this guarded is gone by decision. The boundary that
    remains real is the **demo** one: a demo account is a row on the instance but is
    not a household member (D-42), and its SimpleFin accounts must not be swept into a
    real member's sync or vice versa. Re-keyed to that, rather than deleted, because
    deleting it would have left the surviving half unwatched.
    """
    mine = UserFactory()
    housemate = UserFactory()
    demo = UserFactory(is_demo_user=True)

    for owner, name in ((housemate, 'Housemate bank'), (demo, 'Demo bank')):
        db.session.add(Account(name=name, type='checking', balance=10.0,
                               user_id=owner.id, currency_code='USD',
                               import_source='simplefin'))
    db.session.commit()

    from src.utils.household import visible_user_ids

    service = SimpleFinService()
    found = service.repo.get_by_import_source(visible_user_ids(mine.id), 'simplefin')
    names = sorted(a.name for a in found)

    assert 'Housemate bank' in names, (
        'a housemate account must be reachable, or a reassigned account stops syncing')
    assert 'Demo bank' not in names, (
        "a demo account's SimpleFin account was swept into a household sync: %s"
        % names)

    # And symmetrically — the demo visitor's sync sees only its own.
    demo_found = service.repo.get_by_import_source(visible_user_ids(demo.id),
                                                   'simplefin')
    assert sorted(a.name for a in demo_found) == ['Demo bank']
