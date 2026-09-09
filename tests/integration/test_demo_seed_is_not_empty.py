"""The demo must demonstrate the features it ships. D-77.

*** AN EMPTY STATE AND A BROKEN PAGE ARE INDISTINGUISHABLE TO SOMEONE WHO HAS NEVER
SEEN THE WORKING VERSION. *** That is not a style opinion — it is how this project
has lost time three times, most expensively D-107, where a capture fixture sent
three keys the API never sends, the page rendered `$NaN` eight times, and BOTH
gates called it clean because NaN has a contrast ratio and does not overflow.

Measured on the LIVE demo before this existed:

    demo1@finpal.demo   portfolios=0   <- the account the tour lands on
    demo4@finpal.demo   portfolios=2
    Apartment Roommates expenses=0
    Trip to Vegas       expenses=0
    Office Lunch Club   expenses=0

So Investments demoed itself empty on the account a visitor sees, and every
split-expense surface — group detail, the IOU tracker, who-owes-whom — had no money
in it at all.

**Asserted on the DATABASE after seeding, not on a status code.** The seeder returns
a success dict whether or not it created anything.
"""
import pytest

from src.models.group import Group
from src.models.investment import Portfolio
from src.models.transaction import Expense
from src.models.user import User
from src.services.demo.service import DemoService

TOUR_LANDS_ON = 'demo1@finpal.demo'


@pytest.fixture
def seeded(app, db, monkeypatch):
    """Seed the demo accounts once, with demo mode forced on."""
    monkeypatch.setitem(app.config, 'DEMO_MODE', True)
    monkeypatch.setenv('DEMO_MODE', 'true')
    DemoService.seed_demo_accounts()
    db.session.commit()
    return db


def test_the_seed_actually_created_the_demo_users(seeded):
    """The control group. Every assertion below is vacuous if seeding no-opped —
    and `seed_demo_accounts` returns a success dict either way."""
    users = [u.id for u in User.query.all() if u.id.endswith('@finpal.demo')]
    assert TOUR_LANDS_ON in users, f'seeding produced no demo1; got {users}'
    assert len(users) >= 4


def test_the_account_the_tour_lands_on_owns_investments(seeded):
    """demo1 had ZERO portfolios while all of them belonged to demo4, so the
    Investments page demoed itself empty on the only account most visitors see."""
    portfolios = Portfolio.query.filter_by(user_id=TOUR_LANDS_ON).all()
    assert portfolios, 'demo1 owns no investments — Investments demos itself empty'
    holdings = sum(len(p.investments) for p in portfolios)
    assert holdings >= 2, f'{holdings} holdings is not a portfolio, it is a stub'


def test_the_investor_still_has_the_richer_set(seeded):
    """demo1 getting a starter portfolio must not flatten the difference between
    the personas — demo4 is the one whose whole point is investing."""
    demo1 = Portfolio.query.filter_by(user_id=TOUR_LANDS_ON).count()
    demo4 = Portfolio.query.filter_by(user_id='demo4@finpal.demo').count()
    assert demo4 > demo1, f'investor {demo4} vs budgeter {demo1}'


def test_every_demo_group_holds_expenses(seeded):
    """Three groups with members and no money. Every split surface was empty."""
    groups = Group.query.all()
    assert groups, 'no demo groups at all'
    for group in groups:
        n = Expense.query.filter_by(group_id=group.id).count()
        assert n > 0, f'group {group.name!r} holds no expenses'


def test_group_expenses_are_not_all_paid_by_one_person(seeded):
    """*** THE ASSERTION THAT MAKES THE IOU TRACKER WORTH LOOKING AT. ***

    If one member pays for everything, every balance points the same way and the
    tracker shows a single one-way debt — the least informative arrangement
    possible, and still indistinguishable from a bug to anyone checking whether
    settling up works. Rotating the payer makes the balances cross.
    """
    for group in Group.query.all():
        payers = {e.paid_by for e in Expense.query.filter_by(group_id=group.id)}
        if Expense.query.filter_by(group_id=group.id).count() > 1:
            assert len(payers) > 1, (
                f'every expense in {group.name!r} was paid by {payers} — '
                'the IOU tracker has nothing to show')


def test_group_expenses_are_split_with_the_members(seeded):
    """An expense with no `split_with` owes nobody anything, so the group page
    renders rows and the IOU tracker still reads zero — which is D-77's shape
    surviving the fix."""
    for group in Group.query.all():
        for expense in Expense.query.filter_by(group_id=group.id):
            assert expense.split_with, (
                f'{expense.description!r} is in a group and split with nobody')
