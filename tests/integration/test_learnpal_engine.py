"""learnPal C1b — the unlock engine.

*** UNLOCKS ARE PERMANENT (design decision 4) — AND THE THING THAT MAKES THEM
PERMANENT IS THE `learn_completions` ROW, NOT THE WATERMARK. *** This header
said otherwise until a sabotage disproved it: rewriting the altitude gate to
read LIVE progress instead of `Goal.highest_progress` left all twenty tests
green, because once a completion exists the engine skips that milestone.

The watermark earns its column for a different reason, and
`test_A_LESSON_ADDED_LATER_STILL_SEES_A_PEAK_THAT_HAS_PASSED` is the one that
proves it: **content arrives after the climb.** A user peaks at 30%, slides
back to 5%, and only then is a lesson gated at 25% seeded — exactly what C1d
does to every existing user. Against live progress it is unreachable forever
for the people who already did the hardest part.

Asserted on the database and on returned slugs, never on a status code — this
module has no HTTP surface at C1b, which is itself the point: the engine is
pure enough to test without one.
"""

from decimal import Decimal

import pytest

from src.extensions import db as _db
from src.models.account import Account
from src.models.budget import Budget
from src.models.category import Category
from src.models.goal import Goal
from src.models.transaction import Expense
from src.modules.learnpal import checks
from src.modules.learnpal.engine import (
    evaluate_for_goal, evaluate_for_user, raise_watermark, sync_all_users,
)
from src.modules.learnpal.models import LearnCompletion, LearnMilestone
from src.modules.learnpal.seed import seed_milestones
from tests.factories import UserFactory, AccountFactory


USER = 'climber@test.com'


@pytest.fixture
def seeded(db):
    seed_milestones()
    return LearnMilestone.query.count()


def _user(uid=USER):
    return UserFactory(id=uid, name='Climber')


def _paydown_goal(user_id, start='-1000.00', target='0.00', current=None):
    """A card-payoff goal. *** CARD DEBT IS A NEGATIVE BALANCE *** — paying it
    off moves the number UP, so `target > start` and `direction` is `paydown`
    only because `GoalService.direction` reads the amounts rather than the
    literal rule the spec first shipped."""
    account = AccountFactory(user_id=user_id, name='Visa', type='credit',
                             balance=float(current if current is not None else start))
    _db.session.commit()
    goal = Goal(user_id=user_id, name='Pay off Visa', kind='payoff',
                start_amount=Decimal(start), target_amount=Decimal(target),
                account_id=account.id, currency_code='USD')
    _db.session.add(goal)
    _db.session.commit()
    return goal, account


def _slugs(user_id):
    return {c.milestone_slug for c in
            LearnCompletion.query.filter_by(user_id=user_id).all()}


# ---------------------------------------------------------------------------
# The watermark
# ---------------------------------------------------------------------------

def test_the_watermark_starts_NULL_and_rises_to_current_progress(seeded, app):
    user = _user()
    goal, account = _paydown_goal(user.id)
    assert goal.highest_progress is None

    account.balance = -400.0            # 60% paid off
    _db.session.commit()
    raise_watermark(goal)

    assert goal.highest_progress == pytest.approx(Decimal('0.600'), abs=Decimal('0.001'))


def test_THE_WATERMARK_NEVER_FALLS(seeded, app):
    """The whole reason it is stored instead of recomputed."""
    user = _user()
    goal, account = _paydown_goal(user.id)
    account.balance = -200.0            # 80%
    _db.session.commit()
    raise_watermark(goal)
    high = goal.highest_progress

    account.balance = -900.0            # back down to 10%
    _db.session.commit()
    raise_watermark(goal)

    assert goal.highest_progress == high


# ---------------------------------------------------------------------------
# Altitude
# ---------------------------------------------------------------------------

def test_a_paydown_goal_at_zero_opens_the_APR_lesson(seeded, app):
    # `what-your-apr-costs` is gated at 0.000 on a paydown goal — the first
    # thing on a debt climb, before any progress at all.
    user = _user()
    goal, _ = _paydown_goal(user.id)

    unlocked = evaluate_for_goal(goal)
    _db.session.commit()

    assert 'what-your-apr-costs' in unlocked
    assert 'what-your-apr-costs' in _slugs(user.id)


