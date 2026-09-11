"""Which mountain a peak is, and the watermark the summit note reads from.

*** THE ONE THAT MATTERS: THE MOUNTAIN SHRINKS AS YOU SUCCEED. *** §3 recomputes
the band from the goal's CURRENT figure, so paying a card down walks it back
down the ladder and finishing lands on the SMALLEST mountain. A summit note read
from the current band would congratulate somebody on Table Mountain for clearing
an Aconcagua. `Goal.hardest_band` is a watermark for exactly that reason, and
`test_THE_BAND_WATERMARK_REMEMBERS_THE_WORST_IT_EVER_WAS` is the proof.

The thresholds themselves are §21.3 and were checked against real demo figures
before being chosen, not picked in the abstract.
"""

import os
import re
from datetime import datetime
from decimal import Decimal

import pytest

from src.extensions import db as _db
from src.models.goal import Goal
from src.modules.learnpal.engine import evaluate_for_goal, raise_hardest_band
from src.data.seed_mountains import seed_mountains
from src.models.mountain import Mountain, MountainBand
from src.services.goal.mountains import (
    BAND_ORDER, band_index, ground_for, mountain_for, peak_magnitude,
)
from tests.factories import UserFactory, AccountFactory


@pytest.fixture
def seeded(db):
    seed_mountains()


def _card_goal(user_id, balance=-800.0, apr='19.99', start='-1650.00', target='0.00'):
    account = AccountFactory(user_id=user_id, name='Visa', type='credit', balance=balance)
    if apr is not None:
        account.apr = Decimal(apr)
    _db.session.commit()
    goal = Goal(user_id=user_id, name='Pay off the Visa', kind='payoff',
                start_amount=Decimal(start), target_amount=Decimal(target),
                account_id=account.id, currency_code='USD')
    _db.session.add(goal); _db.session.commit()
    return goal, account


def _savings_goal(user_id, balance=5000.0, target='16000.00'):
    account = AccountFactory(user_id=user_id, name='Savings', type='savings', balance=balance)
    _db.session.commit()
    goal = Goal(user_id=user_id, name='Emergency fund', kind='savings',
                start_amount=Decimal('3200.00'), target_amount=Decimal(target),
                account_id=account.id, currency_code='USD')
    _db.session.add(goal); _db.session.commit()
    return goal, account


# ---------------------------------------------------------------------------
# The seed
# ---------------------------------------------------------------------------

def test_the_world_set_is_six_mountains_and_twelve_bands(seeded, app):
    assert Mountain.query.count() == 6
    assert MountainBand.query.filter_by(scale='cost').count() == 6
    assert MountainBand.query.filter_by(scale='build').count() == 6


def test_every_mountain_carries_a_real_elevation_a_fact_and_a_note(seeded, app):
    # A named peak with a real elevation is a CLAIM (§3) — so the number is
    # carried rather than invented at render time, and neither content column
    # ships empty.
    for m in Mountain.query.all():
        assert m.elevation_m > 0, m.slug
        assert m.fact and len(m.fact) > 20, m.slug
        assert m.summit_note and len(m.summit_note) > 20, m.slug


def test_the_mountains_ascend(seeded, app):
    ordered = Mountain.query.order_by(Mountain.sort_order).all()
    heights = [m.elevation_m for m in ordered]
    assert heights == sorted(heights)
    assert [m.slug for m in ordered] == BAND_ORDER


def test_seeding_twice_creates_nothing_and_does_not_overwrite_an_edit(db, app):
    seed_mountains()
    edited = Mountain.query.filter_by(slug='everest').one()
    edited.fact = 'A fact the owner rewrote'
    _db.session.commit()

    assert seed_mountains() == (0, 0)
    assert Mountain.query.filter_by(slug='everest').one().fact \
        == 'A fact the owner rewrote', 'the boot seeder overwrote an edit (D-178)'


# ---------------------------------------------------------------------------
# Band selection
# ---------------------------------------------------------------------------

