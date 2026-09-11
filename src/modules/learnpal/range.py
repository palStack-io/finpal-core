"""The range: every peak a user has, grouped by scale, with the ground under it.

*** ONE REQUEST SERVES FOUR SURFACES *** — the range screen, the "Your range"
banner on the goals page, the per-goal strip on each card, and the gear kit. They
all need the same joins, and splitting them into four endpoints would mean the
goals page issuing three requests to draw one screen.

*** WHY THIS IS IN THE MODULE AND NOT IN CORE. *** Mountains, bands, the ground
and the summit notes are CORE (a goal is drawn as a peak whether or not learnPal
is installed). Lessons, gear and points are learnPal's. This assembles the second
set around the first, so turning the module off removes the range and the strip
and leaves the goal cards intact.
"""

from decimal import Decimal

from src.models.goal import Goal
from src.modules.learnpal.models import LearnCompletion, LearnMilestone
from src.services.goal.mountains import ground_for
from src.services.goal.peak import peak_payload


def _f(value):
    return float(value) if value is not None else None


def _applicable_to(goal, milestones, direction):
    """The ALTITUDE milestones this goal can unlock, in threshold order.

    *** THE STRIP COUNTS ALTITUDE MILESTONES ONLY, AND THAT IS THE HONEST
    DEFINITION. *** A predicate-gated lesson ("20 categorised transactions") has
    no goal behind it -- `evaluate_for_user` runs the predicate half over the
    whole user precisely because there is no goal to attribute it to. Counting
    those in a per-goal strip would print "3 of 8" on a card where five of the
    eight can never be opened by that card.
    """
    out = []
    for m in milestones:
        if m.unlock_at_progress is None:
            continue
        if m.applies_to_direction and m.applies_to_direction != direction:
            continue
        out.append(m)
    return sorted(out, key=lambda m: m.unlock_at_progress)


def _strip_for(goal, milestones, direction, unlocked):
    """`{read, total, next}` for one goal's card.

    `next` is the lowest threshold ABOVE the goal's watermark that is still
    locked -- derived the same way `evaluate_for_user` awards it, off
    `highest_progress` and not off current progress, or the strip would promise
    a lesson the engine has already given out after a bad month.
    """
    applicable = _applicable_to(goal, milestones, direction)
    read = [m for m in applicable if m.slug in unlocked]

    watermark = goal.highest_progress
    nxt = None
    for m in applicable:
        if m.slug in unlocked:
            continue
        if watermark is not None and Decimal(str(watermark)) >= m.unlock_at_progress:
            # Qualifies but is not recorded yet -- the nightly task has not run.
            # Reporting it as "next" would ask the user to climb ground they are
            # already standing on.
            continue
        nxt = {
            'slug': m.slug,
            'title': m.title,
            'unlock_at_progress': _f(m.unlock_at_progress),
            'gear_slug': m.gear_slug,
        }
        break

    return {
        'read': len(read),
        'total': len(applicable),
        'next': nxt,
        # Earned solid, locked at 30% opacity -- the client needs both, in order.
        'gear': [{'slug': m.gear_slug, 'milestone_slug': m.slug, 'title': m.title,
                  'earned': m.slug in unlocked}
                 for m in applicable if m.gear_slug],
    }


def range_for_user(user_id):
    """Everything the range and the strips need, in one payload."""
    from src.services.goal.service import GoalService
    service = GoalService()

    milestones = LearnMilestone.query.order_by(LearnMilestone.sort_order).all()
    unlocked = {row[0] for row in _completions(user_id)}

    goals = (Goal.query
             .filter_by(user_id=user_id)
             .filter(Goal.status != 'archived')
             .all())

    buckets = {'cost': [], 'build': []}
    for goal in goals:
        peak = peak_payload(goal)['peak']
        direction = service.direction(goal)
        entry = {
            'goal_id': goal.id,
            'name': goal.name,
            'currency_code': goal.currency_code,
            # *** `Goal` HAS NO `progress` ATTRIBUTE — IT IS COMPUTED. *** An
            # earlier version of this line read `goal.progress` behind a
            # `hasattr` guard, which would have sent `null` for every goal
            # forever while looking defensive. `GoalService.progress` is the
            # same function `_serialize` uses, so the range and the goal card
            # cannot disagree about one goal's percentage.
            'progress': float(service.progress(goal)),
            'status': goal.status,
            'peak': peak,
            'strip': _strip_for(goal, milestones, direction, unlocked),
        }
        buckets[peak['scale']].append(entry)

    # *** SORTED BY MAGNITUDE WITHIN A SCALE, AND NEVER ACROSS ONE. *** The two
    # scales share no unit, so a single ordering over both would be the exact
    # comparison the design rules out. Unmeasured peaks go LAST rather than
    # first: `None` sorting as zero would put "we do not know your rate" at the
    # small end, which is the molehill this design keeps refusing to draw.
    for scale in buckets:
        buckets[scale].sort(
            key=lambda e: (e['peak']['magnitude'] is None,
                           -(e['peak']['magnitude'] or 0)))

    total, recurring, minimums = ground_for(user_id)

    return {
        'cost': {
            'heading': "What's costing you",
            'unit': 'a month, in interest',
            'total': _f(sum((Decimal(str(e['peak']['magnitude']))
                             for e in buckets['cost']
                             if e['peak']['magnitude'] is not None), Decimal('0'))),
            'peaks': buckets['cost'],
        },
        'build': {
            'heading': "What you're building",
            'unit': 'still to save',
            'total': _f(sum((Decimal(str(e['peak']['magnitude']))
                             for e in buckets['build']
                             if e['peak']['magnitude'] is not None), Decimal('0'))),
            'peaks': buckets['build'],
        },
        # The full-width strip along the bottom of every range view.
        'ground': {
            'total': _f(total),
            'recurring': _f(recurring),
            'minimums': _f(minimums),
        },
        # Across the whole user, which is what the banner counts -- including the
        # predicate-gated lessons a per-goal strip deliberately excludes.
        'lessons': {
            'read': len([m for m in milestones if m.slug in unlocked]),
            'total': len(milestones),
        },
        'kit': [{'slug': m.gear_slug, 'milestone_slug': m.slug, 'title': m.title,
                 'earned': m.slug in unlocked}
                for m in milestones if m.gear_slug],
    }


def _completions(user_id):
    """`(milestone_slug,)` rows for this user. Its own function so the query is
    named once and the caller reads as a set comprehension."""
    return (LearnCompletion.query
            .with_entities(LearnCompletion.milestone_slug)
            .filter_by(user_id=user_id)
            .all())
