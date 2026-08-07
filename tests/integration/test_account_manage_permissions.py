"""Who may change an account, as opposed to who may see one.

**Owner decision, 2026-08-06: owner or admin.** Everyone in the household sees every
account and portfolio; only its owner and the household admin may rename, reassign or
delete it.

**This narrows a rule that was already deployed.** PR #72 made the account detail,
update and delete routes household-scoped to fix D-43 — the list showed a housemate's
account and opening it answered 404 — and in doing so it made *mutation* household-wide
too, on a stated assumption that any member could manage any account. That assumption
was wrong, and while it was live **a housemate could delete another member's account**,
which also nulls `account_id` across that account's entire transaction history
(`nullify_account_on_transactions`). Filed as **D-47**.

The distinction this file exists to hold:

  * **READ stays household.** `visible_user_ids()`. Narrowing reads would reintroduce
    D-43 — a row you can see in the list but not open.
  * **MUTATION is owner-or-admin.** `can_manage_owned()`.
  * **SimpleFin sync stays household**, deliberately. It is driven by whoever holds
    the credential rather than by who owns the money, and `SimpleFin.user_id` is
    unique per user — keying it to the owner would leave a reassigned account
    syncable by nobody, which is half of what #72 fixed.
  * **Creation stays open to any member**, including creating an account *for* a
    housemate via `owner_id`. Setting an account up for someone adds data; it does not
    reach into theirs.

Categories are deliberately untouched: they are household property with **no owner**
(D-20), so there is nothing for an owner check to key on there.
"""
import pytest

from src.extensions import db
from src.models.account import Account
from src.models.investment import Portfolio
from tests.factories import AccountFactory, UserFactory


@pytest.fixture
def alice(db):
    """An ordinary member — NOT an admin."""
    return UserFactory(id='alice@test.com', name='Alice',
                       is_admin=False, password_plain='pw-alice')


@pytest.fixture
def bob(db):
    """Another ordinary member, who owns the account under test."""
    return UserFactory(id='bob@test.com', name='Bob',
                       is_admin=False, password_plain='pw-bob')


@pytest.fixture
def ann(db):
    """The household admin."""
    return UserFactory(id='ann@test.com', name='Ann',
                       is_admin=True, password_plain='pw-ann')


@pytest.fixture
def alice_h(client, auth_headers, alice):
    return auth_headers(alice, password='pw-alice')


@pytest.fixture
def bob_h(client, auth_headers, bob):
    return auth_headers(bob, password='pw-bob')


@pytest.fixture
def ann_h(client, auth_headers, ann):
    return auth_headers(ann, password='pw-ann')


# ===========================================================================
# READ — unchanged, and must stay unchanged or D-43 comes back
# ===========================================================================

def test_pin_a_member_still_sees_a_housemates_account_in_the_list(
        client, alice_h, alice, bob):
    """The household view is not narrowed. This is D-43's fix and it must survive."""
    AccountFactory(name='Bob Savings', user_id=bob.id)

    body = client.get('/api/v1/accounts/', headers=alice_h).get_json()
    assert 'Bob Savings' in [a['name'] for a in body['accounts']]


def test_pin_a_member_can_still_open_a_housemates_account(client, alice_h, bob):
    """Seeing it in the list and being able to open it must stay consistent."""
    account = AccountFactory(name='Bob Savings', user_id=bob.id)

    resp = client.get(f'/api/v1/accounts/{account.id}', headers=alice_h)
    assert resp.status_code == 200
    assert resp.get_json()['account']['name'] == 'Bob Savings'


def test_pin_a_member_can_still_read_a_housemates_balance(client, alice_h, bob):
    account = AccountFactory(name='Bob Savings', user_id=bob.id, balance=612.40)

    resp = client.get(f'/api/v1/accounts/{account.id}/balance', headers=alice_h)
    assert resp.status_code == 200
    assert resp.get_json()['balance'] == 612.40


def test_pin_creating_an_account_for_a_housemate_is_still_allowed(
        client, alice_h, alice, bob, db):
    """Setting an account up *for* someone adds data rather than reaching into
    theirs, so the owner picker stays open to any member."""
    resp = client.post('/api/v1/accounts/', headers=alice_h, json={
        'name': 'Bobs New Card', 'account_type': 'credit', 'owner_id': bob.id,
    })
    assert resp.status_code == 201
    assert Account.query.filter_by(name='Bobs New Card').one().user_id == bob.id


# ===========================================================================
# THE FIX — all watched FAILING first, because today any member may do these
# ===========================================================================