@pytest.mark.parametrize('scale,value,expected', [
    # Checked against real demo1 figures before the thresholds were chosen.
    ('cost', 13.33, 'Ben Nevis'),
    ('build', 11000, 'Mount Rainier'),
    ('build', 2000, 'Mount Fuji'),
    ('build', 0, 'Table Mountain'),
    ('cost', 0, 'Table Mountain'),
    ('cost', 999, 'Everest'),
    ('build', 1_000_000, 'Everest'),
])
def test_a_figure_lands_on_the_right_mountain(seeded, app, scale, value, expected):
    assert mountain_for(scale, value).name == expected


@pytest.mark.parametrize('scale,boundary,expected', [
    # `min` inclusive, `max` exclusive — asserted at the seam, because an
    # off-by-one here silently renames somebody's debt.
    ('cost', 5, 'Ben Nevis'), ('cost', 4.99, 'Table Mountain'),
    ('cost', 250, 'Everest'), ('cost', 249.99, 'Aconcagua'),
    ('build', 500, 'Ben Nevis'), ('build', 499.99, 'Table Mountain'),
])
def test_the_band_seams(seeded, app, scale, boundary, expected):
    assert mountain_for(scale, boundary).name == expected


def test_THE_TWO_SCALES_HAVE_DIFFERENT_TABLES(seeded, app):
    # §3: interest-per-month and distance-remaining are different quantities in
    # different units, and one threshold cannot serve both. The same number
    # therefore lands in different places.
    assert mountain_for('cost', 300).name == 'Everest'
    assert mountain_for('build', 300).name == 'Table Mountain'


def test_UNMEASURED_IS_NOT_BAND_ZERO(seeded, app):
    # A missing APR must never draw a molehill — trap 3, D-77, D-108.
    assert mountain_for('cost', None) is None


def test_band_index_refuses_a_slug_outside_the_set(seeded, app):
    assert band_index('everest') == 5
    assert band_index('kilimanjaro') is None


# ---------------------------------------------------------------------------
# The magnitude the server computes — it must agree with mountainGeometry.ts
# ---------------------------------------------------------------------------

def test_a_card_measures_monthly_interest(seeded, app):
    user = UserFactory(id='card@test.com', name='C')
    goal, _ = _card_goal(user.id, balance=-800.0, apr='19.99')
    scale, mag = peak_magnitude(goal)
    assert scale == 'cost'
    assert float(mag) == pytest.approx(13.33, abs=0.01)


def test_AN_OVERPAID_CARD_IS_NOT_CHARGED_INTEREST(seeded, app):
    # A positive balance means the bank owes the user. `abs()` here is D-176's
    # arithmetic one table over.
    user = UserFactory(id='overpaid@test.com', name='O')
    goal, _ = _card_goal(user.id, balance=200.0, apr='19.99')
    _, mag = peak_magnitude(goal)
    assert float(mag) == 0.0


def test_a_card_with_NO_rate_is_unmeasured_not_zero(seeded, app):
    user = UserFactory(id='norate@test.com', name='N')
    goal, _ = _card_goal(user.id, balance=-800.0, apr=None)
    _, mag = peak_magnitude(goal)
    assert mag is None


def test_a_ZERO_percent_rate_IS_stated(seeded, app):
    # An intro rate is a real answer. Treating 0 as "not stated" would grey out
    # exactly the card the user was most deliberate about.
    user = UserFactory(id='zero@test.com', name='Z')
    goal, _ = _card_goal(user.id, balance=-800.0, apr='0')
    _, mag = peak_magnitude(goal)
    assert mag is not None and float(mag) == 0.0


def test_a_savings_goal_measures_DISTANCE_REMAINING_and_is_never_unmeasured(seeded, app):
    user = UserFactory(id='save@test.com', name='S')
    goal, _ = _savings_goal(user.id, balance=5000.0, target='16000.00')
    scale, mag = peak_magnitude(goal)
    assert scale == 'build'
    assert float(mag) == pytest.approx(11000.0)


def test_an_achieved_savings_goal_is_flat_not_negative(seeded, app):
    user = UserFactory(id='done@test.com', name='D')
    goal, _ = _savings_goal(user.id, balance=20000.0, target='16000.00')
    _, mag = peak_magnitude(goal)
    assert float(mag) == 0.0


# ---------------------------------------------------------------------------
# *** THE WATERMARK — WHAT THE SUMMIT NOTE READS FROM ***
# ---------------------------------------------------------------------------