def test_a_higher_band_stays_shut_until_it_is_reached(seeded, app):
    user = _user()
    goal, account = _paydown_goal(user.id)
    evaluate_for_goal(goal)
    _db.session.commit()
    assert 'avalanche-vs-snowball' not in _slugs(user.id)   # gated at 0.250

    account.balance = -700.0            # 30%
    _db.session.commit()
    evaluate_for_goal(goal)
    _db.session.commit()

    assert 'avalanche-vs-snowball' in _slugs(user.id)
    assert 'why-minimums-barely-move-it' in _slugs(user.id)  # 0.150, passed on the way


def test_AN_UNLOCK_SURVIVES_PROGRESS_GOING_BACKWARDS(seeded, app):
    """*** THE TEST THIS FILE EXISTS FOR. ***"""
    user = _user()
    goal, account = _paydown_goal(user.id)
    account.balance = -700.0            # 30%
    _db.session.commit()
    evaluate_for_goal(goal)
    _db.session.commit()
    assert 'avalanche-vs-snowball' in _slugs(user.id)

    account.balance = -1000.0           # all the way back to 0%
    _db.session.commit()
    evaluate_for_goal(goal)
    _db.session.commit()

    assert 'avalanche-vs-snowball' in _slugs(user.id), \
        'a bad month took back a lesson the user had already read'


def test_A_LESSON_ADDED_LATER_STILL_SEES_A_PEAK_THAT_HAS_PASSED(seeded, app):
    """*** THIS IS WHAT THE WATERMARK IS ACTUALLY FOR, AND A SABOTAGE PROVED
    THE REST OF THIS FILE DID NOT NEED IT. ***

    Rewriting the altitude gate to read LIVE progress instead of
    `highest_progress` left all twenty tests green. The permanence test above
    passes either way, because once a completion row exists the engine skips
    the milestone — the ROW is what makes an unlock permanent, not the column.
    My first justification comment in `engine.py` said otherwise and was wrong.

    The property only the watermark can give is this one: content arrives after
    the climb. A user peaks at 30%, slides back to 5%, and *then* a lesson gated
    at 25% is seeded — which is exactly what C1d does to every existing user.
    Against live progress that lesson is unreachable forever, for the people who
    have already done the hardest part of the work.
    """
    user = _user()
    goal, account = _paydown_goal(user.id)
    account.balance = -700.0                      # 30%
    _db.session.commit()
    evaluate_for_goal(goal)
    _db.session.commit()

    account.balance = -950.0                      # slid back to 5%
    _db.session.commit()
    evaluate_for_goal(goal)                       # keeps the watermark at 0.30
    _db.session.commit()

    # Content lands later — a new lesson gated below the old peak.
    _db.session.add(LearnMilestone(
        slug='a-lesson-written-in-june', title='Written later',
        unlock_at_progress=Decimal('0.250'), applies_to_direction='paydown',
        sort_order=99))
    _db.session.commit()

    unlocked = evaluate_for_goal(goal)
    _db.session.commit()

    assert 'a-lesson-written-in-june' in unlocked, (
        'a lesson seeded after the peak was unreachable — the gate is reading '
        'live progress, not the watermark')


def test_an_altitude_gate_scoped_to_paydown_ignores_a_savings_goal(seeded, app):
    # `applies_to_direction` reads `GoalService.direction`, which is DERIVED
    # from the amounts — never `Goal.kind`, which its own comment calls
    # presentation-only.
    user = _user()
    account = AccountFactory(user_id=user.id, name='Savings', type='savings',
                             balance=900.0)
    _db.session.commit()
    goal = Goal(user_id=user.id, name='Buffer', kind='savings',
                start_amount=Decimal('0.00'), target_amount=Decimal('1000.00'),
                account_id=account.id, currency_code='USD')
    _db.session.add(goal)
    _db.session.commit()

    evaluate_for_goal(goal)             # 90% of the way up a SAVINGS goal
    _db.session.commit()

    got = _slugs(user.id)
    assert 'what-your-apr-costs' not in got
    assert 'avalanche-vs-snowball' not in got
    # ...but the direction-agnostic buffer lesson does open.
    assert 'a-starter-buffer' in got