def test_fix_a_member_cannot_rename_a_housemates_account(
        client, alice_h, bob, db):
    account = AccountFactory(name='Bob Savings', user_id=bob.id)

    resp = client.put(f'/api/v1/accounts/{account.id}', headers=alice_h,
                      json={'name': 'Alice Renamed It'})

    assert resp.status_code == 403
    assert db.session.get(Account, account.id).name == 'Bob Savings'


def test_fix_a_member_cannot_delete_a_housemates_account(
        client, alice_h, bob, db):
    """The worst case, and it was live: deleting also nulls `account_id` across the
    account's whole transaction history."""
    account = AccountFactory(name='Bob Savings', user_id=bob.id)

    resp = client.delete(f'/api/v1/accounts/{account.id}', headers=alice_h)

    assert resp.status_code == 403
    assert db.session.get(Account, account.id) is not None


def test_fix_a_member_cannot_reassign_a_housemates_account(
        client, alice_h, alice, bob, db):
    """Reassignment moves every transaction on the account for attribution."""
    account = AccountFactory(name='Bob Savings', user_id=bob.id)

    resp = client.put(f'/api/v1/accounts/{account.id}', headers=alice_h,
                      json={'owner_id': alice.id})

    assert resp.status_code == 403
    assert db.session.get(Account, account.id).user_id == bob.id


def test_fix_a_member_cannot_delete_a_housemates_portfolio(
        client, alice_h, bob, db):
    portfolio = Portfolio(name='Bob Retirement', user_id=bob.id)
    db.session.add(portfolio)
    db.session.commit()

    resp = client.delete(f'/api/v1/investments/portfolios/{portfolio.id}',
                         headers=alice_h)

    assert resp.status_code == 403
    assert db.session.get(Portfolio, portfolio.id) is not None


# ===========================================================================
# The two who MAY — asserted so the fix cannot be "refuse everyone"
# ===========================================================================

def test_the_owner_can_still_manage_their_own_account(client, bob_h, bob, db):
    account = AccountFactory(name='Bob Savings', user_id=bob.id)

    resp = client.put(f'/api/v1/accounts/{account.id}', headers=bob_h,
                      json={'name': 'Bob Renamed'})
    assert resp.status_code == 200
    assert db.session.get(Account, account.id).name == 'Bob Renamed'

    assert client.delete(f'/api/v1/accounts/{account.id}',
                         headers=bob_h).status_code == 200
    assert db.session.get(Account, account.id) is None


def test_the_admin_can_manage_any_members_account(client, ann_h, ann, bob, db):
    """Without this the change would be indistinguishable from plain per-user
    ownership, which is what D-43 existed to move away from."""
    account = AccountFactory(name='Bob Savings', user_id=bob.id)

    resp = client.put(f'/api/v1/accounts/{account.id}', headers=ann_h,
                      json={'name': 'Admin Renamed'})
    assert resp.status_code == 200
    assert db.session.get(Account, account.id).name == 'Admin Renamed'

    assert client.delete(f'/api/v1/accounts/{account.id}',
                         headers=ann_h).status_code == 200
    assert db.session.get(Account, account.id) is None


def test_the_admin_can_manage_a_members_portfolio(client, ann_h, bob, db):
    portfolio = Portfolio(name='Bob Retirement', user_id=bob.id)
    db.session.add(portfolio)
    db.session.commit()

    assert client.delete(f'/api/v1/investments/portfolios/{portfolio.id}',
                         headers=ann_h).status_code == 200
    assert db.session.get(Portfolio, portfolio.id) is None


# ===========================================================================
# MODEL — the distinctions the rule rests on
# ===========================================================================

def test_model_read_scope_and_manage_rights_are_different_functions(
        db, alice, bob, ann):
    """Pinned as a DIFFERENCE, because a guard that asserts the two agree would pass
    both before and after this change — the D-42 lesson.
    """
    from src.utils.household import visible_user_ids, can_manage_owned

    # Alice may SEE Bob's data...
    assert bob.id in visible_user_ids(alice.id)
    # ...and may NOT change it.
    assert can_manage_owned(bob.id, alice.id) is False
    # The admin may do both.
    assert bob.id in visible_user_ids(ann.id)
    assert can_manage_owned(bob.id, ann.id) is True
    # And an owner always may.
    assert can_manage_owned(bob.id, bob.id) is True


def test_model_a_demo_account_is_never_an_admin_over_household_data(db, bob):
    """The demo sandbox stays symmetric even if a demo row carries is_admin."""
    from src.utils.household import can_manage_owned

    demo_admin = UserFactory(id='demo9@finpal.demo', is_demo_user=True,
                             is_admin=True)

    assert can_manage_owned(bob.id, demo_admin.id) is False, (
        'a demo account with is_admin set could manage real household data')
    assert can_manage_owned(demo_admin.id, bob.id) is False, (
        "the household reached into a demo persona's rows")