def test_THE_BAND_WATERMARK_REMEMBERS_THE_WORST_IT_EVER_WAS(seeded, app):
    """*** THE TEST THIS FILE EXISTS FOR. ***

    Paying a card down makes its mountain SMALLER — §3 recomputes the band from
    the current figure, and the spec calls that a feature. It also means
    finishing lands on Table Mountain. Without a watermark the summit note would
    congratulate somebody on the smallest mountain for clearing the largest.
    """
    user = UserFactory(id='climber@test.com', name='C')
    # £20,000 at 19.99% is ~£333/mo of interest: Everest.
    goal, account = _card_goal(user.id, balance=-20000.0, apr='19.99',
                               start='-20000.00', target='0.00')
    raise_hardest_band(goal); _db.session.commit()
    assert goal.hardest_band == 5, 'did not start at Everest'

    # Pay it almost off. The CURRENT band collapses to the smallest.
    account.balance = -100.0
    _db.session.commit()
    scale, mag = peak_magnitude(goal)
    assert mountain_for(scale, mag).name == 'Table Mountain'

    raise_hardest_band(goal); _db.session.commit()

    assert goal.hardest_band == 5, \
        'the watermark fell — the summit note would name the wrong mountain'
    hardest = Mountain.query.filter_by(slug=BAND_ORDER[goal.hardest_band]).one()
    assert 'Everest' in hardest.summit_note or hardest.name == 'Everest'


def test_the_watermark_RISES_when_B12_adds_a_second_card(seeded, app):
    """A watermark rather than "the band at creation", and this is why.

    B12 made the account set mutable: `POST /goals/<id>/accounts` can add a
    second card, the interest jumps, and the band goes UP mid-life.
    """
    user = UserFactory(id='b12@test.com', name='B')
    goal, first = _card_goal(user.id, balance=-800.0, apr='19.99')
    raise_hardest_band(goal); _db.session.commit()
    started_at = goal.hardest_band

    first.balance = -20000.0          # stands in for the added card's effect
    _db.session.commit()
    raise_hardest_band(goal); _db.session.commit()

    assert goal.hardest_band > started_at


def test_an_unmeasured_peak_leaves_the_watermark_ALONE(seeded, app):
    # No APR means no band — and `None` must not be written as band 0, which
    # would claim the user faced Table Mountain when we simply do not know.
    user = UserFactory(id='unmeas@test.com', name='U')
    goal, _ = _card_goal(user.id, balance=-5000.0, apr=None)
    raise_hardest_band(goal); _db.session.commit()
    assert goal.hardest_band is None


def test_the_engine_raises_the_band_alongside_progress(seeded, app):
    # Both watermarks ride the same pass; neither is anybody's separate job.
    from src.modules.learnpal.seed import seed_milestones
    seed_milestones()
    user = UserFactory(id='both@test.com', name='B')
    goal, _ = _card_goal(user.id, balance=-20000.0, apr='19.99',
                         start='-20000.00', target='0.00')

    evaluate_for_goal(goal); _db.session.commit()

    assert goal.hardest_band == 5
    assert goal.highest_progress is not None


# ---------------------------------------------------------------------------
# The ground — what recurs, before any climbing
# ---------------------------------------------------------------------------

def test_the_ground_is_recurring_plus_card_minimums(seeded, app):
    from src.models.recurring import RecurringExpense
    user = UserFactory(id='ground@test.com', name='G')
    account = AccountFactory(user_id=user.id, name='Visa', type='credit', balance=-500.0)
    account.min_payment = Decimal('35.00')
    _db.session.add(RecurringExpense(
        user_id=user.id, description='Rent', amount=Decimal('1200'),
        frequency='monthly', start_date=datetime.utcnow(), active=True,
        paid_by=user.id, card_used='X', split_method='none', currency_code='USD'))
    _db.session.commit()

    total, recurring, minimums = ground_for(user.id)

    assert float(recurring) == pytest.approx(1200.0)
    assert float(minimums) == pytest.approx(35.0)
    assert float(total) == pytest.approx(1235.0)


