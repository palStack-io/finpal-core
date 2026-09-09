"""Adding and removing a co-owner, and the `owners` the payload has to carry.

Without these routes `account_owners` is a table no user can write to, and B2/B3
ships as a permission nobody can grant -- the dead-code shape this project keeps
finding.

*** THE MEMBERSHIP PREDICATE HERE IS `on_the_same_side`, NOT `is_household_member`
ON BOTH SIDES. *** `account_owners` is a membership list on a shared thing, the
same shape as `group_users`, and D-94 settled that one: household-member-on-both-
sides is the right rule for OWNERSHIP (D-81, and it still guards reassigning
`Account.user_id`) and it forbids demo->demo, which breaks the public demo
invisibly to any test built from real users. Assigning the account to someone --
attribution -- is a different question and is untouched.
"""
from src.extensions import db as _db
from src.models.account import Account
from src.models.associations import account_owners
from tests.factories import UserFactory, AccountFactory


def _owner_ids(account_id):
    return {r[0] for r in _db.session.execute(
        _db.select(account_owners.c.user_id).where(
            account_owners.c.account_id == account_id)).all()}


def test_the_owner_can_add_a_co_owner_and_the_row_lands(client, auth_headers, db):
    owner = UserFactory(id='o@test.com', name='Owner')
    partner = UserFactory(id='p@test.com', name='Partner')
    account = AccountFactory(user_id=owner.id, name='Joint', type='checking')
    _db.session.commit()

    resp = client.post(f'/api/v1/accounts/{account.id}/owners',
                       headers=auth_headers(owner), json={'user_id': partner.id})
    assert resp.status_code == 200, resp.get_json()
    assert _owner_ids(account.id) == {partner.id}


def test_the_account_payload_names_its_co_owners(client, auth_headers, db):
    """Presentation is half of what co-ownership IS (spec: permission and
    presentation, never attribution). A client cannot render "Joint" from a
    payload that does not say who else owns the account."""
    owner = UserFactory(id='o2@test.com', name='Owner')
    partner = UserFactory(id='p2@test.com', name='Partner')
    account = AccountFactory(user_id=owner.id, name='Joint', type='checking')
    _db.session.commit()
    client.post(f'/api/v1/accounts/{account.id}/owners',
                headers=auth_headers(owner), json={'user_id': partner.id})

    body = client.get(f'/api/v1/accounts/{account.id}',
                      headers=auth_headers(owner)).get_json()
    assert [o['id'] for o in body['account']['owners']] == [partner.id]
    assert body['account']['owners'][0]['name'] == 'Partner'
    # The PRIMARY owner is still the primary owner and still carries attribution.
    assert body['account']['user_id'] == owner.id


def test_a_solo_account_reports_an_EMPTY_owners_list_not_a_missing_key(
        client, auth_headers, db):
    """A missing key and an empty list are different things to a client, and the
    absent one is what makes `owners.length` throw."""
    owner = UserFactory(id='o3@test.com', name='Owner')
    account = AccountFactory(user_id=owner.id, name='Solo', type='savings')
    _db.session.commit()

    body = client.get(f'/api/v1/accounts/{account.id}',
                      headers=auth_headers(owner)).get_json()
    assert body['account']['owners'] == []


def test_a_housemate_who_is_not_a_co_owner_cannot_add_one(client, auth_headers, db):
    """Granting co-ownership is a management action, so it takes the management
    predicate -- otherwise any member could quietly add themselves."""
    owner = UserFactory(id='o4@test.com', name='Owner')
    housemate = UserFactory(id='h4@test.com', name='Housemate')
    account = AccountFactory(user_id=owner.id, name='Solo', type='savings')
    _db.session.commit()

    resp = client.post(f'/api/v1/accounts/{account.id}/owners',
                       headers=auth_headers(housemate),
                       json={'user_id': housemate.id})
    assert resp.status_code == 403, resp.get_json()
    assert _owner_ids(account.id) == set()


def test_a_DEMO_user_cannot_be_added_to_a_real_account_or_the_reverse(
        client, auth_headers, db):
    """D-42, both directions. Household property must not reach a demo persona
    and demo rows must not reach the household."""
    real = UserFactory(id='r5@test.com', name='Real')
    demo = UserFactory(id='demo5@finpal.app', is_demo_user=True, name='Demo')
    real_account = AccountFactory(user_id=real.id, name='Real', type='checking')
    demo_account = AccountFactory(user_id=demo.id, name='Demo', type='checking')
    _db.session.commit()

    refused = client.post(f'/api/v1/accounts/{real_account.id}/owners',
                          headers=auth_headers(real), json={'user_id': demo.id})
    assert refused.status_code == 400, refused.get_json()
    assert _owner_ids(real_account.id) == set()

    also_refused = client.post(f'/api/v1/accounts/{demo_account.id}/owners',
                               headers=auth_headers(demo), json={'user_id': real.id})
    assert also_refused.status_code == 400, also_refused.get_json()
    assert _owner_ids(demo_account.id) == set()


