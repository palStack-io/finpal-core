"""learnPal's C1c HTTP surface: the range, the lesson list and the reader.

*** THE ENGINE DECIDES WHAT OPENS; NOTHING BEHIND A ROUTE DOES. *** That is the
property most of these tests exist to pin, because the failure mode is a client
awarding itself every piece of gear by POSTing a list of slugs.
"""

from decimal import Decimal

import pytest

from src.extensions import db as _db
from src.models.goal import Goal
from src.data.seed_mountains import seed_mountains
from src.modules.learnpal.models import LearnCompletion, LearnMilestone
from src.modules.learnpal.seed import seed_milestones
from src.modules.learnpal.range import range_for_user
from tests.factories import UserFactory, AccountFactory


@pytest.fixture
def learn(db):
    seed_mountains()
    seed_milestones()
    _db.session.commit()


def _card(user_id, balance=-800.0, apr='19.99', name='Visa'):
    a = AccountFactory(user_id=user_id, name=name, type='credit', balance=balance)
    if apr is not None:
        a.apr = Decimal(apr)
    _db.session.commit()
    return a


def _payoff(user_id, account, watermark=None, band=None):
    g = Goal(user_id=user_id, name='Pay off the Visa', kind='payoff',
             start_amount=Decimal('-1650.00'), target_amount=Decimal('0.00'),
             account_id=account.id, currency_code='USD')
    if watermark is not None:
        g.highest_progress = Decimal(str(watermark))
    if band is not None:
        g.hardest_band = band
    _db.session.add(g)
    _db.session.commit()
    return g


def _savings(user_id, target='16000.00', balance=5000.0):
    a = AccountFactory(user_id=user_id, name='Savings', type='savings', balance=balance)
    _db.session.commit()
    g = Goal(user_id=user_id, name='Emergency fund', kind='savings',
             start_amount=Decimal('3200.00'), target_amount=Decimal(target),
             account_id=a.id, currency_code='USD')
    _db.session.add(g)
    _db.session.commit()
    return g


# ---------------------------------------------------------------------------
# The range payload
# ---------------------------------------------------------------------------

def test_the_two_scales_are_separate_buckets_with_their_own_units(learn):
    user = UserFactory()
    _payoff(user.id, _card(user.id))
    _savings(user.id)

    data = range_for_user(user.id)

    assert data['cost']['unit'] == 'a month, in interest'
    assert data['build']['unit'] == 'still to save'
    assert len(data['cost']['peaks']) == 1
    assert len(data['build']['peaks']) == 1
    # *** THE TOTALS ARE PER SCALE AND THERE IS NO COMBINED ONE. *** A single
    # figure over both would be adding a monthly interest cost to a savings
    # shortfall, which is the comparison the whole design refuses.
    assert 'total' not in data
    assert round(data['cost']['total'], 2) == 13.33
    assert data['build']['total'] == 11000.0


def test_an_unmeasured_peak_sorts_LAST_not_first(learn):
    """`None` sorting as zero would put "we do not know your rate" at the small
    end of the range, which is the molehill this design keeps refusing to draw.

    *** THE MEASURED PEAK HERE IS DELIBERATELY 0% APR, AND THE FIRST VERSION OF
    THIS TEST USED A LARGE ONE AND PROVED NOTHING. *** With a magnitude of 187
    against an unmeasured peak, `-(None or 0)` and the correct key agree: the
    big one is first either way. A sabotage replacing the key with
    `-(magnitude or 0)` passed cleanly.

    A MEASURED ZERO is what discriminates. Under the broken key it ties with
    unmeasured at 0 and the order is arbitrary; under the correct one, measured
    sorts ahead because `False < True`. And the pair is the exact one the design
    cares about: "this costs you nothing" and "we do not know what this costs
    you" must never be adjacent by accident.
    """
    user = UserFactory()
    _payoff(user.id, _card(user.id, apr=None, name='No rate'))
    zero = _card(user.id, balance=-500.0, apr='0', name='Balance transfer')
    g = Goal(user_id=user.id, name='0% card', kind='payoff',
             start_amount=Decimal('-500.00'), target_amount=Decimal('0.00'),
             account_id=zero.id, currency_code='USD')
    _db.session.add(g); _db.session.commit()

    peaks = range_for_user(user.id)['cost']['peaks']
    assert [p['peak']['unmeasured'] for p in peaks] == [False, True], (
        'a MEASURED zero must sort ahead of an unmeasured peak; both are 0 to a '
        'key that reads `magnitude or 0`'
    )
    assert peaks[0]['peak']['magnitude'] == 0


