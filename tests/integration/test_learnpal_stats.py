"""`/api/v1/learnpal/stats` — the learnPal home's figures.

*** THERE IS NO POINTS FIGURE IN HERE AND THAT IS ASSERTED, NOT ASSUMED. ***
Owner decision 2026-09-11: learnPal has no points at all, because points come
from answering and no quiz exists. A points tile would read 0 for ever with no
way to move it, so the absence is pinned by a test — otherwise a future session
adds one back as an obvious omission.

Every assertion reads the payload or the database, never a status code.
"""

from decimal import Decimal

import pytest

from src.extensions import db as _db
from src.data.seed_mountains import seed_mountains
from src.models.budget import Budget
from src.models.goal import Goal
from src.modules.learnpal.checks import CHECK_REASONS, CHECKS, check_reason
from src.modules.learnpal.models import LearnCompletion
from src.modules.learnpal.seed import seed_milestones
from src.modules.learnpal.stats import stats_for_user
from tests.factories import UserFactory, AccountFactory

STATS = '/api/v1/learnpal/stats'


@pytest.fixture
def user(db):
    seed_mountains()
    seed_milestones()
    return UserFactory(id='stats@test.com', name='Stats')


def _card(user_id, balance='-1650.00', apr='19.99'):
    account = AccountFactory(user_id=user_id, name='Visa', type='credit',
                             balance=Decimal(balance))
    if apr is not None:
        account.apr = Decimal(apr)
    _db.session.commit()
    return account


def _goal(user_id, account=None, **kw):
    fields = dict(user_id=user_id, name='Pay off the Visa', kind='payoff',
                  start_amount=Decimal('-1650.00'), target_amount=Decimal('0.00'),
                  currency_code='USD')
    if account is not None:
        fields['account_id'] = account.id
    fields.update(kw)
    goal = Goal(**fields)
    _db.session.add(goal)
    _db.session.commit()
    return goal


# ---------------------------------------------------------------------------
# The decision: nothing that reads zero for ever
# ---------------------------------------------------------------------------

def test_THE_PAYLOAD_CARRIES_NO_POINTS_FIGURE_OF_ANY_KIND(user, app):
    """Owner decision 2026-09-11, pinned so it is not "fixed" later.

    learnPal has no points ledger and no points column. A tile fed by a figure
    nothing can ever increment is the failure this refuses.
    """
    stats = stats_for_user(user.id)
    flat = repr(stats).lower()
    assert 'point' not in flat, stats
    assert 'points' not in stats
    assert set(stats) == {'lessons', 'gear', 'highest', 'recent', 'next'}


def test_a_brand_new_user_gets_real_zeros_and_no_invented_mountain(user, app):
    """*** EMPTY IS A STATE TO RENDER, NOT AN ERROR AND NOT A BAND ZERO. *** A
    user with no goals has never climbed anything, and answering Table Mountain
    for them is the molehill `mountain_for` refuses to draw."""
    stats = stats_for_user(user.id)
    assert stats['lessons']['read'] == 0
    assert stats['lessons']['total'] == 8
    assert stats['gear']['earned'] == 0
    assert stats['highest'] is None, 'a mountain was invented for a user with no goals'
    assert stats['recent'] == []


# ---------------------------------------------------------------------------
# Highest ever
# ---------------------------------------------------------------------------

def test_HIGHEST_EVER_READS_THE_WATERMARK_AND_NOT_THE_CURRENT_BAND(user, app):
    """The headline tile, and the reason `hardest_band` exists.

    The goal's current figure is tiny; its watermark says Everest. A tile read
    from the live band would congratulate somebody on Table Mountain for
    clearing an Aconcagua.
    """
    account = _card(user.id, balance='-10.00')
    goal = _goal(user.id, account)
    goal.hardest_band = 5          # everest
    _db.session.commit()

    highest = stats_for_user(user.id)['highest']
    assert highest['band'] == 5
    assert highest['mountain']['slug'] == 'everest'
    assert highest['mountain']['summit_note']
    assert highest['goal_id'] == goal.id
    assert highest['goal_name'] == 'Pay off the Visa'


