"""Everest: the one mountain every user climbs.

*** IT DEPICTS EFFORT, NEVER FINANCES, AND THAT SEPARATION IS THE WHOLE
SAFETY PROPERTY. *** Spec §14.10. A user's GOALS are their own mountains, sized
by what each asks of them, drawn from their money. Everest is not a goal: it is
the shared climb, and nothing about it is derived from how much money anybody
has. So the guarantee that retiring parked decision 3 was protecting survives —
no amount of earning, studying or buying can make a financial picture look
better than it is, because Everest is not a picture of anyone's finances.

*** ALTITUDE RATCHETS, AND GETTING THIS WRONG MAKES EVEREST BREAK DECISION 1.
*** Caught in review of the amendment, before any code. The natural formula is
`coins_earned / coins_available_to_you`, and its DENOMINATOR MOVES: a user at
6,120 m who opens their first credit card activates `debt_rates`,
`debt_limits` and `debt_minimums` -- 2,200 coins of newly-available
denominator -- and their altitude FALLS. Being punished for opening a credit
card is the exact failure this design exists to prevent, and it would have
shipped as an arithmetic consequence nobody decided.

So the displayed altitude is `max(stored, current)`. Same move, and the same
precedent, as `raise_watermark` and `raise_hardest_band`.

*** THE ALTERNATIVE WAS REJECTED ON THE MERITS: *** a denominator over ALL acts
never falls either, but then a user with no credit card can never pass ~76% of
the mountain, so their summit would sit below the top. A summit you reach at
three-quarters height is not a summit.

*** LESSONS LIFT YOU BUT CANNOT SUMMIT YOU. *** Owner decision 2026-09-17,
taken against a recommendation and recorded as such: altitude is coins PLUS
lessons. The concern -- that reading then substitutes for doing, which is
D-219 one level up -- is managed rather than ignored, by a summit ridge only
acts can climb. To a user: *"Lessons climb with you. The last stretch is yours
to walk."* It is also true to the mountain: the summit push is the part nobody
shortcuts.

*** ACTS ALONE MUST SPAN THE WHOLE MOUNTAIN. *** learnPal is a module a user
may switch off ("not now" is a toggle, not a wall), so lessons can never be
REQUIRED for any altitude.
"""

import logging
from decimal import Decimal

from src.extensions import db

logger = logging.getLogger(__name__)

# The real mountain, in metres. A shared public fact, identical for every user
# and derived from nobody's money -- which is why it is the one figure in this
# product allowed to act as a ceiling (§14.10).
SUMMIT_M = 8849

# *** THE LAST 3% IS ACTS ONLY. *** Lessons clamp here until every act
# available to the user is done. Tuning, like the ceilings and the prices; the
# INVARIANT is that some final stretch exists and that only acts cross it.
SUMMIT_RIDGE = Decimal('0.97')

# How much of the mountain reading can carry you up. Tuning.
LESSON_SHARE = Decimal('0.25')


def _act_fraction(user_id):
    """Coins earned over coins AVAILABLE TO THIS USER, in `[0, 1]`.

    *** DORMANT ACTS ARE EXCLUDED FROM BOTH SIDES. *** A user with no credit
    card is not failing `debt_rates`; it is not part of their mountain. That is
    §4.2.1's rule, and it is also why the result has to be ratcheted: the
    denominator grows when their circumstances change.
    """
    from src.repositories.coins import CoinRepository
    from src.services.literacy.acts import ACTS

    repo = CoinRepository()
    earned_by_slug = {row.act_slug: int(row.coins) for row in repo.awards(user_id)}

    available = 0
    earned = 0
    for slug, act in ACTS.items():
        try:
            covered = act.coverage(user_id)
        except Exception:
            # A broken predicate must not shrink the mountain, and must not
            # grow it either: skip it on both sides so the fraction stays a
            # statement about acts that answered.
            logger.exception('everest: coverage for %r raised — skipped', slug)
            continue
        if covered is None and slug not in earned_by_slug:
            continue                      # dormant, and never earned: not theirs
        available += int(act.ceiling)
        earned += earned_by_slug.get(slug, 0)

    if available <= 0:
        return Decimal(0)
    return min(Decimal(1), Decimal(earned) / Decimal(available))


def _lesson_fraction(user_id):
    """Lessons read over lessons that exist, in `[0, 1]`.

    *** RETURNS 0 WHEN learnPal IS ABSENT OR EMPTY, NEVER RAISES. *** The
    module is optional, so Everest must not depend on it being installed.
    """
    try:
        from src.modules.learnpal.models import LearnCompletion, LearnMilestone
        total = LearnMilestone.query.count()
        if not total:
            return Decimal(0)
        done = LearnCompletion.query.filter_by(user_id=user_id).count()
        return min(Decimal(1), Decimal(done) / Decimal(total))
    except Exception:
        logger.exception('everest: lesson fraction unavailable — treated as 0')
        return Decimal(0)


def _raw_fraction(user_id):
    """Where this user stands today, before the ratchet."""
    acts = _act_fraction(user_id)
    if acts >= 1:
        return Decimal(1)                 # the summit, and acts alone earn it

    lift = LESSON_SHARE * _lesson_fraction(user_id)
    return min(SUMMIT_RIDGE, acts + lift)


def altitude_for(user_id):
    """`{'altitude_m', 'summit_m', 'at_summit'}`. Raises the watermark.

    *** COMMITS NOTHING. *** The caller owns the transaction, matching
    `upsert_award` and `ack`.
    """
    from src.models.act_event import EverestWatermark

    raw = _raw_fraction(user_id)

    row = EverestWatermark.query.filter_by(user_id=user_id).first()
    if row is None:
        row = EverestWatermark(user_id=user_id, fraction=raw)
        db.session.add(row)
        best = raw
    else:
        # *** max(), NOT raw. *** This single call is the whole reason Everest
        # obeys decision 1: the raw fraction genuinely falls when a user's
        # circumstances widen the denominator, and a user must not lose height
        # for opening a credit card.
        best = max(Decimal(str(row.fraction)), raw)
        # Written only when it RISES, so a read is not a write on every request.
        if best > Decimal(str(row.fraction)):
            row.fraction = best

    return {
        'altitude_m': int((Decimal(SUMMIT_M) * best).to_integral_value()),
        'summit_m': SUMMIT_M,
        'at_summit': best >= 1,
    }
