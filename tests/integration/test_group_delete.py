"""Deleting a group has never worked.

Found on 2026-08-05 while cleaning up rows created to verify D-21 against the
deployed instance: `DELETE /api/v1/groups/<id>` answered

    400 {"error": "Error deleting group: Entity namespace for \\"settlements\\"
         has no property \\"group_id\\""}

`GroupService.delete_group` calls `Settlement.query.filter_by(group_id=...)`, and
`Settlement` (src/models/group.py:153) has no such column — it links a payer to a
receiver and nothing else. So the query raises before anything is deleted, the
handler converts it to a 400, and the group survives. Every group delete, for
every user, since the code was written.

It is exposed in both clients: the mobile groups screen renders a red "Delete"
action per group card, and the web Groups page has the same. Nothing in the suite
covered it, and a status-code assertion would not have helped — the endpoint
*does* return a coherent-looking error. The DB is the only place that shows it.

Settlements are not group-scoped anywhere else either (`src/utils/helpers.py:132`
filters them by `payer_id`/`receiver_id`; `scripts/load_demo_data.py` builds one
with no group), so the fix is to drop the line rather than add a column: there is
no group association to cascade.
"""
from datetime import datetime

from src.extensions import db
from src.models.group import Group
from src.models.transaction import Expense
from tests.factories import UserFactory


def _group(user, **kw):
    fields = dict(name='Doomed', description='', created_by=user.id,
                  default_split_method='equal', auto_include_all=False)
    fields.update(kw)
    group = Group(**fields)
    group.members.append(user)
    db.session.add(group)
    db.session.commit()
    return group


def test_deleting_a_group_actually_removes_it(client, db, auth_headers):
    """Asserted against the database. The endpoint returned a tidy 400 while the
    row stayed put, which is why this needs the DB and not a status code."""
    user = UserFactory()
    group = _group(user)
    gid = group.id

    resp = client.delete('/api/v1/groups/%d' % gid, headers=auth_headers(user))

    assert Group.query.filter_by(id=gid).first() is None, (
        'the group survived its own delete; response was %s %s'
        % (resp.status_code, resp.get_data(as_text=True)[:200]))


def test_deleting_a_group_detaches_its_transactions_rather_than_dropping_them(
        client, db, auth_headers):
    """The one piece of `delete_group` that was already right, pinned so the fix
    does not throw it away: a group's expenses are real financial records and
    must survive, with `group_id` cleared."""
    user = UserFactory()
    group = _group(user)
    gid = group.id
    expense = Expense(
        description='Shared dinner', amount=40.0, date=datetime(2026, 8, 5),
        user_id=user.id, paid_by=user.id, card_used='', split_method='equal',
        group_id=gid)
    db.session.add(expense)
    db.session.commit()
    eid = expense.id

    client.delete('/api/v1/groups/%d' % gid, headers=auth_headers(user))

    survivor = Expense.query.filter_by(id=eid).first()
    assert survivor is not None, 'deleting a group destroyed its transactions'
    assert survivor.group_id is None, (
        'the transaction still points at the deleted group %r' % survivor.group_id)


def test_only_the_creator_can_delete(client, db, auth_headers):
    """Pinned because the fix touches this method: the ownership check must stay."""
    owner = UserFactory()
    intruder = UserFactory()
    group = _group(owner)
    group.members.append(intruder)
    db.session.commit()
    gid = group.id

    client.delete('/api/v1/groups/%d' % gid, headers=auth_headers(intruder))

    assert Group.query.filter_by(id=gid).first() is not None, (
        'a non-creator member deleted the group')
