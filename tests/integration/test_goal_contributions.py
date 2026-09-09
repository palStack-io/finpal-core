"""Who put the money in -- which is NOT the same question as whose money it is.

Attribution is the account's owner (D-18). `paid_by` is who fronted the cash. Both
answers are correct to different questions and a contribution tracker wants the
second.
"""
from datetime import date
from decimal import Decimal

from src.extensions import db as _db
from src.models.goal import Goal
from src.services.goal.service import GoalService
from tests.factories import UserFactory, AccountFactory, ExpenseFactory


def _goal(user, account=None, **kw):
    g = Goal(user_id=user.id, name=kw.pop('name', 'A goal'),
             kind=kw.pop('kind', 'savings'), scope=kw.pop('scope', 'personal'),
             account_id=account.id if account else None,
             currency_code='USD', start_date=date(2026, 1, 1),
             status='active', **kw)
    _db.session.add(g); _db.session.commit()
    return g


def test_contributions_split_by_who_paid_not_by_who_owns(db):
    owner = UserFactory(id='harun@test.com', name='Harun')
    partner = UserFactory(id='rachel@test.com', name='Rachel')
    joint = AccountFactory(user_id=owner.id, name='Emergency', type='savings',
                           balance=Decimal('700.00'), currency_code='USD')
    _db.session.commit()

    for who, amount in ((owner, '400.00'), (partner, '300.00')):
        ExpenseFactory(user_id=owner.id, account_id=joint.id, paid_by=who.id,
                       amount=Decimal(amount), transaction_type='income',
                       currency_code='USD')
    _db.session.commit()

    goal = _goal(owner, joint, start_amount=Decimal('0'),
                 target_amount=Decimal('1000.00'))
    rows = {r['user_id']: r['amount'] for r in GoalService().contributions(goal)}

    # The account is owned by Harun alone. Attributed by OWNER this would read
    # 700/0; by `paid_by` it reads 400/300, which is what a couple actually wants.
    assert rows[owner.id] == Decimal('400.00')
    assert rows[partner.id] == Decimal('300.00')


def test_a_TRANSFER_into_the_account_counts(db):
    """*** THE CASE THE SPEC NAMES AND AN INCOME-ONLY QUERY MISSES. ***

    The spec's own words for how a couple records a contribution are "I moved $200
    into the emergency fund" -- a manually logged TRANSFER, whose destination is
    `destination_account_id`, not `account_id`. A query keyed to income alone
    reports zero contributions for the exact interaction the feature is for, and
    every test written from income rows stays green while it does.
    """
    owner = UserFactory(id='mover@test.com', name='Mover')
    partner = UserFactory(id='partner@test.com', name='Partner')
    checking = AccountFactory(user_id=owner.id, name='Checking', type='checking',
                              balance=Decimal('1000.00'), currency_code='USD')
    fund = AccountFactory(user_id=owner.id, name='Fund', type='savings',
                          balance=Decimal('200.00'), currency_code='USD')
    _db.session.commit()

    ExpenseFactory(user_id=owner.id, account_id=checking.id,
                   destination_account_id=fund.id, paid_by=partner.id,
                   amount=Decimal('200.00'), transaction_type='transfer',
                   currency_code='USD')
    _db.session.commit()

    goal = _goal(owner, fund, start_amount=Decimal('0'),
                 target_amount=Decimal('1000.00'))
    rows = {r['user_id']: r['amount'] for r in GoalService().contributions(goal)}
    assert rows == {partner.id: Decimal('200.00')}


def test_a_transfer_OUT_of_the_account_is_not_a_contribution(db):
    """The mirror. The source account of a transfer is losing the money."""
    owner = UserFactory(id='out@test.com', name='Out')
    fund = AccountFactory(user_id=owner.id, name='Fund', type='savings',
                          balance=Decimal('0.00'), currency_code='USD')
    elsewhere = AccountFactory(user_id=owner.id, name='Elsewhere', type='checking',
                               balance=Decimal('0.00'), currency_code='USD')
    _db.session.commit()
    ExpenseFactory(user_id=owner.id, account_id=fund.id,
                   destination_account_id=elsewhere.id, paid_by=owner.id,
                   amount=Decimal('300.00'), transaction_type='transfer',
                   currency_code='USD')
    _db.session.commit()

    goal = _goal(owner, fund, start_amount=Decimal('0'),
                 target_amount=Decimal('1000.00'))
    assert GoalService().contributions(goal) == []


