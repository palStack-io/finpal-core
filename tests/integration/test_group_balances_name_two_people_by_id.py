"""A settlement says WHO owes whom by id, not only by display name.

*** THIS WAS A RECORDED BLOCKER, NOT A WISH. *** `web-ui/src/pages/Groups.tsx` carries the
note that killed its own "You owe"/"You are owed" cards:

    /groups/{id}/balances exists but returns simplified debts keyed by display name,
    not user id, so aggregating them across groups needs a backend change first.

Those two cards had been `const totalOwed = 0` with a "mock for now" comment, so the page
rendered a confident **$0.00** whatever the real balances were. Removing them was right. This is
the backend change the note asked for, and `calculate_group_balances` already had both ids in
scope — it computed `debtor_id` and `creditor_id`, used them to look the two users up, and then
emitted only the names.

*** WHY NAME-MATCHING WOULD BE THE DEFECT RATHER THAN THE SHORTCUT. *** Two members of one
instance can share a display name, and the test below builds exactly that: a client aggregating
by name attributes one person's debt to another, silently, in a figure the user is meant to settle
money from. `Category` name collisions already forced the same refusal on the Categories page —
six of the demo's category names are duplicated — so this is a known shape here, and the fix is an
id rather than a cleverer string match.

`from` and `to` are asserted to be UNCHANGED, because every existing consumer reads them.
"""
from datetime import datetime

from src.extensions import db as _db
from src.models.group import Group
from src.models.transaction import Expense
from src.services.group.service import GroupService
from tests.factories import UserFactory

service = GroupService()


def _group_with(*members, creator=None):
    group = Group(name='Flat', created_by=(creator or members[0]).id)
    for member in members:
        group.members.append(member)
    _db.session.add(group)
    _db.session.commit()
    return group


def _shared_expense(group, payer, amount, members):
    """One expense paid by `payer` and split equally across `members`."""
    expense = Expense(
        description='Rent', amount=amount, date=datetime.utcnow(),
        user_id=payer.id, paid_by=payer.id, group_id=group.id,
        split_method='equal', card_used='Test Card',
        transaction_type='expense', currency_code='USD',
        split_with=','.join(m.id for m in members),
    )
    _db.session.add(expense)
    _db.session.commit()
    return expense


def test_a_settlement_carries_both_user_ids(app, db):
    payer, ower = UserFactory(name='Jordan Demo'), UserFactory(name='Alex Demo')
    group = _group_with(payer, ower)
    _shared_expense(group, payer, 100.0, [payer, ower])

    debts = service.calculate_group_balances(group.id)['simplified_debts']

    assert debts, 'a split expense produced no settlement at all'
    debt = debts[0]
    assert debt['from_id'] == ower.id, debt
    assert debt['to_id'] == payer.id, debt
    # The names stay exactly as they were: this is an addition, not a change.
    assert debt['from'] == 'Alex Demo'
    assert debt['to'] == 'Jordan Demo'


def test_two_members_sharing_a_display_name_stay_distinguishable(app, db):
    """*** THE REASON THE IDS ARE NEEDED, STATED AS A TEST. ***

    Both debtors are called "Alex Demo". A client aggregating by name cannot tell whose debt is
    whose and would report one person's total to the other; by id it is unambiguous.
    """
    payer = UserFactory(name='Jordan Demo')
    one, two = UserFactory(name='Alex Demo'), UserFactory(name='Alex Demo')
    group = _group_with(payer, one, two)
    _shared_expense(group, payer, 300.0, [payer, one, two])

    debts = service.calculate_group_balances(group.id)['simplified_debts']

    by_id = {d['from_id'] for d in debts}
    assert by_id == {one.id, two.id}, f'expected both debtors by id, got {debts}'
    # And the thing that makes the ids necessary: the names alone are identical.
    assert {d['from'] for d in debts} == {'Alex Demo'}
    assert one.id != two.id


def test_the_route_passes_the_ids_through(client, db, auth_headers):
    """Asserted on the PAYLOAD, not on the service: the route is what the client reads."""
    payer, ower = UserFactory(name='Jordan Demo'), UserFactory(name='Alex Demo')
    group = _group_with(payer, ower, creator=payer)
    _shared_expense(group, payer, 60.0, [payer, ower])

    response = client.get(f'/api/v1/groups/{group.id}/balances',
                          headers=auth_headers(payer))

    assert response.status_code == 200, response.data
    balances = response.get_json()['balances']
    assert balances, response.get_json()
    assert balances[0]['from_id'] == ower.id
    assert balances[0]['to_id'] == payer.id
