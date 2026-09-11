"""The two watermarks on a goal: how high it ever got, and how hard it ever was.

*** THESE ARE CORE, AND THEY USED TO LIVE IN learnPal. THAT WAS D-187. ***
`Goal.highest_progress` and `Goal.hardest_band` are columns on a CORE table, and
`services/goal/peak.py` sends `hardest_band` and `hardest_mountain` on **every**
goal payload — the summit note reads from them. Their only writers were
`raise_watermark` and `raise_hardest_band` in `src/modules/learnpal/engine.py`,
so a deployment with learnPal switched off had the column, the payload key and
no writer: the summit note was permanently dead.

That is the same ownership inversion the owner corrected on 2026-09-11 when the
`mountains` tables moved out of the module — *"does this peak and mountain thing
go into goals or learnpal, i am confused"* — surviving in the WRITE path after
the TABLES moved. Turn learnPal off and a goal still knows the hardest it ever
was, because that is a property of the climb and not of a learning module.

learnPal now IMPORTS these rather than owning them. It still owns unlocks.

*** BOTH ONLY EVER RISE, AND THAT IS WHAT MAKES THEM SAFE TO SAMPLE ANYWHERE. ***
Neither is a decision; each is `max(stored, current)`. Calling them twice, or on
a read, cannot change an answer or make one user's view depend on who looked at
what. **Unlocking a lesson is not like this** — it inserts a row and makes
content appear — which is why `engine.py` refuses to run on a read and this
module does not.
"""

import logging

from decimal import Decimal, InvalidOperation

from src.models.goal import Goal

logger = logging.getLogger(__name__)


def _as_decimal(value):
    try:
        return Decimal(str(value))
    except (InvalidOperation, TypeError, ValueError):
        return None


def raise_watermark(goal):
    """Move `goal.highest_progress` up to current progress. Never down.

    Returns the watermark after the call. Does NOT commit -- the caller owns the
    transaction, so a goal write and its unlocks land together or not at all.

    *** WHAT THE WATERMARK IS FOR — AND THE FIRST VERSION OF THIS COMMENT WAS
    WRONG. *** It said a bad month would otherwise take back a lesson already
    read. It would not: the `learn_completions` ROW is what makes an unlock
    permanent, and the engine skips any milestone that already has one. A
    sabotage rewriting the gate to read live progress left all twenty tests
    green, which is how the error was found.

    The property only a watermark can give is this: **content arrives after the
    climb.** A user peaks at 30%, slides back to 5%, and only then is a lesson
    gated at 25% seeded. Read against live progress that lesson is unreachable
    for ever for the people who have already done the hardest part of the work.
    Read against a watermark that only ever rises, it opens.
    """
    from src.services.goal.service import GoalService

    current = _as_decimal(GoalService().progress(goal))
    if current is None:
        return goal.highest_progress

    if goal.highest_progress is None or current > goal.highest_progress:
        goal.highest_progress = current
    return goal.highest_progress


def raise_hardest_band(goal):
    """Move `goal.hardest_band` up to the current band. Never down.

    *** THE MOUNTAIN SHRINKS AS YOU SUCCEED, WHICH IS WHY THIS EXISTS. *** The
    band is recomputed from the goal's CURRENT figure, so paying a card down
    walks it back down the ladder and FINISHING LANDS ON THE SMALLEST MOUNTAIN.
    A summit note read from the current band would congratulate somebody on
    Table Mountain for clearing an Aconcagua.

    Does not commit -- the caller owns the transaction.
    """
    from src.services.goal.mountains import band_index, mountain_for, peak_magnitude

    scale, magnitude = peak_magnitude(goal)
    if magnitude is None:
        return goal.hardest_band          # unmeasured: no band, and not band 0
    mountain = mountain_for(scale, magnitude)
    if mountain is None:
        return goal.hardest_band
    index = band_index(mountain.slug)
    if index is None:
        return goal.hardest_band
    if goal.hardest_band is None or index > goal.hardest_band:
        goal.hardest_band = index
    return goal.hardest_band


def refresh_watermarks(goal):
    """Raise both watermarks for one goal. Returns True if either moved.

    *** THE ONE FUNCTION EVERY GOAL PATH CALLS, BECAUSE FIVE CALL SITES EACH
    REMEMBERING TWO FUNCTIONS IS D-66's SHAPE. *** That row is a helper used
    "throughout" while five sites still called the old one, and a real user saw
    eleven budgets answering 404. Adding a third watermark later must not mean
    finding every route again.

    Does NOT commit. The return value exists so a READ path knows whether it has
    anything to persist -- a GET that commits unconditionally would write on
    every list request for ever.
    """
    before = (goal.highest_progress, goal.hardest_band)
    raise_watermark(goal)
    raise_hardest_band(goal)
    return (goal.highest_progress, goal.hardest_band) != before


def backfill_goal_watermarks():
    """Stamp the watermarks onto every goal written before D-187 was fixed.

    *** A CREATE PATH AND A BACKFILL ARE TWO DELIVERIES OF ONE CHANGE, AND THE
    SECOND IS THE ONE THAT REACHES ANYBODY (D-178). *** Wiring the write path
    fixes goals created from now on. Every goal that already exists was written
    by a version with no writer at all, so without this the fix reaches nobody
    who already uses finPal -- which, on the demo, is everybody.

    **CONDITION-KEYED, never version-keyed.** The condition is *"a goal whose
    watermarks have never been stamped"*, so it corrects instances that were
    already running instead of skipping them, and it cannot undo a watermark
    that is already higher than the current figure -- both raisers only rise, so
    re-running this is a no-op on a goal it has already touched.

    *** IT DOES NOT UNLOCK ANYTHING. *** Unlocks are learnPal's, and learnPal's
    own `on_startup` runs the catch-up pass. Core must not insert a row into an
    optional module's table.

    Returns the number of goals stamped, for the boot log.
    """
    from src.extensions import db

    # Only the never-stamped rows. A goal whose figure cannot be measured keeps
    # a NULL `hardest_band` for ever and is re-examined at each boot, which is
    # cheap and bounded: `highest_progress` is always computable, so a row is
    # re-visited only while it has no band, never while it has no progress.
    goals = Goal.query.filter(
        db.or_(Goal.highest_progress.is_(None), Goal.hardest_band.is_(None))
    ).all()
    if not goals:
        return 0

    stamped = 0
    for goal in goals:
        try:
            if refresh_watermarks(goal):
                stamped += 1
        except Exception:
            # One goal with an odd account must not cost every other goal its
            # watermark. The ground is not uncomputable because one row is bad.
            logger.exception('watermark backfill skipped goal %s', goal.id)

    if stamped:
        db.session.commit()
        logger.info('goal watermarks stamped on %s goal(s)', stamped)
    else:
        db.session.rollback()
    return stamped