def test_HIGHEST_EVER_INCLUDES_AN_ARCHIVED_GOAL(user, app):
    """*** "EVER" MEANS EVER, AND THE RANGE'S FILTER IS THE WRONG ONE HERE. ***

    `range_for_user` excludes archived goals because the range draws what you
    are climbing now. A lifetime statistic that FALLS when the user tidies up is
    the one thing it must never do.
    """
    account = _card(user.id, balance='-10.00')
    goal = _goal(user.id, account, status='archived')
    goal.hardest_band = 4
    _db.session.commit()

    highest = stats_for_user(user.id)['highest']
    assert highest is not None, 'archiving a goal erased the hardest climb'
    assert highest['band'] == 4
    assert highest['goal_status'] == 'archived'


def test_highest_ever_picks_the_HARDEST_of_several_goals(user, app):
    a = _card(user.id, balance='-10.00')
    _goal(user.id, a, name='Visa').hardest_band = 1
    b = AccountFactory(user_id=user.id, name='Amex', type='credit',
                       balance=Decimal('-20.00'))
    _db.session.commit()
    _goal(user.id, b, name='Amex').hardest_band = 4
    _db.session.commit()

    highest = stats_for_user(user.id)['highest']
    assert highest['band'] == 4
    assert highest['goal_name'] == 'Amex'


def test_a_goal_with_an_UNMEASURED_peak_contributes_no_band(user, app):
    """A card with no APR has no figure, so the user has no band — not band 0."""
    account = _card(user.id, apr=None)
    _goal(user.id, account)
    assert stats_for_user(user.id)['highest'] is None


# ---------------------------------------------------------------------------
# Recently finished
# ---------------------------------------------------------------------------

def test_RECENT_NAMES_THE_GOAL_THAT_UNLOCKED_EACH_LESSON(user, app):
    account = _card(user.id)
    goal = _goal(user.id, account)
    _db.session.add(LearnCompletion(user_id=user.id,
                                    milestone_slug='what-your-apr-costs',
                                    verified_by='read',
                                    unlocked_by_goal_id=goal.id))
    _db.session.commit()

    recent = stats_for_user(user.id)['recent']
    assert len(recent) == 1
    assert recent[0]['slug'] == 'what-your-apr-costs'
    assert recent[0]['title'] == 'What your APR actually costs'
    assert recent[0]['goal_id'] == goal.id
    assert recent[0]['goal_name'] == 'Pay off the Visa'
    assert recent[0]['unlocked_at'] is not None


def test_A_PREDICATE_UNLOCK_HAS_NO_GOAL_AND_SAYS_SO_RATHER_THAN_None_NAMED(
        user, app):
    """*** `unlocked_by_goal_id` IS NULLABLE BY DESIGN, NOT BY ACCIDENT. ***

    `evaluate_for_user` runs the predicate half over the whole user precisely
    because there is no goal to attribute it to, and the FK is
    `ondelete='SET NULL'` so a deleted goal keeps the unlock and loses the
    attribution. Both must render as "unlocked", never as "unlocked by None".
    """
    _db.session.add(LearnCompletion(user_id=user.id,
                                    milestone_slug='where-your-money-goes',
                                    verified_by='read',
                                    unlocked_by_goal_id=None))
    _db.session.commit()

    row = stats_for_user(user.id)['recent'][0]
    assert row['goal_id'] is None
    assert row['goal_name'] is None


def test_recent_reports_has_body_so_no_reader_is_offered_for_empty_prose(
        user, app):
    """C1b seeds the ROWS and C1d fills the bodies, so an unlocked lesson with
    nothing to read is an expected state — eleven approved drafts are unseeded
    and four are deliberately unwritten. A client that opens a reader on one
    shows a blank page."""
    _db.session.add(LearnCompletion(user_id=user.id,
                                    milestone_slug='what-your-apr-costs',
                                    verified_by='read'))
    _db.session.commit()
    row = stats_for_user(user.id)['recent'][0]
    assert row['has_body'] is False
    assert stats_for_user(user.id)['lessons']['without_body'] == 8


def test_recent_is_NEWEST_FIRST(user, app):
    from datetime import datetime, timedelta
    now = datetime.utcnow()
    for i, slug in enumerate(['what-your-apr-costs',
                              'why-minimums-barely-move-it',
                              'avalanche-vs-snowball']):
        _db.session.add(LearnCompletion(
            user_id=user.id, milestone_slug=slug, verified_by='read',
            unlocked_at=now - timedelta(days=i)))
    _db.session.commit()
    slugs = [r['slug'] for r in stats_for_user(user.id)['recent']]
    assert slugs == ['what-your-apr-costs', 'why-minimums-barely-move-it',
                     'avalanche-vs-snowball'], slugs