def test_the_ground_is_reported_with_its_two_parts(learn):
    user = UserFactory()
    _payoff(user.id, _card(user.id))
    ground = range_for_user(user.id)['ground']
    # Both halves, not just the total: the range names them separately because
    # "rent" and "card minimums" are different kinds of obligation.
    assert set(ground) == {'total', 'recurring', 'minimums'}
    assert ground['total'] == pytest.approx(
        (ground['recurring'] or 0) + (ground['minimums'] or 0))


def test_an_archived_goal_is_not_in_the_range(learn):
    user = UserFactory()
    g = _payoff(user.id, _card(user.id))
    g.status = 'archived'
    _db.session.commit()
    data = range_for_user(user.id)
    assert data['cost']['peaks'] == []


def test_the_progress_is_the_SERVICE_s_and_not_a_missing_attribute(learn):
    """`Goal` has no `progress` column. An earlier version read `goal.progress`
    behind a `hasattr` guard and would have sent null for every goal forever
    while looking defensive."""
    user = UserFactory()
    _payoff(user.id, _card(user.id))
    entry = range_for_user(user.id)['cost']['peaks'][0]
    assert entry['progress'] is not None
    assert isinstance(entry['progress'], float)


# ---------------------------------------------------------------------------
# The per-goal strip
# ---------------------------------------------------------------------------

def test_THE_STRIP_COUNTS_ALTITUDE_LESSONS_ONLY(learn):
    """A predicate-gated lesson has no goal behind it.

    `evaluate_for_user` runs the predicate half over the whole USER precisely
    because there is nothing to attribute it to, so counting those in a per-goal
    strip would print "3 of 8" on a card where five can never be opened by it.
    """
    user = UserFactory()
    g = _payoff(user.id, _card(user.id))
    strip = range_for_user(user.id)['cost']['peaks'][0]['strip']

    altitude = [m for m in LearnMilestone.query.all()
                if m.unlock_at_progress is not None
                and (m.applies_to_direction in (None, 'paydown'))]
    assert strip['total'] == len(altitude)
    assert strip['total'] < LearnMilestone.query.count()


def test_the_strip_excludes_lessons_for_the_OTHER_direction(learn):
    user = UserFactory()
    _savings(user.id)
    strip = range_for_user(user.id)['build']['peaks'][0]['strip']
    paydown_only = [m for m in LearnMilestone.query.all()
                    if m.applies_to_direction == 'paydown']
    assert paydown_only, 'fixture assumption: some lessons are paydown-only'
    for m in paydown_only:
        assert all(g['milestone_slug'] != m.slug for g in strip['gear'])


def test_NEXT_IS_THE_LOWEST_THRESHOLD_ABOVE_THE_WATERMARK(learn):
    user = UserFactory()
    # 0.18 clears the 0.00 and 0.15 gates; 0.25 is still ahead.
    _payoff(user.id, _card(user.id), watermark='0.18')
    strip = range_for_user(user.id)['cost']['peaks'][0]['strip']
    assert strip['next'] is not None
    assert strip['next']['unlock_at_progress'] == 0.25
    assert strip['next']['slug'] == 'avalanche-vs-snowball'


def test_next_skips_a_gate_already_cleared_but_not_yet_recorded(learn):
    """*** THE NIGHTLY TASK MAY NOT HAVE RUN. *** A goal can be past a threshold
    with no completion row yet. Reporting that as "next" asks the user to climb
    ground they are already standing on.
    """
    user = UserFactory()
    _payoff(user.id, _card(user.id), watermark='0.99')
    strip = range_for_user(user.id)['cost']['peaks'][0]['strip']
    assert strip['next'] is None


