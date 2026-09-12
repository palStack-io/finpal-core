"""D-187: the watermarks are written by something that is actually CALLED.

*** EVERY TEST HERE GOES THROUGH HTTP AND THEN READS THE DATABASE. *** That is
the whole point of the file. `test_learnpal_engine.py` and
`test_goal_mountains.py` call `evaluate_for_goal` and `raise_hardest_band`
directly, so between them they have 52 green tests proving the engine is
correct — and `evaluate_for_goal` had **zero non-test callers**. A helper's own
test is not proof of its adoption (D-106), and 1,191 green backend tests were
consistent with a finished goal having no summit note on the live demo.

So: drive the route, then look at the column.
"""

from decimal import Decimal

import pytest

from src.extensions import db as _db
from src.data.seed_mountains import seed_mountains
from src.models.goal import Goal
from src.modules.learnpal.models import LearnCompletion
from src.services.goal.watermark import backfill_goal_watermarks
from tests.factories import UserFactory, AccountFactory

ENDPOINT = '/api/v1/goals/'


@pytest.fixture
def user(db):
    seed_mountains()
    return UserFactory(id='watermark@test.com', name='Watermark')


def _card(user_id, balance='-800.00', apr='19.99'):
    account = AccountFactory(user_id=user_id, name='Visa', type='credit',
                             balance=Decimal(balance))
    if apr is not None:
        account.apr = Decimal(apr)
    _db.session.commit()
    return account


# ---------------------------------------------------------------------------
# The write path — the half of engine.py's docstring that was fiction
# ---------------------------------------------------------------------------

def test_CREATING_A_GOAL_THROUGH_THE_API_STAMPS_BOTH_WATERMARKS(
        client, auth_headers, user):
    """The one that fails on `main`.

    `POST /goals` committed and answered 201 with both columns NULL, because
    nothing on the route touched the engine. A 201 was never evidence.
    """
    account = _card(user.id, balance='-1650.00')

    resp = client.post(ENDPOINT, headers=auth_headers(user),
                       json={'name': 'Pay off the Visa', 'kind': 'payoff',
                             'account_id': account.id, 'target_amount': '0.00'})
    assert resp.status_code == 201, resp.get_json()

    stored = _db.session.get(Goal, resp.get_json()['goal']['id'])
    assert stored.highest_progress is not None, \
        'the progress watermark was never written by the create path'
    assert stored.hardest_band is not None, \
        'the band watermark was never written, so the summit note cannot render'


def test_THE_CREATE_RESPONSE_ITSELF_CARRIES_THE_HARDEST_MOUNTAIN(
        client, auth_headers, user):
    """Asserted on the PAYLOAD, not only the column.

    `peak.hardest_mountain` is what a client draws the summit note from, and it
    is derived from `hardest_band` — so a stamped column that is not reflected
    in the same response leaves the client one refresh behind on the very
    request that created the goal.
    """
    account = _card(user.id, balance='-1650.00')
    resp = client.post(ENDPOINT, headers=auth_headers(user),
                       json={'name': 'Pay off the Visa', 'kind': 'payoff',
                             'account_id': account.id, 'target_amount': '0.00'})
    peak = resp.get_json()['goal']['peak']
    assert peak['hardest_band'] is not None
    assert peak['hardest_mountain'] is not None
    assert peak['hardest_mountain']['summit_note']


def test_a_manual_goal_created_PART_WAY_UP_stamps_the_watermark_it_starts_at(
        client, auth_headers, user):
    """*** A GOAL DOES NOT START AT ZERO, AND THAT IS THE INTERESTING CASE. ***

    Somebody who has already saved £3,200 of £16,000 is at 20% on the request
    that creates the goal. A create path that stamped a hard-coded zero would
    pass a naive "not None" assertion while losing exactly the altitude the
    user has already earned — and the lesson gated there with it.
    """
    resp = client.post(ENDPOINT, headers=auth_headers(user),
                       json={'name': 'Emergency fund', 'kind': 'savings',
                             'start_amount': '0.00', 'target_amount': '16000.00',
                             'current_manual': '3200.00'})
    assert resp.status_code == 201, resp.get_json()

    stored = _db.session.get(Goal, resp.get_json()['goal']['id'])
    assert stored.highest_progress == Decimal('0.200'), stored.highest_progress