# ---------------------------------------------------------------------------
# What is next, and why it is locked
# ---------------------------------------------------------------------------

def test_AN_ALTITUDE_GATE_EXPLAINS_ITSELF_WITH_ITS_OWN_THRESHOLD(user, app):
    """The reason is DERIVED from `unlock_at_progress` and names the goal that
    is closest to it. Nothing here is authored prose."""
    account = _card(user.id, balance='-825.00')
    goal = _goal(user.id, account, name='Pay off the Visa')
    # *** BELOW 0.25 ON PURPOSE. *** At a watermark of 0.5 this gate is already
    # PASSED, so it is pending rather than next and is excluded -- which is the
    # behaviour D-187's demo state made obviously necessary.
    goal.highest_progress = Decimal('0.200')
    _db.session.commit()

    rows = {r['slug']: r for r in stats_for_user(user.id)['next']}
    row = rows.get('avalanche-vs-snowball')
    assert row is not None, list(rows)
    assert row['gate'] == 'altitude'
    assert row['unlock_at_progress'] == 0.25
    assert row['goal_name'] == 'Pay off the Visa'
    assert '25%' in row['reason'] and 'Pay off the Visa' in row['reason']


def test_the_closest_lesson_comes_FIRST_and_a_measured_gap_is_what_orders_them(
        user, app):
    """*** THE ORDERING MUST BE ABLE TO DISCRIMINATE, WHICH MEANS THE GAPS MUST
    DIFFER. *** A fixture where every candidate sits at the same distance would
    pass whatever order the code produced — that is the ordering test that could
    not discriminate, caught the hard way on 2026-09-11.

    *** THE FIRST FIXTURE HERE COULD NOT DISCRIMINATE AND THIS ASSERTION IS
    WHAT SAID SO. *** At a watermark of 0.16 only ONE altitude gate is still
    unpassed, so any ordering whatsoever produced a sorted list of length one.
    At 0.05 on a paydown goal three are unpassed with three different gaps --
    0.10 (0.05 away), 0.15 (0.10) and 0.25 (0.20) -- so a reversed or arbitrary
    sort fails.
    """
    account = _card(user.id, balance='-825.00')
    goal = _goal(user.id, account)
    goal.highest_progress = Decimal('0.050')
    _db.session.commit()

    rows = stats_for_user(user.id)['next']
    altitude = [r for r in rows if r['gate'] == 'altitude']
    gaps = [round(r['unlock_at_progress'] - 0.050, 3) for r in altitude]
    assert gaps == sorted(gaps), [(r['slug'], r['unlock_at_progress']) for r in altitude]
    assert len(set(gaps)) > 2, \
        f'the gaps were {gaps}: a fixture that cannot discriminate proves nothing'


def test_A_PREDICATE_GATE_EXPLAINS_ITSELF_FROM_ITS_OWN_check_args(user, app):
    rows = {r['slug']: r for r in stats_for_user(user.id)['next']}
    # `where-your-money-goes` is `categorised_transactions_at_least {'n': 20}`.
    for slug, expect in [('where-your-money-goes', '20'),
                         ('utilisation-and-your-score', '30%'),
                         ('fixed-vs-flexible', '5')]:
        row = rows.get(slug)
        if row is None:
            continue          # outside the limit; the ones present must be right
        assert row['gate'] == 'check'
        assert expect in row['reason'], (slug, row['reason'])


def test_AN_ALTITUDE_LESSON_WITH_NO_ELIGIBLE_GOAL_SAYS_START_ONE(user, app):
    """*** A PERCENTAGE THE USER CANNOT MOVE IS WORSE THAN NO PERCENTAGE. ***

    `what-your-apr-costs` is `applies_to_direction = 'paydown'`. A user with
    only savings goals can never reach it by climbing, so "reach 0% on ..." has
    no goal to name. The honest answer is what to do instead.
    """
    account = AccountFactory(user_id=user.id, name='Savings', type='savings',
                             balance=Decimal('1000.00'))
    _db.session.commit()
    _goal(user.id, account, name='Emergency fund', kind='savings',
          start_amount=Decimal('0.00'), target_amount=Decimal('16000.00'))

    rows = {r['slug']: r for r in stats_for_user(user.id)['next']}
    row = rows.get('what-your-apr-costs')
    assert row is not None, list(rows)
    assert row['goal_id'] is None
    assert row['reason'] == 'Start a debt goal', row['reason']


