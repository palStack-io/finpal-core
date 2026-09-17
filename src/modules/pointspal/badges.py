"""pointsPal's contributor badges: recognition for sharing card data.

*** OWNER DECISION 2026-09-17: A BADGE, NOT COINS. *** *"when someone
contributes we just give them a badge. the whole goal is to encourage user to
contribute credit card point details"*.

*** WHY A BADGE SURVIVES THE OBJECTION THAT KILLED COINS HERE. *** §5.1's
warning is about PAYING: *"you get volume, not accuracy, and a community
dataset's entire value is accuracy."* That is a warning about a CURRENCY, where
every extra submission is worth something again. A badge is once-only and buys
nothing, so the worst a farmer gets is one spurious submission — bounded, and
cheap against the goal of encouraging real ones.

*** THESE ARE EARNED ON SHARING, AND THE NAMES SAY SO. *** §5.1 proved that
`submitted_to_community` means *"a URL was built"* and nothing more. finPal
cannot know whether a contribution was ACCEPTED: nothing links a merge back to
a user, deliberately, because D-91 keeps every identifier out of the public
payload. So these badges must never claim acceptance, and their titles say
"shared", never "accepted" or "merged". `test_pointspal_badges.py` asserts that
as an absence.

*** AND THEY PAY NOTHING. *** No coins, no altitude. That is the property that
makes an outcome-shaped reward safe at all (§14.10, and the achievement badges
took the same decision).

*** THEY LIVE IN THE MODULE BECAUSE THEY READ ITS TABLES. *** Same boundary
`get_checks()` and `get_acts()` draw, and the same words
`test_literacy_boundary.py` uses: a predicate that needs a module's tables
belongs in that module.
"""

import logging

logger = logging.getLogger(__name__)


def _shared_count(user_id):
    """How many of this user's cards they have shared with the community.

    *** COUNTS CARDS, NOT CLICKS. *** `submitted_to_community` is a flag on the
    card, so re-opening the link for the same card cannot inflate this. That
    matters more here than for a coin, because the whole risk of rewarding a
    submission is somebody pressing the button repeatedly.
    """
    from src.modules.pointspal.models import UserCard

    return UserCard.query.filter_by(
        user_id=user_id, submitted_to_community=True).count()


def get_badges() -> dict:
    """`{slug: (title, predicate)}`.

    Three tiers, on cards SHARED. The art for these is specced in
    `docs/superpowers/specs/2026-09-17-contributor-badge-art-prompt.md`; a
    missing file falls back to an emoji, so they can land one at a time.
    """
    return {
        'first-light': (
            'Shared your first card',
            lambda uid: _shared_count(uid) >= 1,
        ),
        'cairn-builder': (
            'Shared three cards',
            lambda uid: _shared_count(uid) >= 3,
        ),
        'map-maker': (
            'Shared ten cards',
            lambda uid: _shared_count(uid) >= 10,
        ),
    }
