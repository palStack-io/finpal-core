"""The learnPal home: what you have read, the hardest you have climbed, what is next.

*** ITS OWN ENDPOINT RATHER THAN MORE KEYS ON `/range`. *** `range.py`'s header
states its own rule — *"one request serves four surfaces"* — and those four are
the range screen, the goals-page banner, the per-goal strip and the gear kit.
Widening that payload with home-only fields makes all four carry them, including
the strip that renders on every goal card. Two endpoints, each with one caller
shape, is cheaper than one endpoint four callers over-fetch from.

*** THERE ARE NO POINTS HERE, AND THAT IS A DECISION RATHER THAN AN OMISSION. ***
Owner decision 2026-09-11: learnPal has no points at all — no ledger, no column,
no table. Points are meant to come from ANSWERING and no quiz exists yet
(`LearnCompletion.verified_by` carries `'quiz'` as a vocabulary entry with no
writer). A points tile would therefore read **0 for ever with no way to move
it**, which is the shape this project has shipped before: a surface that looks
like a feature and is a permanent zero. Everything below is read from a row that
exists.

*** AND NOTHING HERE IS INVENTED. *** Every figure is a count or a column, every
mountain fact is seeded content a human approved, and a lesson with no body
reports `has_body: false` rather than being described. The one piece of prose
this module assembles is *why* a lesson is locked, and that is derived from the
gate itself — `unlock_at_progress` for an altitude gate, `checks.check_reason`
for a predicate — with `None` as a real answer when it cannot be derived.
"""

from decimal import Decimal

from src.extensions import db
from src.models.goal import Goal
from src.models.mountain import Mountain
from src.modules.learnpal.checks import check_reason
from src.modules.learnpal.models import LearnCompletion, LearnMilestone
from src.services.goal.mountains import BAND_ORDER


def _f(value):
    return float(value) if value is not None else None


def _mountain_dict(mountain):
    if mountain is None:
        return None
    return {
        'slug': mountain.slug,
        'name': mountain.name,
        'elevation_m': mountain.elevation_m,
        'fact': mountain.fact,
        'summit_note': mountain.summit_note,
    }


def highest_ever(user_id):
    """The hardest mountain this user has ever faced, and which goal it was.

    *** "EVER" INCLUDES ARCHIVED AND ACHIEVED GOALS, UNLIKE THE RANGE. ***
    `range_for_user` excludes archived goals because the range draws what you
    are climbing NOW. This is the opposite question, and a user who cleared an
    Aconcagua and archived the goal has still cleared an Aconcagua — dropping it
    would make the headline figure fall when somebody tidies up, which is the
    one thing a lifetime statistic must never do.

    `None` when no goal has a band yet, which is a real state: a user with only
    unmeasured paydown goals has no band at all, and answering band 0 for them
    would be the molehill `mountain_for` refuses to draw.
    """
    goal = (Goal.query
            .filter(Goal.user_id == user_id, Goal.hardest_band.isnot(None))
            # Ties broken by the oldest goal, so the headline does not reshuffle
            # between two requests when two goals share a band.
            .order_by(Goal.hardest_band.desc(), Goal.id.asc())
            .first())
    if goal is None:
        return None

    index = goal.hardest_band
    slug = BAND_ORDER[index] if 0 <= index < len(BAND_ORDER) else None
    mountain = Mountain.query.filter_by(slug=slug).first() if slug else None
    return {
        'band': index,
        'band_total': len(BAND_ORDER),
        'mountain': _mountain_dict(mountain),
        'goal_id': goal.id,
        'goal_name': goal.name,
        # So the client can say "on a goal you have since finished" honestly
        # rather than implying the climb is still under way.
        'goal_status': goal.status,
    }


