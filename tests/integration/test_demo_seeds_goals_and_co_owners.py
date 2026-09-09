"""The demo has to demonstrate goals and co-ownership, not their empty states.

*** THIS IS D-77/B9 FOR THE FEATURE B1–B9 JUST ADDED. *** The previous pass closed
exactly this for investments and group expenses, and shipping goals without
touching the seed reopened it one table over: the deployed demo had `goals=0`,
`account_owners=0` and three credit cards with a NULL `credit_limit`, so the Goals
page, the "Joint" badge and the Available Credit block all demoed themselves
missing.

An empty state and a broken page are indistinguishable to someone who has never
seen the working version. That is what cost D-107, where a fixture sent keys the
API never sends, the page rendered `$NaN` eight times, and both gates called it
clean because NaN has a contrast ratio and does not overflow.

*** AND THE BACKFILL IS THE HALF THAT MATTERS. *** `seed_demo_accounts` does
`continue` for a user that already exists, so seeding alone applies to a FRESH
install and never to the one deployed demo it is written for. #158 was correct and
changed nothing until #159 added the backfill; these tests assert both halves.
"""
from decimal import Decimal

import pytest

from src.extensions import db as _db
from src.models.account import Account
from src.models.associations import account_owners
from src.models.goal import Goal
from src.models.transaction import Expense
from src.models.user import User
from src.services.demo.service import DemoService
from src.services.goal.service import GoalService


@pytest.fixture
def demo_mode(app, db, monkeypatch):
    """DEMO_MODE on, so the seeder does not refuse at its first line."""
    monkeypatch.setattr(DemoService, 'is_demo_mode', staticmethod(lambda: True))
    return app


def _demo1():
    return User.query.filter_by(id='demo1@finpal.demo').first()


def _goals_of(user_id):
    return {g.name: g for g in Goal.query.filter_by(user_id=user_id).all()}


# --- A FRESH install ----------------------------------------------------------


def test_a_freshly_seeded_demo_has_goals_on_the_account_the_tour_lands_on(demo_mode):
    """demo1 is where the tour lands. D-77's whole lesson."""
    DemoService.seed_demo_accounts()

    goals = _goals_of('demo1@finpal.demo')
    assert goals, 'demo1 has no goals; the Goals page demos itself empty'
    # Every shape the page can render, or the states it does not cover are
    # untested by anything driving the demo.
    kinds = {g.kind for g in goals.values()}
    assert 'payoff' in kinds and 'savings' in kinds
    assert any(g.account_id is not None for g in goals.values()), 'no LINKED goal'
    assert any(g.account_id is None for g in goals.values()), 'no MANUAL goal'
    assert any(g.scope == 'household' for g in goals.values()), 'no SHARED goal'
    assert any(g.status == 'achieved' for g in goals.values()), 'no ACHIEVED goal'


def test_every_seeded_goal_shows_PARTIAL_progress_not_0_or_100(demo_mode):
    """*** A GOAL AT 0% IS INDISTINGUISHABLE FROM A BROKEN ONE. ***

    A progress bar that renders empty for every goal demonstrates nothing, and
    the reader cannot tell "no progress" from "the number never arrived". The
    achieved goal is the deliberate exception -- it is there so the badge and the
    full bar have a case.
    """
    DemoService.seed_demo_accounts()
    svc = GoalService()

    for goal in _goals_of('demo1@finpal.demo').values():
        progress = svc.progress(goal)
        if goal.status == 'achieved':
            assert progress >= 1, f'{goal.name} is stamped achieved at {progress}'
            continue
        assert Decimal('0.05') < progress < Decimal('0.95'), (
            f'{goal.name} renders at {progress:.0%} — a bar that is empty or full '
            f'demonstrates nothing about whether the page works'
        )


def test_the_seeded_goals_span_BOTH_directions(demo_mode):
    """A payoff goal reads differently from a savings goal, and the uniqueness
    index is keyed to the direction — so both have to exist to be exercised."""
    DemoService.seed_demo_accounts()
    svc = GoalService()

    directions = {svc.direction(g) for g in _goals_of('demo1@finpal.demo').values()}
    assert directions == {'accumulate', 'paydown'}, directions


def test_a_demo_account_is_CO_OWNED_so_the_Joint_label_has_a_case(demo_mode):
    DemoService.seed_demo_accounts()

    rows = _db.session.execute(_db.select(
        account_owners.c.account_id, account_owners.c.user_id)).all()
    assert rows, 'no co-owned account; the "Joint" badge demos itself missing'

    account = _db.session.get(Account, rows[0][0])
    co_owner = _db.session.get(User, rows[0][1])
    assert co_owner is not None, 'co-owner is not a real user'
    assert co_owner.id != account.user_id, 'an account co-owned by its own owner'
    # Both sides demo, or `on_the_same_side` refuses it and the API could not have
    # created this row -- a seed that writes what the API forbids is a fixture that
    # lies about the product (D-107).
    assert co_owner.is_demo_user and _db.session.get(User, account.user_id).is_demo_user