def test_A_WEEKLY_ROW_IS_52_OVER_12_NOT_FOUR_WEEKS(seeded, app):
    """*** "FOUR WEEKS" IS A MONTH ONLY EIGHT TIMES A YEAR. ***

    A weekly 15 is 65 a month, not 60. An 8% under-report of the ground is not
    rounding: this is a figure the user checks against their own bank, and the
    whole layout argues from its size.
    """
    from src.models.recurring import RecurringExpense
    user = UserFactory(id='weekly@test.com', name='W')
    _db.session.add(RecurringExpense(
        user_id=user.id, description='Shop', amount=Decimal('15'),
        frequency='weekly', start_date=datetime.utcnow(), active=True,
        paid_by=user.id, card_used='X', split_method='none', currency_code='USD'))
    _db.session.commit()

    _, recurring, _ = ground_for(user.id)

    assert float(recurring) == pytest.approx(65.0, abs=0.01)


def test_a_yearly_row_is_divided_by_twelve(seeded, app):
    from src.models.recurring import RecurringExpense
    user = UserFactory(id='yearly@test.com', name='Y')
    _db.session.add(RecurringExpense(
        user_id=user.id, description='Insurance', amount=Decimal('132'),
        frequency='yearly', start_date=datetime.utcnow(), active=True,
        paid_by=user.id, card_used='X', split_method='none', currency_code='USD'))
    _db.session.commit()
    assert float(ground_for(user.id)[1]) == pytest.approx(11.0)


def test_an_INACTIVE_recurring_row_is_not_ground(seeded, app):
    # Ground is what recurs NOW. A cancelled subscription is not a floor.
    from src.models.recurring import RecurringExpense
    user = UserFactory(id='inactive@test.com', name='I')
    _db.session.add(RecurringExpense(
        user_id=user.id, description='Old gym', amount=Decimal('40'),
        frequency='monthly', start_date=datetime.utcnow(), active=False,
        paid_by=user.id, card_used='X', split_method='none', currency_code='USD'))
    _db.session.commit()
    assert float(ground_for(user.id)[1]) == 0.0


def test_AN_UNKNOWN_FREQUENCY_CONTRIBUTES_NOTHING_RATHER_THAN_A_GUESS(seeded, app):
    # A wrong ground figure is worse than a low one: the user checks it against
    # their own statement, and the layout argues from its size.
    from src.models.recurring import RecurringExpense
    user = UserFactory(id='weird@test.com', name='Q')
    _db.session.add(RecurringExpense(
        user_id=user.id, description='Odd', amount=Decimal('99'),
        frequency='fortnightly', start_date=datetime.utcnow(), active=True,
        paid_by=user.id, card_used='X', split_method='none', currency_code='USD'))
    _db.session.commit()
    assert float(ground_for(user.id)[1]) == 0.0


def test_the_ground_is_zero_not_NaN_for_somebody_with_nothing(seeded, app):
    user = UserFactory(id='bare@test.com', name='B')
    _db.session.commit()
    total, recurring, minimums = ground_for(user.id)
    assert (float(total), float(recurring), float(minimums)) == (0.0, 0.0, 0.0)


def test_one_users_ground_does_not_include_anothers(seeded, app):
    from src.models.recurring import RecurringExpense
    a = UserFactory(id='ga@test.com', name='A')
    b = UserFactory(id='gb@test.com', name='B')
    _db.session.add(RecurringExpense(
        user_id=a.id, description='Rent', amount=Decimal('1200'),
        frequency='monthly', start_date=datetime.utcnow(), active=True,
        paid_by=a.id, card_used='X', split_method='none', currency_code='USD'))
    _db.session.commit()
    assert float(ground_for(b.id)[0]) == 0.0


# ---------------------------------------------------------------------------
# *** THE LAYERING, PINNED THE OTHER WAY ROUND ***
# ---------------------------------------------------------------------------

def test_MOUNTAINS_ARE_CORE_AND_THE_WATERMARK_IS_ON_GOAL(db, app):
    """The owner's question, turned into a test.

    *** A GOAL IS DRAWN AS A PEAK WHETHER OR NOT learnPal IS INSTALLED. *** So
    the tables are core, the arithmetic is core, and `hardest_band` sits on
    `Goal`. An earlier version had all three under `src/modules/learnpal/`,
    which made a core table's column interpretable only by an optional module.
    """
    assert Mountain.__tablename__ == 'mountains'
    assert MountainBand.__tablename__ == 'mountain_bands'
    assert 'hardest_band' in Goal.__table__.columns

    # And nothing in learnpal re-declares them.
    import src.modules.learnpal as lp
    import os
    for name in os.listdir(os.path.dirname(lp.__file__)):
        if not name.endswith('.py'):
            continue
        src = open(os.path.join(os.path.dirname(lp.__file__), name)).read()
        assert '__tablename__ = ' not in src or 'learn_' in src, \
            f'{name} declares a table that is not learnPal\'s'


