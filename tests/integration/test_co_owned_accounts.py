"""Co-ownership widens `can_manage_owned` by EXACTLY ONE SET.

*** THE REFUSALS ARE THE POINT. *** This predicate was deliberately tightened away
from "any household member", and a test that only checks the new permission would
pass just as well if the rule had been widened back to everyone.

The demo cases are here because D-42's collapse-to-plain-ownership must survive in
BOTH directions, and because `is_household_member` on both sides -- the obvious
wrong predicate -- forbids demo->demo and breaks the public demo, invisibly to any
test that only builds real users.

The last block asserts through the HTTP handlers, not just the predicate. A
predicate nobody passes `account_id` to grants nothing: the two-argument call is
still valid and still refuses, so the widening is invisible until a call site
opts in. That is D-106's shape -- a helper's own test is not proof of its
adoption -- and it is why these assert on the database row, not on a status code.
"""
from src.extensions import db as _db
from src.models.account import Account
from src.models.associations import account_owners
from src.utils.household import can_manage_owned
from tests.factories import UserFactory, AccountFactory


def _co_own(account_id, user_id):
    _db.session.execute(account_owners.insert().values(
        account_id=account_id, user_id=user_id))
    _db.session.commit()


def test_a_co_owner_may_manage_that_account(db):
    owner = UserFactory(id='owner@test.com')
    partner = UserFactory(id='partner@test.com')
    account = AccountFactory(user_id=owner.id, name='Joint', type='checking')
    _db.session.commit()
    _co_own(account.id, partner.id)

    assert can_manage_owned(owner.id, partner.id, account_id=account.id) is True


def test_a_co_owner_of_ONE_account_may_not_manage_ANOTHER(db):
    """The whole reason this takes an account_id.

    Without the scoping, co-owning a single joint account would promote the partner
    to manager of every account the owner has -- which is the housemate-deletes-your-
    account defect with an extra step.
    """
    owner = UserFactory(id='owner2@test.com')
    partner = UserFactory(id='partner2@test.com')
    joint = AccountFactory(user_id=owner.id, name='Joint', type='checking')
    private = AccountFactory(user_id=owner.id, name='Private', type='savings')
    _db.session.commit()
    _co_own(joint.id, partner.id)

    assert can_manage_owned(owner.id, partner.id, account_id=joint.id) is True
    assert can_manage_owned(owner.id, partner.id, account_id=private.id) is False


def test_a_household_member_who_is_NOT_a_co_owner_is_still_refused(db):
    owner = UserFactory(id='owner3@test.com')
    housemate = UserFactory(id='housemate@test.com')
    account = AccountFactory(user_id=owner.id, name='Solo', type='checking')
    _db.session.commit()

    assert can_manage_owned(owner.id, housemate.id, account_id=account.id) is False


def test_the_old_two_argument_behaviour_is_unchanged(db):
    """Every existing caller passes two arguments and must not change meaning."""
    owner = UserFactory(id='owner4@test.com')
    housemate = UserFactory(id='housemate4@test.com')
    _db.session.commit()

    assert can_manage_owned(owner.id, owner.id) is True
    assert can_manage_owned(owner.id, housemate.id) is False


def test_a_co_owner_is_refused_when_no_account_id_is_supplied(db):
    """Fail CLOSED, not open.

    The two-argument form asks "may this caller manage things owned by that owner",
    which co-ownership does not answer -- it is per account. A call site that has an
    account in hand and does not pass it gets the old, narrower answer.
    """
    owner = UserFactory(id='owner5@test.com')
    partner = UserFactory(id='partner5@test.com')
    account = AccountFactory(user_id=owner.id, name='Joint', type='checking')
    _db.session.commit()
    _co_own(account.id, partner.id)

    assert can_manage_owned(owner.id, partner.id) is False


def test_demo_accounts_still_collapse_to_plain_ownership_in_both_directions(db):
    """D-42. A demo visitor manages only its own rows, and no demo account is ever
    treated as an admin over real household data -- even via co-ownership."""
    demo = UserFactory(id='demo1@finpal.app', is_demo_user=True)
    real = UserFactory(id='real@test.com')
    real_account = AccountFactory(user_id=real.id, name='Real', type='checking')
    demo_account = AccountFactory(user_id=demo.id, name='Demo', type='checking')
    _db.session.commit()
    _co_own(real_account.id, demo.id)
    _co_own(demo_account.id, real.id)

    assert can_manage_owned(real.id, demo.id, account_id=real_account.id) is False
    assert can_manage_owned(demo.id, real.id, account_id=demo_account.id) is False


# --- Adoption: the handlers have to pass the account, or none of the above matters --


def test_a_co_owner_can_actually_EDIT_the_joint_account(client, auth_headers, db):
    """Asserted on the database row. The PUT answers 200 for the owner either way."""
    owner = UserFactory(id='jointowner@test.com', name='Owner')
    partner = UserFactory(id='jointpartner@test.com', name='Partner')
    account = AccountFactory(user_id=owner.id, name='Joint Checking', type='checking')
    _db.session.commit()
    _co_own(account.id, partner.id)

    resp = client.put(f'/api/v1/accounts/{account.id}',
                      headers=auth_headers(partner),
                      json={'name': 'Our Joint Checking'})
    assert resp.status_code == 200, resp.get_json()

    _db.session.expire_all()
    assert _db.session.get(Account, account.id).name == 'Our Joint Checking'


def test_a_housemate_still_cannot_edit_an_account_they_do_not_co_own(
        client, auth_headers, db):
    owner = UserFactory(id='soloowner@test.com', name='Owner')
    housemate = UserFactory(id='solohousemate@test.com', name='Housemate')
    account = AccountFactory(user_id=owner.id, name='Solo Savings', type='savings')
    _db.session.commit()

    resp = client.put(f'/api/v1/accounts/{account.id}',
                      headers=auth_headers(housemate),
                      json={'name': 'Mine Now'})
    assert resp.status_code == 403, resp.get_json()

    _db.session.expire_all()
    assert _db.session.get(Account, account.id).name == 'Solo Savings'


def test_a_co_owner_may_delete_the_joint_account_and_a_housemate_may_not(
        client, auth_headers, db):
    """*** THE JUDGMENT CALL IN THIS TASK, TAKEN EXPLICITLY. ***

    Deleting an account nulls `account_id` across its whole transaction history,
    which is the damage `can_manage_owned` was tightened to prevent. Co-ownership
    is still granted here, uniformly across verbs, because a co-owner is not a
    housemate -- they were named by the owner on that specific account -- and a
    per-verb carve-out is a rule nobody remembers, which is how the two halves
    drift apart (D-99's shape).
    """
    owner = UserFactory(id='delowner@test.com', name='Owner')
    partner = UserFactory(id='delpartner@test.com', name='Partner')
    housemate = UserFactory(id='delhousemate@test.com', name='Housemate')
    joint = AccountFactory(user_id=owner.id, name='Joint To Close', type='checking')
    solo = AccountFactory(user_id=owner.id, name='Solo Kept', type='savings')
    _db.session.commit()
    _co_own(joint.id, partner.id)
    joint_id, solo_id = joint.id, solo.id

    refused = client.delete(f'/api/v1/accounts/{solo_id}',
                            headers=auth_headers(housemate))
    assert refused.status_code == 403, refused.get_json()

    allowed = client.delete(f'/api/v1/accounts/{joint_id}',
                            headers=auth_headers(partner))
    assert allowed.status_code == 200, allowed.get_json()

    _db.session.expire_all()
    assert _db.session.get(Account, joint_id) is None
    assert _db.session.get(Account, solo_id) is not None
