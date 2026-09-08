"""The IOU tracker must count repayments (stream A, item A3 — D-152).

`AnalyticsService._calculate_iou_data` summed split shares and never looked at
the `settlements` table, so a debt that had been paid in full was still
reported as outstanding. `Group.calculate_balances` in `src/models/group.py`
applies settlements when it answers the same question, so the product held two
answers and only one of them was right.

It was latent rather than live: `/analytics/dashboard` serves the figure as
`summary.net_balance` but no client screen renders it, and a sweep of
`web-ui/src/` and `mobile/src/` finds no reader of `owes_me`, `i_owe` or
`iou_data`. Stream A is what makes it live — the report email's repayment
tracker is this number, in a real person's inbox — so it is fixed before it is
exposed rather than after.

The second half of the fix is the window. The dashboard computed IOUs from the
expenses it had already loaded, which start at **December 1st of the previous
year** so the dashboard's own queries stay bounded. A debt balance is as-of by
nature: what someone owes you does not stop being owed because it happened in
November. `get_iou_data` therefore runs its own query over split rows only,
which is what keeps it bounded instead.

*** `User.id` IS THE EMAIL (`src/models/user.py:16`), *** which is why keying
the subtraction on `split['id']` against `Settlement.payer_id` is sound and
not a fixture coincidence: both are `users.id`.
"""
from datetime import datetime, timedelta
from decimal import Decimal

import pytest

from src.extensions import db as _db
from src.models.group import Settlement
from src.services.analytics.service import AnalyticsService
from tests.factories import AccountFactory, ExpenseFactory, UserFactory


@pytest.fixture
def svc():
    return AnalyticsService()


def _split_expense(payer, other, amount, when=None, **kwargs):
    """An expense `payer` paid and split equally with `other`."""
    account = AccountFactory(user_id=payer.id)
    return ExpenseFactory(
        user_id=payer.id, account_id=account.id, amount=Decimal(str(amount)),
        date=when or datetime.utcnow(), paid_by=payer.id,
        split_method='equal', split_with=other.id, **kwargs)


def _settle(payer, receiver, amount, when=None):
    _db.session.add(Settlement(
        payer_id=payer.id, receiver_id=receiver.id, amount=Decimal(str(amount)),
        date=when or datetime.utcnow(), description='Settlement'))
    _db.session.commit()


def test_an_unsettled_split_is_owed_to_the_payer(db, svc):
    """The baseline the rest of the file moves off. Half of 100 is owed."""
    me = UserFactory()
    them = UserFactory()
    _split_expense(me, them, 100)

    iou = svc.get_iou_data(me.id)

    assert iou.net_balance == Decimal('50.00')
    assert iou.owes_me[them.id]['amount'] == Decimal('50.00')


def test_a_settlement_that_covers_the_debt_clears_it(db, svc):
    me = UserFactory()
    them = UserFactory()
    _split_expense(me, them, 100)
    _settle(them, me, 50)

    iou = svc.get_iou_data(me.id)

    assert iou.net_balance == Decimal('0')
    assert iou.owes_me.get(them.id, {}).get('amount', Decimal('0')) == Decimal('0')


def test_a_partial_repayment_leaves_only_the_remainder(db, svc):
    me = UserFactory()
    them = UserFactory()
    _split_expense(me, them, 100)
    _settle(them, me, 20)

    iou = svc.get_iou_data(me.id)

    assert iou.owes_me[them.id]['amount'] == Decimal('30.00')
    assert iou.net_balance == Decimal('30.00')


def test_an_overpayment_clears_the_debt_without_inverting_it(db, svc):
    """Paying more than you owe must not make the other person your debtor.

    `Group.calculate_balances` clamps at zero for the same reason; a negative
    here would read as "you owe them 30" on a debt they overpaid.
    """
    me = UserFactory()
    them = UserFactory()
    _split_expense(me, them, 100)
    _settle(them, me, 80)

    iou = svc.get_iou_data(me.id)

    assert iou.owes_me.get(them.id, {}).get('amount', Decimal('0')) == Decimal('0')
    assert iou.net_balance == Decimal('0')