def recently_finished(user_id, limit=5):
    """The lessons most recently unlocked, newest first, with what opened each.

    *** `unlocked_by_goal_id` IS NULLABLE AND THAT IS NOT A BUG. *** A
    predicate-gated lesson has no goal behind it — `evaluate_for_user` runs the
    predicate half over the whole user precisely because there is nothing to
    attribute it to — and the column is `ondelete='SET NULL'`, so a lesson
    unlocked by a goal the user has since deleted keeps the unlock and loses the
    attribution. The client must render "unlocked by <goal>" and "unlocked"
    differently rather than printing "unlocked by None".
    """
    rows = (LearnCompletion.query
            .filter_by(user_id=user_id)
            .order_by(LearnCompletion.unlocked_at.desc(), LearnCompletion.id.desc())
            .limit(limit).all())
    if not rows:
        return []

    titles = {m.slug: m for m in LearnMilestone.query.filter(
        LearnMilestone.slug.in_([r.milestone_slug for r in rows])).all()}
    goal_ids = [r.unlocked_by_goal_id for r in rows if r.unlocked_by_goal_id]
    goals = ({g.id: g for g in Goal.query.filter(Goal.id.in_(goal_ids)).all()}
             if goal_ids else {})

    out = []
    for row in rows:
        milestone = titles.get(row.milestone_slug)
        goal = goals.get(row.unlocked_by_goal_id)
        out.append({
            'slug': row.milestone_slug,
            # A completion can outlive its milestone row only if a slug is
            # removed from the seeder, which nothing does today -- but the
            # title is read through `.get`, so it degrades to the slug rather
            # than raising on a list endpoint.
            'title': milestone.title if milestone else row.milestone_slug,
            'gear_slug': milestone.gear_slug if milestone else None,
            'has_body': bool(milestone.body_md) if milestone else False,
            'verified_by': row.verified_by,
            'unlocked_at': row.unlocked_at.isoformat() if row.unlocked_at else None,
            'goal_id': row.unlocked_by_goal_id,
            'goal_name': goal.name if goal else None,
        })
    return out


def _altitude_gap(milestone, goals, directions):
    """How far the closest eligible goal is from this altitude gate.

    Returns `(gap, goal)` or `None` when no goal can ever open it — a
    paydown-only lesson for a user with no debt goal, which is the honest
    "not for you yet" case rather than a threshold to chase.

    *** MEASURED FROM THE WATERMARK, NOT FROM CURRENT PROGRESS. *** That is how
    `evaluate_for_user` awards it, and the two must agree or the home page
    promises a lesson the engine has already handed out after a bad month --
    `_strip_for` in `range.py` makes exactly this point.
    """
    best = None
    for goal in goals:
        if milestone.applies_to_direction and \
                directions.get(goal.id) != milestone.applies_to_direction:
            continue
        watermark = goal.highest_progress or Decimal('0')
        gap = milestone.unlock_at_progress - watermark
        if best is None or gap < best[0]:
            best = (gap, goal)
    return best


