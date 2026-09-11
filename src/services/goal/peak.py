"""The `peak` block on a goal's payload.

*** THE SERVER DECIDES THE MOUNTAIN; THE CLIENT DECIDES THE PIXELS. *** The split
follows the rule `api/v1/goals.py::_serialize` already states about `progress`,
`direction` and `current_amount`: a client must not derive them. Band selection
reads a SEEDED TABLE, and the magnitude reads balances and APRs — a client has
neither. Turning a magnitude into a height is arithmetic on one number and is
presentational, so that stays in `mountainGeometry.ts`.

*** THE CLIENTS MUST TREAT THIS KEY AS ABSENT-CAPABLE, AND THE THREE NULL-ISH
STATES ARE ALL DIFFERENT. *** This is `accounts?`'s lesson (B12) sharpened:

  `peak` MISSING       the backend predates mountains. Render the OLD card,
                       with no ridge and no mountain furniture at all.
  `unmeasured: True`   measured nothing — no account states a rate. Render the
                       flat ridge and say so.
  `magnitude: 0`       MEASURED, and the answer is zero. A 0% balance transfer
                       is common, and it is the most encouraging thing a card
                       can say. Render the smallest real mountain.

Collapsing any two of those is trap 3 in the design and is what D-77 and D-108
look like when they ship.
"""

from src.models.mountain import Mountain
from src.services.goal.mountains import (
    BAND_ORDER, band_index, mountain_for, peak_accounts, peak_magnitude,
)


def _mountain_dict(mountain):
    """A mountain, or `None`. Never a partial one."""
    if mountain is None:
        return None
    return {
        'slug': mountain.slug,
        'name': mountain.name,
        'elevation_m': mountain.elevation_m,
        # *** APPROVED BY THE OWNER 2026-09-11, AND CHECKED BEFORE THE APPROVAL
        # WAS RECORDED. *** Sent as written and never generated. Two of the six
        # were corrected rather than waved through -- Fuji's summit post office
        # is seasonal and Aconcagua's ordinary route is non-technical rather
        # than "a walk" -- because approval and correctness are different things
        # and this project has shipped fabricated figures before. If a fact is
        # ever edited, `seed_mountains.py`'s corrections are keyed on the old
        # VALUE so the edit survives every reboot.
        'fact': mountain.fact,
        'summit_note': mountain.summit_note,
    }


def _mountain_for_band(index):
    """The mountain at a band index, for the WATERMARK.

    Reads `BAND_ORDER` rather than re-querying by amount, because a watermark is
    a band that a goal no longer occupies — the figure that put it there is gone.
    """
    if index is None or not (0 <= index < len(BAND_ORDER)):
        return None
    return Mountain.query.filter_by(slug=BAND_ORDER[index]).first()


def _sole_apr(goal):
    """The APR to print, or `None`.

    *** ONE APR IS ONLY TRUE FOR A ONE-ACCOUNT GOAL. *** `_account_name` answers
    "3 accounts" rather than naming one card out of three, for exactly this
    reason, and a rate is worse than a name: printing "19.99% APR" under a goal
    spanning three cards at three rates states something about the whole goal
    that is true of none of it. So this is deliberately not "the first rate
    found" and not a weighted average either — an average APR is a number the
    user cannot check against any statement they hold.
    """
    accounts = peak_accounts(goal)
    if len(accounts) != 1:
        return None
    apr = accounts[0].apr
    return float(apr) if apr is not None else None


def peak_payload(goal):
    """`{'peak': {...}}`, to be merged into the goal payload."""
    scale, magnitude = peak_magnitude(goal)
    mountain = mountain_for(scale, magnitude)
    hardest = _mountain_for_band(goal.hardest_band)

    return {
        'peak': {
            # 'cost' (monthly interest) or 'build' (distance remaining).
            # *** THE TWO ARE NEVER COMPARED — THEY SHARE NO UNIT. *** The
            # clients carry that rule in the COLOUR, so no caption has to.
            'scale': scale,
            'magnitude': float(magnitude) if magnitude is not None else None,
            # Explicit rather than left to `magnitude is None`, because the
            # clients must not have to rediscover that distinction and because
            # zero and unknown are the pair most likely to be collapsed.
            'unmeasured': magnitude is None,
            'band': band_index(mountain.slug) if mountain is not None else None,
            'mountain': _mountain_dict(mountain),
            # *** THE WATERMARK, AND THE SUMMIT NOTE MUST READ FROM IT. *** The
            # band is recomputed from the goal's CURRENT figure, so the mountain
            # SHRINKS as the user succeeds and finishing lands on the smallest
            # one. Congratulating somebody on Table Mountain for clearing an
            # Aconcagua is the failure this prevents.
            'hardest_band': goal.hardest_band,
            'hardest_mountain': _mountain_dict(hardest),
            'apr': _sole_apr(goal),
        },
    }
