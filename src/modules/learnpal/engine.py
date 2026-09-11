"""The unlock engine: altitude watermark in, permanent unlocks out.

Two triggers, and **they coexist** -- altitude is an additional mechanism, not a
replacement for `check_type`:

* **Altitude.** A milestone with `unlock_at_progress` opens when a goal's
  server-computed progress first reaches it.
* **Predicates.** A milestone with a `check_type` opens when that pure function
  in `checks.py` answers True.

*** WHAT THE WATERMARK IS FOR — AND MY FIRST VERSION OF THIS COMMENT WAS
WRONG. *** It said a bad month would otherwise take back a lesson already read.
It would not: the `learn_completions` ROW is what makes an unlock permanent
(design decision 4), and the engine skips any milestone that already has one.
A sabotage rewriting the gate to read live progress left all twenty tests green,
which is how the error was found.

The property only `highest_progress` can give is this: **content arrives after
the climb.** A user peaks at 30%, slides back to 5%, and only then is a lesson
gated at 25% seeded — which is precisely what C1d does to every existing user.
Read against live progress, that lesson is unreachable forever for the people
who have already done the hardest part of the work. Read against a watermark
that only ever rises, it opens.

*** NOTHING HERE RUNS ON A READ. *** Every entry point is a write path, the
nightly task or learnPal's own startup catch-up. An engine that unlocked during
a GET would make a list endpoint mutate the database, which is the kind of
surprise that makes a deploy's behaviour depend on who looked at what.

*** AND UNTIL D-187 THE "WRITE PATH" HALF OF THAT SENTENCE WAS FICTION. ***
`evaluate_for_goal` had zero non-test callers: this docstring, and `routes.py`'s
*"the engine is reached from the goal write path and the nightly task"*, both
asserted a call site nobody had ever wired. So the 04:15 cron was the only
entry point in existence, and on the llm demo -- which has no scheduler service
-- there was none at all. `demo1` had four goals, one of them FINISHED, and
`lessons: {read: 0, total: 8}`. **Stating a call site in prose is not making
one**, and `test_learnpal_engine.py` calls this module directly, so it proves
the engine works and can say nothing about whether anything calls it (D-106).

*** THE WATERMARKS ARE RAISED IN TWO PLACES AND ONLY ONE OF THEM IS HERE. ***
Core raises them on the goal read AND write paths, beside `stamp_if_achieved`,
because they only ever rise and sampling them more often makes *"the hardest it
ever got"* more true rather than less. **Unlocks are not like that** and stay
off the read path, which is what the paragraph above is about.
"""

import logging
from sqlalchemy.exc import IntegrityError

from src.extensions import db
from src.models.goal import Goal
from src.modules.learnpal.checks import run_check
from src.modules.learnpal.models import LearnCompletion, LearnMilestone

logger = logging.getLogger(__name__)


# *** THE TWO WATERMARK RAISERS ARE CORE'S, NOT THIS MODULE'S — D-187. ***
# They used to be defined here, which put the only writers of two columns on a
# CORE table (`Goal.highest_progress`, `Goal.hardest_band`) inside an OPTIONAL
# module. `services/goal/peak.py` sends `hardest_band` and `hardest_mountain` on
# every goal payload and the summit note reads them, so with learnPal off the
# column existed, the key was sent and nothing ever filled it in.
#
# Imported rather than re-implemented so there is ONE copy: the engine still
# raises both at the start of every evaluation, because an altitude gate must
# see the state AFTER this pass rather than before it.
from src.services.goal.watermark import raise_hardest_band, raise_watermark  # noqa: F401


def _already_unlocked(user_id):
    rows = db.session.query(LearnCompletion.milestone_slug).filter(
        LearnCompletion.user_id == user_id).all()
    return {r[0] for r in rows}


def _unlock(user_id, slug, verified_by='read', goal_id=None):
    """Insert one completion. Idempotent against the unique constraint.

    The in-memory `already` set covers the ordinary case; this catches the race
    where two evaluations run at once -- a nightly task and a goal write, say.
    *** THE SAVEPOINT MATTERS: *** without `begin_nested`, an IntegrityError
    poisons the whole session and every LATER unlock in the same pass is lost,
    so one duplicate would silently cost the user the rest of their unlocks.
    """
    try:
        with db.session.begin_nested():
            db.session.add(LearnCompletion(
                user_id=user_id,
                milestone_slug=slug,
                verified_by=verified_by,
                unlocked_by_goal_id=goal_id,
            ))
        return True
    except IntegrityError:
        return False


def evaluate_for_user(user_id, goal=None):
    """Unlock everything this user now qualifies for. Returns the new slugs.

    `goal` narrows the ALTITUDE half to one goal, for the goal-write path. The
    predicate half always runs over the whole user, because a predicate has no
    goal behind it.

    Does not commit.
    """
    milestones = LearnMilestone.query.order_by(LearnMilestone.sort_order).all()
    if not milestones:
        return []

    already = _already_unlocked(user_id)
    goals = [goal] if goal is not None else Goal.query.filter_by(user_id=user_id).all()

    # The watermark is raised for every goal in scope FIRST, so an altitude gate
    # sees the state after this evaluation rather than before it.
    for g in goals:
        raise_watermark(g)
        # The band watermark rides the same pass. Both only ever rise, and both
        # are read by things that must not change when a user has a bad month.
        raise_hardest_band(g)

    from src.services.goal.service import GoalService
    service = GoalService()

    unlocked = []
    for m in milestones:
        if m.slug in already:
            continue

        opened_by_goal = None
        opens = False

        if m.unlock_at_progress is not None:
            for g in goals:
                if g.highest_progress is None:
                    continue
                if m.applies_to_direction and \
                        service.direction(g) != m.applies_to_direction:
                    continue
                if g.highest_progress >= m.unlock_at_progress:
                    opens, opened_by_goal = True, g.id
                    break

        # `or`, not `elif`: a milestone may carry BOTH triggers (lesson 3 does),
        # and either one opening it is enough.
        if not opens and m.check_type:
            opens = run_check(m.check_type, user_id, m.check_args)

        if opens and _unlock(user_id, m.slug, 'read', opened_by_goal):
            already.add(m.slug)
            unlocked.append(m.slug)

    if unlocked:
        logger.info('learnpal: unlocked %s for %s', ','.join(unlocked), user_id)
    return unlocked


def evaluate_for_goal(goal):
    """Convenience for the goal write path."""
    return evaluate_for_user(goal.user_id, goal=goal)


def sync_all_users(app):
    """The nightly pass. Commits per user.

    *** THIS EXISTS BECAUSE PROGRESS MOVES WITHOUT ANY GOAL BEING WRITTEN. ***
    A goal's progress is derived from account balances, so paying a card down
    changes it with no goal row touched -- the write-path hook alone would never
    notice. Per-user commit so one user's failure cannot roll back everybody
    else's unlocks.
    """
    user_ids = [row[0] for row in db.session.query(Goal.user_id).distinct().all()]
    total = 0
    for user_id in user_ids:
        try:
            unlocked = evaluate_for_user(user_id)
            db.session.commit()
            total += len(unlocked)
        except Exception:
            db.session.rollback()
            logger.exception('learnpal: nightly evaluation failed for %s', user_id)
    if total:
        app.logger.info('learnPal: %s milestone(s) unlocked', total)
    return total