def test_EDITING_A_GOAL_UPWARD_RAISES_THE_WATERMARK_ON_THAT_REQUEST(
        client, auth_headers, user):
    """Halving the target doubles the progress, on the PUT itself.

    A watermark refreshed only on create would leave this user's altitude at the
    old figure until the next nightly pass — and on a stack with no scheduler,
    for ever.
    """
    resp = client.post(ENDPOINT, headers=auth_headers(user),
                       json={'name': 'Emergency fund', 'kind': 'savings',
                             'start_amount': '0.00', 'target_amount': '16000.00',
                             'current_manual': '3200.00'})
    goal_id = resp.get_json()['goal']['id']
    assert _db.session.get(Goal, goal_id).highest_progress == Decimal('0.200')

    put = client.put(f'{ENDPOINT}{goal_id}', headers=auth_headers(user),
                     json={'name': 'Emergency fund', 'kind': 'savings',
                           'target_amount': '8000.00'})
    assert put.status_code == 200, put.get_json()
    assert _db.session.get(Goal, goal_id).highest_progress == Decimal('0.400')


def test_EDITING_A_GOAL_DOWNWARD_DOES_NOT_LOWER_THE_WATERMARK(
        client, auth_headers, user):
    """*** THE ONE PROPERTY THE WHOLE DESIGN RESTS ON. *** Content arrives after
    the climb, so a watermark that a write path could pull DOWN would take back
    a lesson the user had already qualified for."""
    resp = client.post(ENDPOINT, headers=auth_headers(user),
                       json={'name': 'Emergency fund', 'kind': 'savings',
                             'start_amount': '0.00', 'target_amount': '8000.00',
                             'current_manual': '3200.00'})
    goal_id = resp.get_json()['goal']['id']
    assert _db.session.get(Goal, goal_id).highest_progress == Decimal('0.400')

    # Target doubled -> current progress halves. The watermark must not follow.
    put = client.put(f'{ENDPOINT}{goal_id}', headers=auth_headers(user),
                     json={'name': 'Emergency fund', 'kind': 'savings',
                           'target_amount': '16000.00'})
    assert put.status_code == 200, put.get_json()
    stored = _db.session.get(Goal, goal_id)
    assert stored.highest_progress == Decimal('0.400'), \
        'the write path walked the watermark back down'


# ---------------------------------------------------------------------------
# The read path — where `stamp_if_achieved` already lived, and why
# ---------------------------------------------------------------------------

def test_A_BALANCE_THAT_MOVES_WITH_NO_GOAL_WRITE_IS_PICKED_UP_ON_READ(
        client, auth_headers, user):
    """*** THIS IS THE CASE NO WRITE-PATH HOOK CAN EVER COVER. ***

    Progress is derived from account balances, so paying a card down changes it
    with **no goal row touched**. `goals.py` already stamped `achieved` on read
    for precisely this reason, in a comment that reads as the argument for
    D-187's fix; the two watermarks were added later and never given it.

    The balance is moved here without going through the goal API at all, which
    is what an ordinary transaction does.
    """
    account = _card(user.id, balance='-1650.00')
    resp = client.post(ENDPOINT, headers=auth_headers(user),
                       json={'name': 'Pay off the Visa', 'kind': 'payoff',
                             'account_id': account.id, 'target_amount': '0.00'})
    goal_id = resp.get_json()['goal']['id']
    first = _db.session.get(Goal, goal_id).highest_progress

    # Half the card paid off by something that is not the goal API.
    account.balance = Decimal('-825.00')
    _db.session.commit()

    listing = client.get(ENDPOINT, headers=auth_headers(user))
    assert listing.status_code == 200
    raised = _db.session.get(Goal, goal_id).highest_progress
    assert raised > first, 'a list read did not notice the balance moving'
    assert raised == Decimal('0.500'), raised