def test_a_completion_moves_the_strip_and_the_gear(learn):
    user = UserFactory()
    g = _payoff(user.id, _card(user.id), watermark='0.18')
    before = range_for_user(user.id)['cost']['peaks'][0]['strip']

    _db.session.add(LearnCompletion(
        user_id=user.id, milestone_slug='why-minimums-barely-move-it',
        verified_by='read', unlocked_by_goal_id=g.id))
    _db.session.commit()

    after = range_for_user(user.id)['cost']['peaks'][0]['strip']
    assert after['read'] == before['read'] + 1
    earned = {x['milestone_slug'] for x in after['gear'] if x['earned']}
    assert 'why-minimums-barely-move-it' in earned


# ---------------------------------------------------------------------------
# Through the routes
# ---------------------------------------------------------------------------

def test_the_range_route_answers_with_both_scales(learn, client, auth_headers, app):
    user = UserFactory(password_plain='testpassword')
    _payoff(user.id, _card(user.id))
    r = client.get('/api/v1/learnpal/range', headers=auth_headers(user))
    assert r.status_code == 200, 'is LEARNPAL_ENABLED set for the test app?'
    body = r.get_json()['range']
    assert body['cost']['peaks'][0]['peak']['mountain']['name'] == 'Ben Nevis'
    assert 'ground' in body and 'kit' in body


def test_the_lesson_list_does_NOT_ship_every_body(learn, client, auth_headers):
    user = UserFactory(password_plain='testpassword')
    r = client.get('/api/v1/learnpal/lessons', headers=auth_headers(user))
    assert r.status_code == 200
    lessons = r.get_json()['lessons']
    assert lessons, 'milestones should be seeded'
    for row in lessons:
        assert 'body_md' not in row, (
            'a list of twenty lessons with their prose is a large payload almost '
            'none of which gets read'
        )
        assert 'has_body' in row


def test_A_LOCKED_LESSON_ANSWERS_200_WITH_NO_BODY_NOT_403(learn, client, auth_headers):
    """Knowing a lesson EXISTS is the point of the list -- it is what the user is
    working towards. Refusing the row would make the list and the reader disagree
    about what exists."""
    user = UserFactory(password_plain='testpassword')
    r = client.get('/api/v1/learnpal/lessons/avalanche-vs-snowball',
                   headers=auth_headers(user))
    assert r.status_code == 200
    lesson = r.get_json()['lesson']
    assert lesson['locked'] is True
    assert lesson['body_md'] is None
    assert lesson['title'], 'the title is what the user is working towards'


def test_A_CLIENT_CANNOT_AWARD_ITSELF_A_LESSON(learn, client, auth_headers):
    """*** THE FAILURE MODE THIS ROUTE EXISTS TO NOT HAVE. *** If POSTing a slug
    could create a completion, a client could award itself every piece of gear
    with a for-loop."""
    user = UserFactory(password_plain='testpassword')
    before = LearnCompletion.query.filter_by(user_id=user.id).count()

    r = client.post('/api/v1/learnpal/lessons/avalanche-vs-snowball/read',
                    headers=auth_headers(user))

    assert r.status_code == 409
    assert LearnCompletion.query.filter_by(user_id=user.id).count() == before


def test_marking_an_EARNED_lesson_read_is_idempotent(learn, client, auth_headers):
    user = UserFactory(password_plain='testpassword')
    _db.session.add(LearnCompletion(
        user_id=user.id, milestone_slug='what-a-goal-tracks', verified_by='read'))
    _db.session.commit()

    for _ in range(2):
        r = client.post('/api/v1/learnpal/lessons/what-a-goal-tracks/read',
                        headers=auth_headers(user))
        assert r.status_code == 200
    assert LearnCompletion.query.filter_by(
        user_id=user.id, milestone_slug='what-a-goal-tracks').count() == 1


def test_an_unknown_slug_is_404_on_both_the_read_and_the_write(learn, client, auth_headers):
    user = UserFactory(password_plain='testpassword')
    assert client.get('/api/v1/learnpal/lessons/not-a-lesson',
                      headers=auth_headers(user)).status_code == 404
    assert client.post('/api/v1/learnpal/lessons/not-a-lesson/read',
                       headers=auth_headers(user)).status_code == 404


