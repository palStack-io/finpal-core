"""D-94 — a group could hold someone from the other side of the demo boundary, both ways.

**The owner's question is what found this:** *"how does someone get added to the group? dont they
need to be a user for that household instance?"* — and the answer is **yes, they do**:
`add_member` looks the person up and answers *'User not found'* otherwise. There is no invite or
email flow, so an outsider cannot be pulled in. *** SINCE "HOUSEHOLD" IN THIS CODEBASE MEANS
"EVERY NON-DEMO USER ON THE INSTANCE" (there is no household table — see
`src/utils/household.py`), being a user IS being a household member, and group membership is
therefore household-scoped by construction. ***

**Which leaves exactly one way in, and it leaked in both directions:**

  - a household creator could add a **demo** account to a real group, and
  - a **demo** creator could add a real household member to a demo group.

The second is the one that matters. Demo accounts are handed to the public on
`findemo.palstack.io`, that instance really does have a non-demo user on it, and `add_member`
takes an **email** — so a demo session could pull a real person into a sandbox group whose
expenses and balances then involve them.

*** THE PREDICATE IS "SAME SIDE", NOT "BOTH MUST BE HOUSEHOLD" — AND THE DIFFERENCE IS LOAD
BEARING. *** D-81 fixed the parallel leak on account ownership with
`not is_household_member(target) or not is_household_member(caller)`, which is right there:
ownership of household property must never move at all for a demo account. Copying that shape
here would forbid **demo-to-demo** adds and break the public demo, whose seeded groups are
multi-member. So the rule is that the two ids sit on the same side of the boundary, which is the
symmetric sandbox D-42 established: household property must not reach a demo persona, and demo
rows must not reach the household.

The tests below assert both refusals **and both permissions**, because an over-restriction here is
as much a defect as the leak — and it would only show up on the public demo, which no unit test
visits.
"""
from src.models.group import Group
from src.extensions import db as _db
from src.services.group.service import GroupService
from tests.factories import UserFactory

service = GroupService()


def _group_owned_by(creator):
    """A group with its creator as the only member, built the way the service does."""
    group = Group(name='Household', created_by=creator.id)
    group.members.append(creator)
    _db.session.add(group)
    _db.session.commit()
    return group


# --------------------------------------------------------------------------- the leak, both ways

def test_a_household_group_refuses_a_demo_account(app, db):
    household, demo = UserFactory(is_demo_user=False), UserFactory(is_demo_user=True)
    group = _group_owned_by(household)

    ok, message = service.add_member(group.id, household.id, demo.id)

    assert ok is False, 'a demo account was admitted to a real household group'
    assert 'household' in message.lower(), message
    _db.session.refresh(group)
    assert demo not in group.members


def test_a_demo_group_refuses_a_household_member(app, db):
    """The direction that matters: a public demo session reaching a real person."""
    household, demo = UserFactory(is_demo_user=False), UserFactory(is_demo_user=True)
    group = _group_owned_by(demo)

    ok, message = service.add_member(group.id, demo.id, household.id)

    assert ok is False, 'a demo session pulled a real household member into its group'
    assert 'household' in message.lower(), message
    _db.session.refresh(group)
    assert household not in group.members


# ------------------------------------------------- the inverse: what must KEEP working

def test_a_household_member_can_still_be_added(app, db):
    """The ordinary path. A guard that blocks this breaks the actual feature."""
    creator, partner = UserFactory(is_demo_user=False), UserFactory(is_demo_user=False)
    group = _group_owned_by(creator)

    ok, message = service.add_member(group.id, creator.id, partner.id)

    assert ok is True, message
    _db.session.refresh(group)
    assert partner in group.members


def test_a_demo_account_can_still_add_another_demo_account(app, db):
    """*** THIS IS WHY THE PREDICATE IS NOT D-81's. ***

    The public demo's groups are multi-member and demo-owned. Forbidding this would make the
    demo's own "add member" refuse everything — invisible to every test that only builds real
    users, and visible to every visitor.
    """
    demo_one, demo_two = UserFactory(is_demo_user=True), UserFactory(is_demo_user=True)
    group = _group_owned_by(demo_one)

    ok, message = service.add_member(group.id, demo_one.id, demo_two.id)

    assert ok is True, message
    _db.session.refresh(group)
    assert demo_two in group.members


# ------------------------------------------------- the property that answers the owner's question

def test_someone_with_no_account_here_cannot_be_added(app, db):
    """No invite flow exists, and this is what makes groups household-scoped by construction."""
    household = UserFactory(is_demo_user=False)
    group = _group_owned_by(household)

    ok, message = service.add_member(group.id, household.id, 'a-stranger@example.com')

    assert ok is False
    assert message == 'User not found'
    _db.session.refresh(group)
    assert len(group.members) == 1


# --------------------------------------------------------------------------- the creation path too

def test_creating_a_group_refuses_a_member_from_the_other_side(app, db):
    """`create_group` takes member ids directly, so fixing only `add_member` leaves a second door.

    It **refuses** rather than silently dropping the member: a group created without the person
    you named, reporting success, is the silent-data-loss shape this project keeps finding
    (D-82's family). Note the pre-existing behaviour for an id that does not exist *at all* is
    still a silent skip — that is a separate, milder issue and is left alone here.
    """
    household, demo = UserFactory(is_demo_user=False), UserFactory(is_demo_user=True)

    ok, message, group = service.create_group(
        household.id, 'Flat', 'desc', [demo.id])

    assert ok is False, 'a demo account was admitted at creation time'
    assert 'household' in message.lower(), message
    assert group is None


def test_creating_a_group_with_household_members_still_works(app, db):
    creator, partner = UserFactory(is_demo_user=False), UserFactory(is_demo_user=False)

    ok, message, group = service.create_group(
        creator.id, 'Flat', 'desc', [partner.id])

    assert ok is True, message
    assert partner in group.members
    assert creator in group.members