def test_the_mountain_tables_exist_even_with_learnpal_disabled(db, app, monkeypatch):
    # `create_all()` builds these because `src/models/__init__.py` imports them
    # UNCONDITIONALLY. If that import is ever made conditional on the module,
    # a deployment with learnPal off gets a goals page with no peaks.
    monkeypatch.delenv('LEARNPAL_ENABLED', raising=False)
    from src.models import Mountain as ExportedMountain
    assert ExportedMountain is Mountain


# ---------------------------------------------------------------------------
# The client's height ceiling and the top band's floor are ONE number
# ---------------------------------------------------------------------------

def _client_geometry_paths():
    """web-ui's copy, and mobile's if this checkout has it.

    mobile/ lives in the OUTER repo, so CI clones finpal_core without it. The
    web-ui copy is therefore the one that must always be found and mobile's is
    checked only when present — a skip here would hide the web failure too.
    """
    here = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    web = os.path.join(here, 'web-ui', 'src', 'utils', 'mountainGeometry.ts')
    mob = os.path.join(os.path.dirname(here), 'mobile', 'src', 'utils', 'mountainGeometry.ts')
    return web, (mob if os.path.exists(mob) else None)


def _ceilings_from_ts(path):
    """Read the two numbers out of the TS source as TEXT.

    Deliberately reads BYTES rather than importing or transpiling: the point is
    to catch a human editing one number in one file, and every mechanism that
    could make that invisible (a build step, a re-export, a default parameter)
    is a mechanism this test must not use. D-45's lesson — a gate that compiles
    nothing exits 0 forever.
    """
    src = open(path).read()
    found = {}
    for key in ('costCeiling', 'buildCeiling'):
        m = re.search(rf'\b{key}\s*:\s*([0-9_]+)\s*,', src)
        assert m, f'{key} not found in {path} — has the constant been renamed?'
        found[key] = int(m.group(1).replace('_', ''))
    return found


def test_THE_HEIGHT_CEILING_IS_THE_TOP_BANDS_FLOOR(db):
    """*** A PEAK MUST NOT BE NAMED ONE MOUNTAIN AND DRAWN AS ANOTHER. ***

    This is the defect the test was written for, and it was real: the top build
    band's floor was 40,000 while the client's `buildCeiling` was 20,000. Height
    saturates at the ceiling, so EVERY build goal from £20k up drew at
    `maxHeight` — an Aconcagua at £25k exactly as tall as an Everest at £60k.
    Nothing rendered yet, so nobody had seen it, and the seeder's own comment
    asserted the invariant the constant broke.

    Two independent numbers always drift. Until the server sends the ceilings
    with the bands, this gate is what keeps them equal.
    """
    seed_mountains()
    web, mobile = _client_geometry_paths()

    for scale, key in (('cost', 'costCeiling'), ('build', 'buildCeiling')):
        top = (MountainBand.query
               .filter_by(scale=scale, max_amount=None)
               .one())
        client = _ceilings_from_ts(web)[key]
        assert Decimal(top.min_amount) == Decimal(client), (
            f'{scale}: the top band starts at {top.min_amount} and the client '
            f'saturates height at {client}. Every goal between the smaller of '
            f'those and the larger is drawn at a height its band does not mean.'
        )

    if mobile:
        assert _ceilings_from_ts(web) == _ceilings_from_ts(mobile), (
            'mobile and web-ui disagree on the ceilings, so the same goal draws '
            'at two heights on two clients.'
        )