def test_the_co_owned_account_has_CONTRIBUTIONS_FROM_TWO_PEOPLE(demo_mode):
    """The breakdown is the point of a joint goal, and one payer demonstrates
    nothing -- the same reason B9 rotates the payer across group expenses."""
    DemoService.seed_demo_accounts()

    household = [g for g in _goals_of('demo1@finpal.demo').values()
                 if g.scope == 'household' and g.account_id is not None]
    assert household, 'no household goal linked to an account'

    rows = GoalService().contributions(household[0])
    payers = {r['user_id'] for r in rows}
    assert len(payers) >= 2, f'only {payers} contributed; a single payer shows nothing'


def test_the_credit_cards_carry_a_limit_an_apr_and_a_minimum(demo_mode):
    """B1's three columns. Without them the Available Credit block never renders
    and learnPal has nothing to teach utilisation from."""
    DemoService.seed_demo_accounts()

    cards = Account.query.filter_by(type='credit').all()
    assert cards, 'no credit accounts at all'
    for card in cards:
        assert card.credit_limit is not None, f'{card.name} has no credit limit'
        assert card.apr is not None, f'{card.name} has no APR'
        assert card.min_payment is not None, f'{card.name} has no minimum payment'
        # A limit smaller than the debt renders a negative available credit, which
        # reads as a defect rather than as a maxed-out card.
        assert card.credit_limit > abs(card.balance), (
            f'{card.name}: limit {card.credit_limit} is below its balance {card.balance}')


# --- An ALREADY-SEEDED demo, which is the one that matters --------------------


def test_the_BACKFILL_reaches_a_demo_that_already_existed(demo_mode):
    """*** THE HALF WITHOUT WHICH NONE OF THIS REACHES PRODUCTION. ***

    Simulates the deployed demo exactly: seeded before this change, so the users
    exist and the new rows do not. `seed_demo_accounts` skips an existing user, so
    only the backfill can close the gap -- and #158 proved that seeding alone looks
    like it worked while changing nothing.
    """
    DemoService.seed_demo_accounts()

    # Roll back to the pre-change state, leaving everything else intact.
    Goal.query.delete()
    _db.session.execute(account_owners.delete())
    for card in Account.query.filter_by(type='credit').all():
        card.credit_limit = card.apr = card.min_payment = None
    _db.session.commit()
    assert Goal.query.count() == 0

    # A boot, on a demo that already exists.
    DemoService.seed_demo_accounts()

    assert Goal.query.filter_by(user_id='demo1@finpal.demo').count() > 0, (
        'the backfill did not reach an existing demo — this is #158 again')
    assert _db.session.execute(_db.select(account_owners.c.user_id)).first() is not None
    assert all(c.credit_limit is not None
               for c in Account.query.filter_by(type='credit').all())


def test_booting_twice_does_not_duplicate_anything(demo_mode):
    """This runs on EVERY boot. Without the gap checks the demo grows a new goal
    and a new co-owner row every time the container restarts."""
    DemoService.seed_demo_accounts()
    goals = Goal.query.count()
    owners = len(_db.session.execute(_db.select(account_owners.c.user_id)).all())
    expenses = Expense.query.count()

    DemoService.seed_demo_accounts()
    DemoService.seed_demo_accounts()

    assert Goal.query.count() == goals, 'goals duplicated on reboot'
    assert len(_db.session.execute(
        _db.select(account_owners.c.user_id)).all()) == owners, 'co-owners duplicated'
    assert Expense.query.count() == expenses, 'contribution rows duplicated'


def test_each_seeder_is_idempotent_ON_ITS_OWN(demo_mode):
    """*** THIS TEST EXISTS BECAUSE A SABOTAGE PASSED. ***

    Deleting the gap check inside `_seed_demo_goals` changed nothing, because
    `_backfill_demo_gaps` has its own check in front of it and shadows it. So the
    guard was untested code that looked tested — the exact shape recorded against
    B9, where a sabotage passing means a hole in the test rather than a harmless
    change.

    Each seeder is called DIRECTLY, twice, because each is reachable from more
    than one site today and could gain a third. A guard nothing exercises is a
    guard that will be deleted by someone tidying up.
    """
    DemoService.seed_demo_accounts()
    user = _demo1()
    before = Goal.query.filter_by(user_id=user.id).count()
    assert before > 0

    DemoService._seed_demo_goals(user)
    DemoService._seed_demo_credit_terms(user)
    DemoService._seed_demo_co_owners()
    _db.session.commit()

    assert Goal.query.filter_by(user_id=user.id).count() == before
    card = Account.query.filter_by(user_id=user.id, type='credit').first()
    # Not overwritten either: a user who edited their own limit keeps it.
    assert card.credit_limit is not None
    owners = _db.session.execute(_db.select(account_owners.c.user_id)).all()
    assert len(owners) == len(set(owners)), 'a duplicate co-owner row'


