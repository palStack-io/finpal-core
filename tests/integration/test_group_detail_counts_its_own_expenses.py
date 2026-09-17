"""The two group endpoints must not disagree about whether a group has anything in it.

*** THE SYMPTOM WAS A PAGE CONTRADICTING THE PAGE IT WAS REACHED FROM. *** On the
live demo, `/groups` showed "Apartment Roommates · 2 expenses" and clicking it
opened `/groups/1`, whose Recent Transactions panel said **"No transactions
yet."** Both screens were reporting what their endpoint told them. The list route
serves `expense_count`; the single-group route omitted it entirely, so the detail
page had nothing to read and fell back to a `/transactions/?group_id=` filter that
returns an empty list — and rendered a cheerful empty state about a group with two
expenses in it. AUDIT D-236.

*** THE TEST IS THE AGREEMENT, NOT THE FIELD. *** Asserting that the key exists
would pass against a hardcoded zero, which is the failure mode that produced the
bug: a client that confidently renders a figure nobody computed. So this compares
the two endpoints' answers for the SAME group and requires them to match, and it
builds a group with a non-zero count first — a fixture where both are 0 cannot
tell a working count from a missing one.

`Expense` lives in `src.models.transaction`, not `src.models.expense`.
"""
from datetime import datetime

from src.extensions import db as _db
from src.models.group import Group
from src.models.transaction import Expense
from tests.factories import UserFactory


def _group_with(*members):
    group = Group(name='Apartment Roommates', created_by=members[0].id)
    for member in members:
        group.members.append(member)
    _db.session.add(group)
    _db.session.commit()
    return group


def _expense_in(group, payer, members, amount=356.05):
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


def _counts(client, headers, group_id):
    """(what the list says, what the detail says) for one group."""
    listed = client.get('/api/v1/groups/', headers=headers).get_json()['groups']
    row = next(g for g in listed if g['id'] == group_id)
    detail = client.get(f'/api/v1/groups/{group_id}', headers=headers)
    assert detail.status_code == 200, detail.get_json()
    return row['expense_count'], detail.get_json()['group']['expense_count']


def test_both_endpoints_report_the_same_expense_count(client, auth_headers, db):
    owner = UserFactory(password_plain='secret')
    other = UserFactory()
    group = _group_with(owner, other)
    _expense_in(group, owner, [owner, other])
    _expense_in(group, other, [owner, other], amount=94.10)

    headers = auth_headers(owner, password='secret')
    listed, detail = _counts(client, headers, group.id)

    assert listed == 2, f'the list route regressed: {listed}'
    # The assertion the defect failed. Before this change `detail` was absent
    # from the payload entirely and the page guessed.
    assert detail == listed


def test_an_empty_group_reports_zero_rather_than_omitting_the_key(
        client, auth_headers, db):
    """Zero is a real answer, and an absent key is not the same statement.

    The client renders 0 as "nothing recorded yet". It cannot distinguish an
    absent key from an empty group, so an endpoint that drops the field when
    there is nothing to count reintroduces exactly the ambiguity this closes.
    """
    owner = UserFactory(password_plain='secret')
    group = _group_with(owner, UserFactory())

    headers = auth_headers(owner, password='secret')
    detail = client.get(f'/api/v1/groups/{group.id}', headers=headers).get_json()

    assert 'expense_count' in detail['group']
    assert detail['group']['expense_count'] == 0


def test_the_count_is_scoped_to_the_group_it_is_asked_about(
        client, auth_headers, db):
    """Or one number describes every group the caller can see.

    A `COUNT` without the `group_id` filter would pass the first test in this
    file — that group holds every expense in the fixture — and would be wrong
    the moment a second group exists. Two groups, different counts.
    """
    owner = UserFactory(password_plain='secret')
    other = UserFactory()
    busy = _group_with(owner, other)
    quiet = _group_with(owner, other)
    _expense_in(busy, owner, [owner, other])
    _expense_in(busy, owner, [owner, other], amount=12.00)
    _expense_in(quiet, owner, [owner, other], amount=8.40)

    headers = auth_headers(owner, password='secret')
    assert _counts(client, headers, busy.id) == (2, 2)
    assert _counts(client, headers, quiet.id) == (1, 1)