# ---------------------------------------------------------------------------
# Idempotence
# ---------------------------------------------------------------------------

def test_running_the_engine_twice_does_not_duplicate_a_completion(seeded, app):
    # The nightly task runs every night. Without the unique constraint,
    # "unlocks are permanent" would quietly become "unlocks accumulate".
    user = _user()
    goal, _ = _paydown_goal(user.id)
    evaluate_for_goal(goal); _db.session.commit()
    first = LearnCompletion.query.filter_by(user_id=user.id).count()

    second_pass = evaluate_for_goal(goal); _db.session.commit()

    assert second_pass == []
    assert LearnCompletion.query.filter_by(user_id=user.id).count() == first


def test_seeding_twice_creates_nothing_and_does_not_overwrite_an_edit(db, app):
    assert seed_milestones() > 0
    edited = LearnMilestone.query.filter_by(slug='a-starter-buffer').one()
    edited.title = 'A title the owner rewrote'
    _db.session.commit()

    assert seed_milestones() == 0
    assert LearnMilestone.query.filter_by(slug='a-starter-buffer').one().title \
        == 'A title the owner rewrote', \
        'the boot seeder overwrote an edit — D-178, condition-keyed not version-keyed'


# ---------------------------------------------------------------------------
# Predicates — each one, and each one's degenerate case
# ---------------------------------------------------------------------------

def test_categorised_transactions_counts_only_CATEGORISED_ones(db, app):
    user = _user()
    category = Category(user_id=user.id, name='Food')
    _db.session.add(category); _db.session.commit()
    for i in range(3):
        _db.session.add(Expense(
            description=f'x{i}', amount=5, date=__import__('datetime').datetime.utcnow(),
            user_id=user.id, paid_by=user.id, card_used='X', split_method='none',
            currency_code='USD', transaction_type='expense',
            category_id=category.id if i < 2 else None))
    _db.session.commit()

    assert checks.categorised_transactions_at_least(user.id, {'n': 2}) is True
    assert checks.categorised_transactions_at_least(user.id, {'n': 3}) is False


def test_has_active_budget_ignores_an_inactive_one(db, app):
    user = _user()
    category = Category(user_id=user.id, name='Food')
    _db.session.add(category); _db.session.commit()
    _db.session.add(Budget(user_id=user.id, category_id=category.id, name='B',
                           amount=100, period='monthly', active=False,
                           start_date=__import__('datetime').datetime.utcnow()))
    _db.session.commit()
    assert checks.has_active_budget(user.id) is False

    _db.session.add(Budget(user_id=user.id, category_id=category.id, name='B2',
                           amount=100, period='monthly', active=True,
                           start_date=__import__('datetime').datetime.utcnow()))
    _db.session.commit()
    assert checks.has_active_budget(user.id) is True


def test_categories_classified_counts_only_those_with_a_spending_type(db, app):
    user = _user()
    _db.session.add(Category(user_id=user.id, name='Rent', spending_type='fixed'))
    _db.session.add(Category(user_id=user.id, name='Unsorted'))
    _db.session.commit()
    assert checks.categories_classified_at_least(user.id, {'n': 1}) is True
    assert checks.categories_classified_at_least(user.id, {'n': 2}) is False


def test_utilisation_reads_a_NEGATIVE_balance_as_money_owed(db, app):
    # Card debt is stored negative. `abs()` here would count an OVERPAID card
    # as utilisation, which is D-176's arithmetic one table over.
    user = _user()
    AccountFactory(user_id=user.id, name='Visa', type='credit',
                   balance=-1000.0, credit_limit=10000)
    _db.session.commit()
    assert checks.credit_utilisation_below(user.id, {'pct': 30}) is True    # 10%
    assert checks.credit_utilisation_below(user.id, {'pct': 5}) is False