def test_a_hand_edited_credit_limit_is_NOT_overwritten(demo_mode):
    """Keyed to the gap, not to a version flag. A demo visitor who sets their own
    limit must not have it reset by the next container restart."""
    DemoService.seed_demo_accounts()
    card = Account.query.filter_by(type='credit').first()
    card.credit_limit = Decimal('12345.00')
    _db.session.commit()

    DemoService.seed_demo_accounts()

    _db.session.expire_all()
    assert _db.session.get(Account, card.id).credit_limit == Decimal('12345.00')


def test_the_seeded_goals_satisfy_the_double_counting_INDEX(demo_mode):
    """The seed must obey the constraint the product enforces.

    A seed that can only be written with the index absent is a fixture describing
    a product that does not exist -- and on Postgres it would abort the whole boot
    transaction, taking every later insert with it.
    """
    DemoService.seed_demo_accounts()

    seen = set()
    svc = GoalService()
    for goal in Goal.query.filter_by(status='active').all():
        if goal.account_id is None:
            continue
        key = (goal.account_id, svc.direction(goal))
        assert key not in seen, f'two active goals share {key}'
        seen.add(key)


# --- The correction that reaches a demo seeded by the PREVIOUS version --------


def test_only_the_TOUR_persona_owns_a_household_goal(demo_mode):
    """Four personas each owning one puts four identically-named rows on the
    page a visitor lands on — because a household goal is visible to everyone on
    the same side of the demo boundary, and all four demo users are."""
    DemoService.seed_demo_accounts()

    owners = {g.user_id for g in Goal.query.filter_by(scope='household').all()}
    assert owners == {'demo1@finpal.demo'}, (
        f'household goals are owned by {owners}; every one of them renders on '
        f'demo1’s Goals page, so more than one means duplicate-looking rows'
    )


def test_the_backfill_DEMOTES_household_goals_a_previous_version_created(demo_mode):
    """*** THE HALF THAT REACHES THE LIVE DEMO, AND IT WAS MISSED ONCE ALREADY.
    ***

    Reproduces the deployed state exactly: seeded by the PREVIOUS version, where
    every persona got a household goal. The gap check in `_backfill_demo_gaps`
    correctly skips a user who already has goals, so nothing but a condition-keyed
    correction can fix those rows — and shipping the seeder change alone moved
    `goals 15 -> 15` on the real demo while looking like it had worked.
    """
    DemoService.seed_demo_accounts()

    # Put the database back into the shape the old seeder produced.
    for email in ('demo2@finpal.demo', 'demo3@finpal.demo', 'demo4@finpal.demo'):
        goal = Goal.query.filter_by(user_id=email).first()
        assert goal is not None, f'{email} has no goal to convert'
        goal.scope = 'household'
        goal.name = 'Emergency fund'
    _db.session.commit()
    assert Goal.query.filter_by(scope='household').count() == 4

    # A boot.
    DemoService.seed_demo_accounts()

    remaining = Goal.query.filter_by(scope='household').all()
    assert {g.user_id for g in remaining} == {'demo1@finpal.demo'}
    # Converted, not deleted: the snapshot and the progress were never wrong.
    for email in ('demo2@finpal.demo', 'demo3@finpal.demo', 'demo4@finpal.demo'):
        goal = Goal.query.filter_by(user_id=email).first()
        assert goal is not None, f'{email}’s goal was deleted rather than converted'
        assert goal.scope == 'personal'
        assert goal.name != 'Emergency fund', 'the duplicate name survived'


def test_what_demo1_SEES_has_no_duplicate_names(demo_mode):
    """The assertion that matters is the rendered list, not a table count.

    `goals=15` was true before and after the change that was supposed to fix
    this. What a visitor sees is their own personal goals plus every household
    goal on their side, and THAT is what had four identical rows in it.
    """
    DemoService.seed_demo_accounts()

    visible = Goal.query.filter(
        _db.or_(
            _db.and_(Goal.user_id == 'demo1@finpal.demo', Goal.scope != 'household'),
            Goal.scope == 'household',
        )
    ).all()
    names = [g.name for g in visible]
    assert len(names) == len(set(names)), f'duplicate rows on demo1’s page: {names}'