# ---------------------------------------------------------------------------
# The module OFF — the default every self-hoster gets
# ---------------------------------------------------------------------------

def test_THE_ROUTES_ARE_ABSENT_WHEN_THE_MODULE_IS_OFF():
    """*** THE WHOLE SUITE RUNS WITH learnPal ON, SO THE DEFAULT IS UNTESTED. ***

    `tests/conftest.py:53` sets `LEARNPAL_ENABLED=true` for every test, which is
    deliberate -- C1b's engine needs it -- but it means `default_enabled = False`,
    the state EVERY self-hoster starts in, is exercised by nothing. That is
    D-120's shape: a suite that never runs the default it appears to cover,
    because the environment is doing the enabling.

    *** AND IT CANNOT BE TESTED IN-PROCESS. *** Deleting the variable with
    `monkeypatch` and building a second app STILL shows the four routes: the
    first app's registration is not undone by the second app's decision. So this
    runs a SUBPROCESS with a clean environment, which is the boot a self-hoster
    actually gets and the only thing that answers the question honestly.

    A client must read the resulting 404 as "learnPal is not installed" and
    render nothing -- the same discipline as `peak` being absent from a goal.
    """
    import os
    import subprocess
    import sys

    # *** THE VARIABLE MUST BE GENUINELY ABSENT, NOT EMPTY. ***
    # `is_enabled` reads `os.getenv`; only `None` falls through to
    # `default_enabled`, because an empty string is `'' == 'true'` -> False,
    # i.e. an EXPLICIT opt-out. The first version of this test set it to `''`
    # and therefore proved only that an explicit off works -- a sabotage
    # flipping `default_enabled` to True passed it cleanly. Absence is the
    # state a self-hoster is in and the only one that tests the default.
    env = {k: v for k, v in os.environ.items() if k != 'LEARNPAL_ENABLED'}
    env['DEMO_MODE'] = 'false'
    assert 'LEARNPAL_ENABLED' not in env
    probe = (
        'from src import create_app;'
        "app = create_app();"
        "print('PATHS=' + ','.join(sorted("
        "  str(r) for r in app.url_map.iter_rules() if 'learnpal' in str(r))))"
    )
    out = subprocess.run([sys.executable, '-c', probe], capture_output=True,
                         text=True, env=env, timeout=120)
    line = [l for l in out.stdout.splitlines() if l.startswith('PATHS=')]
    assert line, f'probe did not report: {out.stdout[-400:]} {out.stderr[-400:]}'
    paths = line[0][len('PATHS='):]
    assert paths == '', f'learnPal routes registered with the module off: {paths}'


def test_the_same_subprocess_still_serves_GOALS_and_knows_its_mountains():
    """The other half of the same rule, and the reason the C1c redesign exists.

    Mountains, bands, the ground and the summit notes are CORE. Turning learnPal
    off must remove the range and the strip and leave the peaks alone -- if this
    fails, `hardest_band` is back to being a core column that only an optional
    module can interpret, which is the inversion the owner spotted.
    """
    import os
    import subprocess
    import sys

    env = {k: v for k, v in os.environ.items() if k != 'LEARNPAL_ENABLED'}
    env['DEMO_MODE'] = 'false'
    assert 'LEARNPAL_ENABLED' not in env      # absent, not empty -- see above
    probe = (
        'from src import create_app;'
        "app = create_app();"
        "goals = [r for r in app.url_map.iter_rules()"
        "         if str(r).startswith('/api/v1/goals')];"
        "from src.models.mountain import Mountain, MountainBand;"
        "print('GOALS=%d TABLES=%s,%s' % (len(goals), Mountain.__tablename__,"
        "                                 MountainBand.__tablename__))"
    )
    out = subprocess.run([sys.executable, '-c', probe], capture_output=True,
                         text=True, env=env, timeout=120)
    line = [l for l in out.stdout.splitlines() if l.startswith('GOALS=')]
    assert line, f'probe did not report: {out.stdout[-400:]} {out.stderr[-400:]}'
    assert 'TABLES=mountains,mountain_bands' in line[0]
    count = int(line[0].split()[0].split('=')[1])
    assert count > 0, 'goals must still be served with learnPal off'