def test_an_ordinary_EXPENSE_on_the_account_is_not_a_contribution(db):
    """Spending from the fund is the opposite of contributing to it."""
    owner = UserFactory(id='spend@test.com', name='Spender')
    fund = AccountFactory(user_id=owner.id, name='Fund', type='savings',
                          balance=Decimal('0.00'), currency_code='USD')
    _db.session.commit()
    ExpenseFactory(user_id=owner.id, account_id=fund.id, paid_by=owner.id,
                   amount=Decimal('50.00'), transaction_type='expense',
                   currency_code='USD')
    _db.session.commit()

    goal = _goal(owner, fund, start_amount=Decimal('0'),
                 target_amount=Decimal('1000.00'))
    assert GoalService().contributions(goal) == []


def test_an_imported_row_is_FLAGGED_not_folded_into_one_partners_total(db):
    """`creation.py` is `paid_by=payload.get('paid_by', user_id)` -- it defaults
    to whoever CREATED the row. For a manually logged transfer that is accurate. For
    a CSV-imported or SimpleFin-synced row it credits the importer, not the payer.

    Showing that total unlabelled would tell one partner they contributed money the
    other actually paid. The row stays; the claim is qualified.
    """
    owner = UserFactory(id='importer@test.com', name='Importer')
    joint = AccountFactory(user_id=owner.id, name='Joint', type='savings',
                           balance=Decimal('500.00'), currency_code='USD')
    _db.session.commit()
    ExpenseFactory(user_id=owner.id, account_id=joint.id, paid_by=owner.id,
                   amount=Decimal('500.00'), transaction_type='income',
                   currency_code='USD', import_source='csv')
    _db.session.commit()

    goal = _goal(owner, joint, start_amount=Decimal('0'),
                 target_amount=Decimal('1000.00'))
    rows = GoalService().contributions(goal)

    assert len(rows) == 1
    assert rows[0]['imported'] is True, (
        'an imported row was folded into a partner total with no qualification')


def test_one_imported_row_flags_that_partner_and_not_the_other(db):
    """`max()` over the group, so the flag is per person, not per breakdown.

    Flagging everyone because one row was imported would train the user to ignore
    the label, which is worse than not showing it.
    """
    a = UserFactory(id='manual@test.com', name='Manual')
    b = UserFactory(id='synced@test.com', name='Synced')
    joint = AccountFactory(user_id=a.id, name='Joint', type='savings',
                           balance=Decimal('0.00'), currency_code='USD')
    _db.session.commit()
    ExpenseFactory(user_id=a.id, account_id=joint.id, paid_by=a.id,
                   amount=Decimal('100.00'), transaction_type='income',
                   currency_code='USD')
    ExpenseFactory(user_id=a.id, account_id=joint.id, paid_by=b.id,
                   amount=Decimal('100.00'), transaction_type='income',
                   currency_code='USD', import_source='simplefin')
    _db.session.commit()

    goal = _goal(a, joint, start_amount=Decimal('0'),
                 target_amount=Decimal('1000.00'))
    flags = {r['user_id']: r['imported'] for r in GoalService().contributions(goal)}
    assert flags == {a.id: False, b.id: True}


def test_a_manual_goal_has_NO_contributions_not_zero(db):
    """An empty list, never a row reading $0.00.

    There is no account, so there are no rows and no honest way to say who
    contributed. A `$0.00` beside a name reads as a measurement -- it says "this
    person put in nothing" when the truth is "nobody knows".
    """
    owner = UserFactory(id='manualgoal@test.com', name='Manual')
    goal = _goal(owner, None, start_amount=Decimal('0'),
                 target_amount=Decimal('1000.00'))
    assert GoalService().contributions(goal) == []


def test_a_contributor_with_no_name_still_renders(db):
    """`User.name` is nullable and nothing backfills it (D-154). A None here
    reaches a template and, in the report, took down the whole household."""
    nameless = UserFactory(id='nameless@test.com', name=None)
    joint = AccountFactory(user_id=nameless.id, name='Joint', type='savings',
                           balance=Decimal('0.00'), currency_code='USD')
    _db.session.commit()
    ExpenseFactory(user_id=nameless.id, account_id=joint.id, paid_by=nameless.id,
                   amount=Decimal('10.00'), transaction_type='income',
                   currency_code='USD')
    _db.session.commit()

    goal = _goal(nameless, joint, start_amount=Decimal('0'),
                 target_amount=Decimal('100.00'))
    rows = GoalService().contributions(goal)
    assert rows[0]['display_name'] == 'nameless'
