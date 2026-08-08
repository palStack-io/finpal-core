"""A watched folder belongs to a household member — AUDIT-adjacent, item 4.

**The premise recorded for this item was wrong, and the correction shrank it.** The
roadmap said per-user watched folders needed a schema change, which would have hit
the `create_all()` trap (no `alembic_version` on the deploy, so a new column on an
existing model silently never appears). There is **no new column**:
`ImportSource.user_id` has always been a non-null FK, and `scanner.py` already
attributes the profile, the batch and every imported row to `source.user_id`.

Imports landed on the admin for one reason only — `_require_admin()` gates creation
and stamped the *creator* as owner. So this is a permissions/API change.

**Why `owner_id` matters more here than on an account.** `scan_source` turns a file
into transactions owned by `source.user_id`. Getting it wrong does not mislabel a
row; it files somebody else's bank statement under the admin's name, and every
figure downstream — the dashboard, the analytics scope, the budgets — inherits
that. So an unknown or demo id is **refused**, never quietly reassigned to the
caller.
"""
import pytest

from src.extensions import db
from src.models.import_source import ImportSource
from tests.factories import UserFactory


@pytest.fixture
def admin(db):
    u = UserFactory(id='admin@test.com', name='Admin', password_plain='pw-admin')
    u.is_admin = True
    db.session.commit()
    return u


@pytest.fixture
def housemate(db):
    return UserFactory(id='bob@test.com', name='Bob')


@pytest.fixture
def outsider(db):
    """A demo account — on the instance, but not household property."""
    u = UserFactory(id='demo@test.com', name='Demo')
    u.is_demo_user = True
    db.session.commit()
    return u


@pytest.fixture
def root(tmp_path, monkeypatch):
    """Paths are confined to CSV_IMPORT_ROOT, so every create needs one set."""
    monkeypatch.setenv('CSV_IMPORT_ROOT', str(tmp_path))
    return tmp_path


def _create(client, admin, auth_headers, root, **body):
    payload = {'path': str(root), **body}
    return client.post('/api/v1/import-sources', json=payload,
                       headers=auth_headers(admin, password='pw-admin'))


def test_omitting_owner_id_keeps_the_caller_as_owner(client, db, admin, auth_headers, root):
    """The common case, and the behaviour that existed before this change."""
    resp = _create(client, admin, auth_headers, root)
    assert resp.status_code == 201, resp.get_json()

    source = db.session.get(ImportSource, resp.get_json()['source']['id'])
    assert source.user_id == admin.id


def test_an_admin_can_create_a_folder_that_imports_for_a_housemate(
        client, db, admin, housemate, auth_headers, root):
    """The point of the whole item.

    Asserted on the DATABASE row, not the response: `user_id` is what
    `scan_source` reads when it decides whose transactions the file becomes.
    """
    resp = _create(client, admin, auth_headers, root, owner_id=housemate.id)
    assert resp.status_code == 201, resp.get_json()

    source = db.session.get(ImportSource, resp.get_json()['source']['id'])
    assert source.user_id == housemate.id, (
        'the folder is still owned by the admin, so every file dropped in it '
        'would import as the admin\'s transactions')


def test_an_unknown_owner_is_refused_rather_than_reassigned(
        client, db, admin, auth_headers, root):
    """*** 400, NOT a silent fallback to the caller. ***

    A fallback would look like success and file the wrong person's statement under
    the admin, which is exactly the class of bug D-18 existed for. The refusal is
    the affordance.
    """
    before = ImportSource.query.count()
    resp = _create(client, admin, auth_headers, root, owner_id='nobody@test.com')

    assert resp.status_code == 400, resp.get_json()
    assert ImportSource.query.count() == before, 'a refused create still made a row'


def test_a_demo_account_cannot_own_a_watched_folder(
        client, db, admin, outsider, auth_headers, root):
    """Demo accounts ship with a PUBLISHED password.

    `is_household_member` excludes them, and this pins that the import path uses
    that predicate rather than "does this user row exist" — the distinction that
    D-42 and D-55 were both about.
    """
    resp = _create(client, admin, auth_headers, root, owner_id=outsider.id)
    assert resp.status_code == 400, resp.get_json()


def test_the_list_shows_household_folders_not_just_the_callers_own(
        client, db, admin, housemate, auth_headers, root):
    """Without this, creating a folder for a housemate looks like it did nothing.

    The list used to be `filter_by(user_id=caller)`. An admin who created a folder
    owned by Bob would get a 201 and then not see it — a create that appears to
    fail.
    """
    _create(client, admin, auth_headers, root, owner_id=housemate.id)

    resp = client.get('/api/v1/import-sources',
                      headers=auth_headers(admin, password='pw-admin'))
    assert resp.status_code == 200

    sources = resp.get_json()['sources']
    assert sources, 'the folder just created is not in the list'
    assert any(s['owner_id'] == housemate.id for s in sources), (
        'the list does not show the housemate-owned folder the admin just made')


def test_the_list_says_whose_each_folder_is(client, db, admin, housemate, auth_headers, root):
    """A household-wide list that does not say who each row is for is D-18 again."""
    _create(client, admin, auth_headers, root, owner_id=housemate.id)

    resp = client.get('/api/v1/import-sources',
                      headers=auth_headers(admin, password='pw-admin'))
    assert all('owner_id' in s for s in resp.get_json()['sources'])


def test_a_non_admin_still_cannot_create_one(client, db, housemate, auth_headers):
    """Unchanged by this item, and pinned so widening ownership did not widen access.

    Watched folders point at server filesystem paths, so creation stays
    admin-only — assigning an owner is not the same as letting anyone add one.
    """
    resp = client.post('/api/v1/import-sources', json={'path': 'statements'},
                       headers=auth_headers(housemate))
    assert resp.status_code in (401, 403), resp.get_json()