def test_a_repayment_i_made_reduces_what_i_owe(db, svc):
    """The other direction. A backwards sign would inflate the debt instead."""
    me = UserFactory()
    them = UserFactory()
    _split_expense(them, me, 100)   # they paid, so I owe them 50

    before = svc.get_iou_data(me.id)
    assert before.i_owe[them.id]['amount'] == Decimal('50.00')
    assert before.net_balance == Decimal('-50.00')

    _settle(me, them, 50)
    after = svc.get_iou_data(me.id)

    assert after.i_owe.get(them.id, {}).get('amount', Decimal('0')) == Decimal('0')
    assert after.net_balance == Decimal('0')


def test_a_settlement_between_two_other_people_leaves_my_balances_alone(db, svc):
    """*** THIS GUARDS A PAIR OF REDUNDANT CHECKS, NOT ONE CHECK. ***

    Two things stop a stranger's repayment clearing my debt: the query only
    fetches settlements I am a party to, and the loop only applies one whose
    payer/receiver matches me. Sabotaging EITHER alone leaves all ten tests
    green — verified, both ways — because a settlement the query returns
    always has me as one party and the other person as the dict key, so the
    two conditions are equivalent in that case. Sabotaging both together
    fails this test.

    Recorded because a green run here does not mean both halves are intact,
    and the loop's half is the one that starts mattering if the query is ever
    widened to cover more than one member.
    """
    me = UserFactory()
    them = UserFactory()
    stranger = UserFactory()
    _split_expense(me, them, 100)
    _settle(stranger, them, 50)
    _settle(them, stranger, 50)

    iou = svc.get_iou_data(me.id)

    assert iou.owes_me[them.id]['amount'] == Decimal('50.00')
    assert iou.net_balance == Decimal('50.00')


def test_a_debt_older_than_the_dashboards_window_is_still_owed(db, svc):
    """The window half of the fix.

    The dashboard's expense query starts at December 1st of the previous year.
    A debt from before that had silently stopped existing.
    """
    me = UserFactory()
    them = UserFactory()
    _split_expense(me, them, 100, when=datetime.utcnow() - timedelta(days=730))

    iou = svc.get_iou_data(me.id)

    assert iou.owes_me[them.id]['amount'] == Decimal('50.00')


def test_rows_with_no_split_do_not_move_the_figures(db, svc):
    """`get_iou_data` queries only rows with a `split_with`, to stay bounded.

    That is only sound if an unsplit row contributes nothing, so this asserts
    the equivalence rather than assuming it.
    """
    me = UserFactory()
    them = UserFactory()
    _split_expense(me, them, 100)
    with_only_the_split = svc.get_iou_data(me.id)

    account = AccountFactory(user_id=me.id)
    ExpenseFactory(user_id=me.id, account_id=account.id, amount=Decimal('500.00'),
                   date=datetime.utcnow(), paid_by=me.id, split_method='none',
                   description='My own lunch')

    assert svc.get_iou_data(me.id) == with_only_the_split


def test_the_figures_are_decimals(db, svc):
    """D-58: money is Numeric, and `float + Decimal` raises rather than coercing.

    The group code this mirrors uses `defaultdict(float)` and `max(0.0, ...)`;
    copying that shape here would either raise or reintroduce binary error.
    """
    me = UserFactory()
    them = UserFactory()
    _split_expense(me, them, 100)
    _settle(them, me, 20)

    iou = svc.get_iou_data(me.id)

    assert isinstance(iou.net_balance, Decimal)
    assert isinstance(iou.owes_me[them.id]['amount'], Decimal)


def test_the_dashboard_reports_the_same_figure_as_the_accessor(db, svc):
    """One answer, so the email and the dashboard cannot drift apart (D-129).

    This is what makes the fix reach the existing payload rather than only the
    new caller: `/analytics/dashboard` serves this as `summary.net_balance`.
    """
    me = UserFactory()
    them = UserFactory()
    _split_expense(me, them, 100)
    _settle(them, me, 50)

    dashboard = svc.get_dashboard_data(me.id)['iou_data']
    accessor = svc.get_iou_data(me.id)

    assert dashboard.net_balance == accessor.net_balance == Decimal('0')