def test_two_DEMO_users_CAN_co_own(client, auth_headers, db):
    """The case `is_household_member` on both sides gets wrong. The public demo's
    personas are all demo accounts, so that predicate would make co-ownership
    undemonstrable -- invisibly to any test built from real users."""
    demo_a = UserFactory(id='demo6@finpal.app', is_demo_user=True, name='One')
    demo_b = UserFactory(id='demo7@finpal.app', is_demo_user=True, name='Two')
    account = AccountFactory(user_id=demo_a.id, name='Demo joint', type='checking')
    _db.session.commit()

    resp = client.post(f'/api/v1/accounts/{account.id}/owners',
                       headers=auth_headers(demo_a), json={'user_id': demo_b.id})
    assert resp.status_code == 200, resp.get_json()
    assert _owner_ids(account.id) == {demo_b.id}


def test_the_primary_owner_cannot_be_added_as_their_own_co_owner(
        client, auth_headers, db):
    """A no-op row that would render the owner twice in a "Joint" label."""
    owner = UserFactory(id='o8@test.com', name='Owner')
    account = AccountFactory(user_id=owner.id, name='Solo', type='savings')
    _db.session.commit()

    resp = client.post(f'/api/v1/accounts/{account.id}/owners',
                       headers=auth_headers(owner), json={'user_id': owner.id})
    assert resp.status_code == 400, resp.get_json()
    assert _owner_ids(account.id) == set()


def test_adding_the_same_co_owner_twice_is_not_an_error_and_does_not_duplicate(
        client, auth_headers, db):
    """A double click must not 500 on the composite primary key."""
    owner = UserFactory(id='o9@test.com', name='Owner')
    partner = UserFactory(id='p9@test.com', name='Partner')
    account = AccountFactory(user_id=owner.id, name='Joint', type='checking')
    _db.session.commit()

    for _ in range(2):
        resp = client.post(f'/api/v1/accounts/{account.id}/owners',
                           headers=auth_headers(owner), json={'user_id': partner.id})
        assert resp.status_code == 200, resp.get_json()
    assert _owner_ids(account.id) == {partner.id}


def test_a_co_owner_can_be_removed_and_loses_the_permission_with_the_row(
        client, auth_headers, db):
    """*** THE ASSERTION THAT MATTERS IS THE SECOND ONE. *** Deleting the row and
    revoking the permission have to be the same act; a stale grant is worse than
    no grant, because nothing shows it."""
    owner = UserFactory(id='o10@test.com', name='Owner')
    partner = UserFactory(id='p10@test.com', name='Partner')
    account = AccountFactory(user_id=owner.id, name='Joint', type='checking')
    _db.session.commit()
    client.post(f'/api/v1/accounts/{account.id}/owners',
                headers=auth_headers(owner), json={'user_id': partner.id})

    removed = client.delete(f'/api/v1/accounts/{account.id}/owners/{partner.id}',
                            headers=auth_headers(owner))
    assert removed.status_code == 200, removed.get_json()
    assert _owner_ids(account.id) == set()

    blocked = client.put(f'/api/v1/accounts/{account.id}',
                         headers=auth_headers(partner), json={'name': 'Mine now'})
    assert blocked.status_code == 403, blocked.get_json()
    _db.session.expire_all()
    assert _db.session.get(Account, account.id).name == 'Joint'


def test_a_co_owner_can_remove_THEMSELVES(client, auth_headers, db):
    """Leaving a joint account should not require the other person."""
    owner = UserFactory(id='o11@test.com', name='Owner')
    partner = UserFactory(id='p11@test.com', name='Partner')
    account = AccountFactory(user_id=owner.id, name='Joint', type='checking')
    _db.session.commit()
    client.post(f'/api/v1/accounts/{account.id}/owners',
                headers=auth_headers(owner), json={'user_id': partner.id})

    resp = client.delete(f'/api/v1/accounts/{account.id}/owners/{partner.id}',
                         headers=auth_headers(partner))
    assert resp.status_code == 200, resp.get_json()
    assert _owner_ids(account.id) == set()