def test_a_read_does_NOT_lower_a_watermark_and_does_not_unlock_anything(
        client, auth_headers, user):
    """*** THE READ PATH RAISES WATERMARKS AND NEVER UNLOCKS. ***

    `engine.py` refuses to run on a read in capitals, and the reason is that an
    unlock INSERTS a row and makes content appear. A watermark is
    `max(stored, current)` and cannot change an answer. So the read path is
    allowed one of those two things and not the other, and this pins the
    boundary rather than trusting the comment.
    """
    account = _card(user.id, balance='-825.00')
    resp = client.post(ENDPOINT, headers=auth_headers(user),
                       json={'name': 'Pay off the Visa', 'kind': 'payoff',
                             'account_id': account.id, 'target_amount': '0.00'})
    goal_id = resp.get_json()['goal']['id']
    peak = _db.session.get(Goal, goal_id).highest_progress

    # The card gets WORSE. Progress falls; the watermark must not.
    account.balance = Decimal('-1650.00')
    _db.session.commit()
    client.get(ENDPOINT, headers=auth_headers(user))
    assert _db.session.get(Goal, goal_id).highest_progress == peak

    before = LearnCompletion.query.filter_by(user_id=user.id).count()
    for _ in range(3):
        client.get(ENDPOINT, headers=auth_headers(user))
        client.get(f'{ENDPOINT}{goal_id}', headers=auth_headers(user))
    assert LearnCompletion.query.filter_by(user_id=user.id).count() == before, \
        'a GET unlocked a lesson'


# ---------------------------------------------------------------------------
# learnPal's half, on the write path
# ---------------------------------------------------------------------------

def test_CREATING_A_DEBT_GOAL_UNLOCKS_THE_LESSON_GATED_AT_ZERO_IMMEDIATELY(
        client, auth_headers, user, app):
    """`what-your-apr-costs` is gated at `unlock_at_progress = 0` on purpose —
    it is the first thing on a debt climb, before any progress at all.

    On `main` it unlocked at 04:15 the next morning at the earliest, and never
    at all on a stack with no scheduler. The demo showed `read: 0 of 8` for a
    user whose Visa goal was at 51.5%.
    """
    from src.modules.learnpal.seed import seed_milestones
    seed_milestones()
    account = _card(user.id, balance='-1650.00')

    resp = client.post(ENDPOINT, headers=auth_headers(user),
                       json={'name': 'Pay off the Visa', 'kind': 'payoff',
                             'account_id': account.id, 'target_amount': '0.00'})
    assert resp.status_code == 201, resp.get_json()

    slugs = {row.milestone_slug for row
             in LearnCompletion.query.filter_by(user_id=user.id).all()}
    assert 'what-your-apr-costs' in slugs, slugs


def test_the_unlock_is_ATTRIBUTED_to_the_goal_that_opened_it(
        client, auth_headers, user):
    """`unlocked_by_goal_id` is what the home page's "recently finished" list
    reads to say WHICH goal unlocked a lesson. On a create path the goal has no
    primary key until it is flushed, so an unlock written before the flush would
    attribute every lesson to `None` while looking like it worked."""
    from src.modules.learnpal.seed import seed_milestones
    seed_milestones()
    account = _card(user.id, balance='-1650.00')
    resp = client.post(ENDPOINT, headers=auth_headers(user),
                       json={'name': 'Pay off the Visa', 'kind': 'payoff',
                             'account_id': account.id, 'target_amount': '0.00'})
    goal_id = resp.get_json()['goal']['id']

    row = LearnCompletion.query.filter_by(
        user_id=user.id, milestone_slug='what-your-apr-costs').first()
    assert row is not None
    assert row.unlocked_by_goal_id == goal_id, \
        'the lesson was attributed to no goal, so nothing can say what opened it'


# ---------------------------------------------------------------------------
# The backfill — the delivery that reaches the people who already have goals
# ---------------------------------------------------------------------------

def test_THE_BACKFILL_STAMPS_A_GOAL_EVERY_PREVIOUS_VERSION_LEFT_NULL(user, app):
    """D-178: a create path and a backfill are two deliveries of one change, and
    the second is the one that reaches anybody.

    The goal is built directly, exactly as every row on the live demo was: no
    watermark, because the version that wrote it had no writer.
    """
    account = _card(user.id, balance='-1650.00')
    goal = Goal(user_id=user.id, name='Pay off the Visa', kind='payoff',
                start_amount=Decimal('-1650.00'), target_amount=Decimal('0.00'),
                account_id=account.id, currency_code='USD')
    _db.session.add(goal)
    _db.session.commit()
    assert goal.highest_progress is None and goal.hardest_band is None

    assert backfill_goal_watermarks() == 1
    _db.session.refresh(goal)
    assert goal.highest_progress is not None
    assert goal.hardest_band is not None