def what_is_next(user_id, limit=3):
    """The locked lessons, closest first, each saying WHY it is locked.

    *** THE "WHY" IS DERIVED FROM THE GATE, NEVER WRITTEN. *** An altitude gate
    reports its threshold and the goal nearest it; a predicate reports
    `checks.check_reason`, which is `None` for a `check_type` this build does
    not implement. A milestone with NEITHER gate is surfaced elsewhere (guided
    setup owns `surface = 'setup'`), so its reason is `None` too and the client
    says it is not on the mountain path rather than inventing a condition.

    Ordered by how close the user is, which is the only ordering that answers
    the question the tile asks. Predicate-gated lessons have no distance, so
    they follow the altitude ones in seeded order — deliberate, and NOT a claim
    that they are further away.
    """
    earned = {row[0] for row in db.session.query(
        LearnCompletion.milestone_slug).filter_by(user_id=user_id).all()}
    milestones = [m for m in LearnMilestone.query.order_by(
        LearnMilestone.sort_order).all() if m.slug not in earned]
    if not milestones:
        return []

    from src.services.goal.service import GoalService
    service = GoalService()
    goals = (Goal.query.filter(Goal.user_id == user_id,
                               Goal.status != 'archived').all())
    directions = {g.id: service.direction(g) for g in goals}

    altitude, other = [], []
    for m in milestones:
        row = {
            'slug': m.slug,
            'title': m.title,
            'gear_slug': m.gear_slug,
            'surface': m.surface,
            'has_body': bool(m.body_md),
            'unlock_at_progress': _f(m.unlock_at_progress),
            'applies_to_direction': m.applies_to_direction,
            'gate': None,
            'reason': None,
            'goal_id': None,
            'goal_name': None,
            'goal_progress': None,
        }

        if m.unlock_at_progress is not None:
            closest = _altitude_gap(m, goals, directions)
            row['gate'] = 'altitude'
            # *** A GATE THE WATERMARK HAS ALREADY PASSED IS PENDING, NOT NEXT,
            # AND SAYING OTHERWISE IS THE EXACT NONSENSE THE LIVE DEMO SHOWED
            # (D-187). *** The range's `_strip_for` makes the same exclusion in
            # the same words -- *"reporting it as next would ask the user to
            # climb ground they are already standing on"*. It is the state the
            # demo was stuck in for every user: `next: what-your-apr-costs` at
            # threshold 0.0 for a goal at 51.5%. With the write path wired it
            # should now only ever be a few milliseconds wide.
            if closest is not None and closest[0] <= 0:
                continue
            if closest is None:
                # No goal of the right kind exists. Say that, rather than
                # printing a percentage the user has no way to move.
                kind = ('a debt goal' if m.applies_to_direction == 'paydown'
                        else 'a savings goal' if m.applies_to_direction == 'accumulate'
                        else 'a goal')
                row['reason'] = f'Start {kind}'
                altitude.append((Decimal('1'), row))
            else:
                gap, goal = closest
                pct = int(m.unlock_at_progress * 100)
                row['reason'] = f'Reach {pct}% on {goal.name}'
                row['goal_id'] = goal.id
                row['goal_name'] = goal.name
                row['goal_progress'] = float(service.progress(goal))
                altitude.append((gap, row))
            continue

        if m.check_type:
            row['gate'] = 'check'
            row['reason'] = check_reason(m.check_type, m.check_args)
            other.append(row)
            continue

        # *** NEITHER GATE IS NOT THE SAME AS "WE DO NOT KNOW", AND THE FIRST
        # VERSION OF THIS CONFLATED THEM. *** Looking at the rendered page on
        # real demo data showed `what-a-goal-tracks` saying *"we cannot say what
        # moves it yet"* -- but its `surface` is 'setup', so finPal knows
        # exactly where it is offered. Saying "we cannot say" about something
        # the model does record is a dishonesty in the more damaging direction:
        # it teaches the user that the reasons cannot be trusted, which is the
        # one thing this tile is for.
        #
        # `None` is still the answer for a milestone with no gate AND no known
        # surface, because that genuinely is unexplainable.
        if m.surface == 'setup':
            row['gate'] = 'setup'
            row['reason'] = 'Offered while you set a goal up'
        other.append(row)

    altitude.sort(key=lambda pair: pair[0])
    return [row for _, row in altitude][:limit] + other[:max(0, limit - len(altitude))]


def stats_for_user(user_id):
    """Everything the learnPal home draws, in one payload."""
    milestones = LearnMilestone.query.all()
    earned = {row[0] for row in db.session.query(
        LearnCompletion.milestone_slug).filter_by(user_id=user_id).all()}

    with_gear = [m for m in milestones if m.gear_slug]
    return {
        'lessons': {
            'read': len([m for m in milestones if m.slug in earned]),
            'total': len(milestones),
            # *** COUNTED AND REPORTED RATHER THAN HIDDEN. *** Eleven approved
            # drafts are not seeded and four are deliberately unwritten, so a
            # lesson that is unlocked and has nothing to read is an expected
            # state. A client that offers a reader for one shows a blank page.
            'without_body': len([m for m in milestones if not m.body_md]),
        },
        'gear': {
            'earned': len([m for m in with_gear if m.slug in earned]),
            'total': len(with_gear),
        },
        'highest': highest_ever(user_id),
        'recent': recently_finished(user_id),
        'next': what_is_next(user_id),
    }