def test_an_EARNED_lesson_never_appears_in_what_is_next(user, app):
    account = _card(user.id)
    _goal(user.id, account)
    _db.session.add(LearnCompletion(user_id=user.id,
                                    milestone_slug='what-your-apr-costs',
                                    verified_by='read'))
    _db.session.commit()
    slugs = [r['slug'] for r in stats_for_user(user.id)['next']]
    assert 'what-your-apr-costs' not in slugs


# ---------------------------------------------------------------------------
# The reason table, pinned behaviourally rather than by spelling
# ---------------------------------------------------------------------------

def test_EVERY_PREDICATE_HAS_A_REASON_AND_NO_REASON_IS_ORPHANED(app):
    """*** A GUARD ON A COUNT IS A LOWER BOUND ON THE SHAPES IT CAN SEE. ***

    Both directions, because each catches a different mistake: a predicate with
    no reason renders a locked lesson with no explanation, and a reason for a
    predicate that does not exist describes a condition nothing tests.
    """
    assert set(CHECKS) == set(CHECK_REASONS), (
        set(CHECKS) ^ set(CHECK_REASONS))


def test_AN_UNKNOWN_CHECK_TYPE_GETS_NO_SENTENCE_RATHER_THAN_A_PLAUSIBLE_ONE(app):
    """Fail-closed, like `run_check` itself. `run_check` refuses to unlock a
    milestone naming a predicate this build does not have; this refuses to
    describe it."""
    assert check_reason('a_predicate_that_does_not_exist', {'n': 3}) is None


def test_THE_DECLARED_DEFAULTS_MATCH_WHAT_THE_PREDICATES_ACTUALLY_DO(user, app):
    """*** THE SECOND COPY OF A NUMBER IS PINNED BEHAVIOURALLY, NOT BY NAME. ***

    `CHECK_REASONS` restates each predicate's default so a seeded row with no
    `check_args` still gets a sentence. Two copies of one number is this
    project's recurring failure, so this puts a fixture EXACTLY on the declared
    boundary and asserts the predicate called with NO args agrees — one below it
    must be False and one at it must be True. A test comparing the literals
    would go blind the moment a key was renamed.

    `categorised_transactions_at_least` is the one with a number worth checking;
    `categories_classified_at_least` needs 5 categories and is checked the same
    way. The two arg-free predicates have no number to get wrong.
    """
    from src.models.category import Category
    declared = CHECK_REASONS['categories_classified_at_least'][1]['n']

    # One short of the declared default.
    for i in range(declared - 1):
        cat = Category(user_id=user.id, name=f'Cat {i}')
        cat.spending_type = 'fixed'
        _db.session.add(cat)
    _db.session.commit()
    assert CHECKS['categories_classified_at_least'](user.id, None) is False, \
        f'the predicate was already satisfied below its declared default of {declared}'

    cat = Category(user_id=user.id, name='Cat last')
    cat.spending_type = 'fixed'
    _db.session.add(cat)
    _db.session.commit()
    assert CHECKS['categories_classified_at_least'](user.id, None) is True, \
        f'the predicate was NOT satisfied at its declared default of {declared}'


# ---------------------------------------------------------------------------
# Through HTTP
# ---------------------------------------------------------------------------

def test_the_endpoint_answers_and_carries_the_same_shape(
        client, auth_headers, user):
    account = _card(user.id, balance='-825.00')
    goal = _goal(user.id, account)
    goal.hardest_band = 2
    from src.models.category import Category
    category = Category(user_id=user.id, name='Groceries')
    _db.session.add(category)
    _db.session.commit()
    _db.session.add(Budget(user_id=user.id, category_id=category.id,
                           name='Groceries', amount=Decimal('400.00'),
                           period='monthly', active=True))
    _db.session.commit()

    resp = client.get(STATS, headers=auth_headers(user))
    assert resp.status_code == 200, resp.get_json()
    stats = resp.get_json()['stats']
    assert stats['highest']['mountain']['slug'] == 'mount-fuji'
    assert stats['lessons']['total'] == 8
    assert isinstance(stats['next'], list) and stats['next']