def test_the_backfill_is_IDEMPOTENT_and_cannot_pull_a_watermark_down(user, app):
    """*** THE HALF OF D-178 THAT GETS MISSED: RUN IT TWICE. *** It runs at every
    boot, so a second pass must be a no-op — and must not re-derive a watermark
    from a figure that has since improved."""
    account = _card(user.id, balance='-1650.00')
    goal = Goal(user_id=user.id, name='Pay off the Visa', kind='payoff',
                start_amount=Decimal('-1650.00'), target_amount=Decimal('0.00'),
                account_id=account.id, currency_code='USD')
    _db.session.add(goal)
    _db.session.commit()

    assert backfill_goal_watermarks() == 1
    _db.session.refresh(goal)
    stamped = (goal.highest_progress, goal.hardest_band)

    # The card is paid down: the CURRENT band is lower than the stamped one.
    account.balance = Decimal('-50.00')
    _db.session.commit()

    assert backfill_goal_watermarks() == 0, 'the second pass wrote again'
    _db.session.refresh(goal)
    assert (goal.highest_progress, goal.hardest_band) == stamped


def test_the_backfill_does_not_write_into_learnpals_table(user, app):
    """Core must not insert a row into an optional module's table. The catch-up
    that DOES unlock is learnPal's own `on_startup`."""
    from src.modules.learnpal.seed import seed_milestones
    seed_milestones()
    account = _card(user.id, balance='-1650.00')
    goal = Goal(user_id=user.id, name='Pay off the Visa', kind='payoff',
                start_amount=Decimal('-1650.00'), target_amount=Decimal('0.00'),
                account_id=account.id, currency_code='USD')
    _db.session.add(goal)
    _db.session.commit()

    backfill_goal_watermarks()
    assert LearnCompletion.query.filter_by(user_id=user.id).count() == 0


def test_a_goal_with_NO_APR_ANYWHERE_gets_a_progress_watermark_and_no_band(
        user, app):
    """*** UNMEASURED IS NOT BAND ZERO, AND THE BACKFILL MUST NOT INVENT ONE. ***

    A paydown goal on a card with no stated rate has no figure at all, so
    answering "Table Mountain" for it would draw a molehill where the honest
    answer is *we do not know* — parent-spec trap 3. Its PROGRESS is still
    perfectly computable, so exactly one of the two columns gets written.
    """
    account = _card(user.id, balance='-1650.00', apr=None)
    goal = Goal(user_id=user.id, name='Pay off the Visa', kind='payoff',
                start_amount=Decimal('-1650.00'), target_amount=Decimal('0.00'),
                account_id=account.id, currency_code='USD')
    _db.session.add(goal)
    _db.session.commit()

    backfill_goal_watermarks()
    _db.session.refresh(goal)
    assert goal.highest_progress is not None
    assert goal.hardest_band is None, 'a missing APR was drawn as a molehill'


def test_ADDING_AN_ACCOUNT_RAISES_THE_WATERMARK_ON_THAT_REQUEST(
        client, auth_headers, user):
    """B12's add-account path, and the one that needed a flush.

    *** THE FIRST VERSION OF THIS WIRING ANSWERED 400 WITH A CONFIDENT WRONG
    REASON. *** A `GoalAccount` appended in the handler is pending, so
    `link.account` is None until the row reaches the database, and
    `GoalService.current_amount` reads `link.account.balance` unguarded. The
    route caught the AttributeError and returned *"an account can carry only one
    active goal in each direction. Archive the other goal first."* — a specific,
    actionable and entirely fictional explanation of a crash. Found by the FULL
    suite, not by this file, which is the argument for running all of it.
    """
    first = _card(user.id, balance='-1650.00')
    resp = client.post(ENDPOINT, headers=auth_headers(user),
                       json={'name': 'Pay off the cards', 'kind': 'payoff',
                             'account_id': first.id, 'target_amount': '0.00'})
    goal_id = resp.get_json()['goal']['id']

    second = AccountFactory(user_id=user.id, name='Amex', type='credit',
                            balance=Decimal('-400.00'))
    second.apr = Decimal('24.99')
    _db.session.commit()

    add = client.post(f'{ENDPOINT}{goal_id}/accounts',
                      headers=auth_headers(user), json={'account_id': second.id})
    assert add.status_code == 200, add.get_json()

    stored = _db.session.get(Goal, goal_id)
    assert stored.highest_progress is not None
    assert stored.hardest_band is not None