def test_an_OVERPAID_card_is_zero_utilisation_not_negative(db, app):
    user = _user()
    AccountFactory(user_id=user.id, name='Visa', type='credit',
                   balance=200.0, credit_limit=5000)     # the bank owes the user
    _db.session.commit()
    assert checks.credit_utilisation_below(user.id, {'pct': 1}) is True


def test_UTILISATION_IS_FALSE_WHEN_NO_CARD_HAS_A_LIMIT(db, app):
    """*** UNKNOWN IS NOT THE SAME AS EXCELLENT. ***

    Before C1a nothing collected `credit_limit`, so this was every user. A
    predicate that read "no limits" as 0% would have permanently unlocked the
    utilisation lesson for everybody, on no evidence whatsoever.
    """
    user = _user()
    AccountFactory(user_id=user.id, name='Visa', type='credit', balance=-500.0)
    _db.session.commit()
    assert checks.credit_utilisation_below(user.id, {'pct': 30}) is False


def test_has_debt_account_with_a_rate_is_the_predicate_C1a_made_answerable(db, app):
    user = _user()
    card = AccountFactory(user_id=user.id, name='Visa', type='credit', balance=-500.0)
    _db.session.commit()
    assert checks.has_debt_account_with_a_rate(user.id) is False    # apr is NULL

    card.apr = Decimal('19.99')
    _db.session.commit()
    assert checks.has_debt_account_with_a_rate(user.id) is True


# ---------------------------------------------------------------------------
# Failing closed
# ---------------------------------------------------------------------------

def test_an_UNKNOWN_check_type_never_unlocks(db, app):
    # A permanent unlock granted by a typo in a seeded row is exactly the kind
    # of thing that cannot be taken back.
    assert checks.run_check('no_such_predicate', USER, None) is False


def test_a_predicate_that_RAISES_never_unlocks(db, app, monkeypatch):
    def boom(user_id, args):
        raise RuntimeError('database on fire')
    monkeypatch.setitem(checks.CHECKS, 'has_active_budget', boom)
    assert checks.run_check('has_active_budget', USER, None) is False


def test_a_milestone_naming_a_bad_check_is_skipped_not_satisfied(db, app):
    user = _user()
    _db.session.add(LearnMilestone(slug='broken', title='Broken',
                                   check_type='not_a_real_check', sort_order=0))
    _db.session.commit()

    assert evaluate_for_user(user.id) == []


# ---------------------------------------------------------------------------
# The nightly pass
# ---------------------------------------------------------------------------

def test_the_nightly_pass_reaches_a_user_who_wrote_nothing(seeded, app):
    """*** PROGRESS MOVES WITHOUT ANY GOAL BEING WRITTEN. ***

    It is derived from account balances, so paying a card down changes it with
    no goal row touched. The write-path hook alone would never notice, which is
    the entire justification for a scheduled task.
    """
    user = _user()
    goal, account = _paydown_goal(user.id)
    evaluate_for_user(user.id); _db.session.commit()
    before = _slugs(user.id)
    assert 'avalanche-vs-snowball' not in before

    account.balance = -600.0            # 40%, and NOTHING touches the goal row
    _db.session.commit()

    sync_all_users(app)

    assert 'avalanche-vs-snowball' in _slugs(user.id)


def test_one_users_failure_does_not_roll_back_another(seeded, app, monkeypatch):
    # Per-user commit. Without it, a single bad row would cost everybody the
    # night's unlocks.
    good = _user('good@test.com')
    bad = _user('bad@test.com')
    _paydown_goal(good.id)
    _paydown_goal(bad.id)

    real = evaluate_for_user
    import src.modules.learnpal.engine as engine

    def selective(user_id, goal=None):
        if user_id == 'bad@test.com':
            raise RuntimeError('this user explodes')
        return real(user_id, goal=goal)

    monkeypatch.setattr(engine, 'evaluate_for_user', selective)
    engine.sync_all_users(app)

    assert 'what-your-apr-costs' in _slugs('good@test.com')
    assert _slugs('bad@test.com') == set()