def test_the_two_client_geometry_copies_are_byte_identical(db):
    """`mountainGeometry.ts` is duplicated, not shared, and that is deliberate —
    two git repos, two build systems. The duplication is only safe while it is
    EXACT, so this compares bytes rather than behaviour: a divergence in a
    comment is a divergence about to become a divergence in a number.
    """
    web, mobile = _client_geometry_paths()
    if not mobile:
        pytest.skip('mobile/ is not in this checkout (it lives in the outer repo)')
    assert open(web, 'rb').read() == open(mobile, 'rb').read(), (
        'web-ui/src/utils/mountainGeometry.ts and mobile/src/utils/'
        'mountainGeometry.ts have diverged. Copy one over the other.'
    )


# ---------------------------------------------------------------------------
# The fact corrections, and the reason they need their own test (D-178)
# ---------------------------------------------------------------------------

def test_A_CORRECTED_FACT_REACHES_AN_ALREADY_SEEDED_DATABASE(db):
    """*** THE GAP CHECK THAT MAKES THE SEEDER SAFE IS WHAT HIDES A CHANGE. ***

    `seed_mountains` inserts only what is MISSING, so every deployment that has
    already booted keeps the OLD text and editing `MOUNTAINS` corrects nothing
    anywhere. D-178 is that lesson and it cost three separate fixes in one day.

    So this seeds, writes the superseded sentence back as an OLD deployment would
    hold it, re-seeds, and asserts the new sentence is there.
    """
    seed_mountains()
    fuji = Mountain.query.filter_by(slug='mount-fuji').one()
    stale = ('There is a post office at the top. '
             'You can send a postcard from 3,776 metres.')
    fuji.fact = stale
    _db.session.commit()

    seed_mountains()

    _db.session.expire_all()
    fixed = Mountain.query.filter_by(slug='mount-fuji').one().fact
    assert fixed != stale, 'the correction never ran on an already-seeded row'
    assert 'during the climbing season' in fixed, (
        "Fuji's summit post office is seasonal, and the old text stated it as "
        'permanent'
    )


def test_a_correction_LEAVES_AN_EDITED_ROW_ALONE(db):
    """*** KEYED ON THE OLD VALUE, NOT ON THE SLUG. ***

    These rows become adminPal's to edit. A correction keyed on the slug would
    overwrite somebody's edit on every restart, which is the same defect as the
    spending-type backfill reversing a user's choice. Keyed on the exact
    superseded sentence, an edited row simply does not match.
    """
    seed_mountains()
    fuji = Mountain.query.filter_by(slug='mount-fuji').one()
    fuji.fact = 'Something the owner wrote by hand.'
    _db.session.commit()

    seed_mountains()

    _db.session.expire_all()
    assert (Mountain.query.filter_by(slug='mount-fuji').one().fact
            == 'Something the owner wrote by hand.')


def test_the_corrections_name_sentences_that_are_actually_GONE(db):
    """A correction whose `old` text still appears in `MOUNTAINS` would fight the
    seeder: a fresh install would insert the old sentence and the correction
    would rewrite it on the same boot. Cheap to assert, and it catches a
    half-finished edit where only one of the two places was updated.
    """
    from src.data.seed_mountains import (
        FACT_CORRECTIONS, NOTE_CORRECTIONS, MOUNTAINS,
    )
    facts = {slug: (fact, note) for slug, _n, _e, fact, note in
             ((m[0], m[1], m[2], m[3], m[4]) for m in MOUNTAINS)}
    for slug, old, new in FACT_CORRECTIONS:
        assert facts[slug][0] != old, f'{slug}: MOUNTAINS still holds the OLD fact'
        assert facts[slug][0] == new, f'{slug}: MOUNTAINS does not hold the NEW fact'
    for slug, old, new in NOTE_CORRECTIONS:
        assert facts[slug][1] != old, f'{slug}: MOUNTAINS still holds the OLD note'
        assert facts[slug][1] == new, f'{slug}: MOUNTAINS does not hold the NEW note'


def test_no_fact_claims_the_post_office_is_permanent(seeded):
    """The specific overclaim that was corrected, asserted as a property.

    Not a re-statement of the sentence: it asserts the CLAIM is qualified, so a
    future rewrite that drops the qualifier fails even if the wording changes.
    """
    fuji = Mountain.query.filter_by(slug='mount-fuji').one()
    assert 'post office' in fuji.fact
    assert any(q in fuji.fact for q in ('season', 'summer', 'July', 'August')), (
        "Fuji's summit post office is only open during the climbing season; an "
        'unqualified claim tells a user they can post a card in February'
    )
