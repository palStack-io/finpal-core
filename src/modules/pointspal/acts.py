"""pointsPal's own earnable acts: the community half of the coin economy.

*** THESE LIVE IN THE MODULE, NOT IN CORE, BECAUSE THEY READ THE MODULE'S
TABLES. *** Spec §3 and §5.1. They reach `ACTS` through
`PointsPalModule.get_acts()`, which is the mirror of `get_checks()` — and which
had **no caller at all** until 2026-09-17 (D-187: the hook was defined, the
docstring promised it, and nothing invoked it).

*** THE ONE RULE THAT GOVERNS ALL OF THIS: COINS ARE NEVER AWARDED ON
`submitted_to_community`. *** §5.1 proved that flag means *"a URL was built"*
and nothing more — `generate_pr_url` sets it in the same function that builds
the link, with no outbound call anywhere, verified by monkeypatching
`requests.get`/`post` to raise and watching the call still succeed. Paying on
it would mint currency for pressing a button, and a community dataset's entire
value is accuracy. You get volume, not accuracy, and volume is worse than
nothing here.

*** AND THE PRIVACY RULE IS NOT NEGOTIABLE (§5.1, D-91). *** A community
payload carries programme data only, never anything identifying a card or its
holder. D-91 put the card's last four in a PUBLIC issue twice while the UI
promised *"No personal data is shared."* Paying people to share raises the
stakes on that promise, so nothing here reads, sends or rewards a card
identifier. Neither act below touches `last_four`, and
`test_pointspal_acts.py` asserts that as an absence.
"""

import logging

from src.services.literacy.acts import Act

logger = logging.getLogger(__name__)


def _user_cards(user_id):
    from src.modules.pointspal.models import UserCard
    return UserCard.query.filter_by(user_id=user_id).all()


def coverage_card_rewards_recorded(user_id):
    """Share of your cards whose real earn rates you have written down.

    *** THIS PASSES THE §1 TRUTH TEST ON ITS OWN, SHARED OR NOT. *** An
    `earn_override` corrects the rates on **your** card, so the Best Card answer
    finPal gives you becomes true. Sharing it with the community is a separate,
    later choice — which is exactly why this act pays immediately and
    `contribution_accepted` does not.

    Dormant for a user with no cards: they are not failing at this.
    """
    from src.services.literacy.coverage import _share

    cards = _user_cards(user_id)
    if not cards:
        return None
    recorded = sum(1 for c in cards if c.get_earn_override())
    return _share(recorded, len(cards))


def coverage_program_verified(user_id):
    """Share of your cards you have confirmed against the issuer's own terms.

    *** STALENESS IS A COMMUNITY DATASET'S REAL ENEMY, AND THE SCHEMA ALREADY
    SAYS SO. *** `is_stale` and `review_frequency_months` exist for exactly
    this. A rate that was right two years ago is worse than a missing one,
    because the Best Card answer is confidently wrong.

    Counted from `user_last_verified_at`, which only a human action sets.
    """
    from src.services.literacy.coverage import _share

    cards = _user_cards(user_id)
    if not cards:
        return None
    verified = sum(1 for c in cards if c.user_last_verified_at is not None)
    return _share(verified, len(cards))


def payoff_card_rewards_recorded(user_id):
    """What recording the rates fixed: the Best Card answer.

    *** FAIL-CLOSED. *** Nothing recorded, nothing to say.
    """
    cards = _user_cards(user_id)
    recorded = [c for c in cards if c.get_earn_override()]
    if not recorded:
        return None

    n = len(recorded)
    card = 'card' if n == 1 else 'cards'
    return (f'{n} {card} now carry the rates you actually earn, not the ones '
            f'finPal guessed. Best Card answers from your numbers from here on.')


def payoff_program_verified(user_id):
    cards = _user_cards(user_id)
    verified = [c for c in cards if c.user_last_verified_at is not None]
    if not verified:
        return None

    n = len(verified)
    card = 'card' if n == 1 else 'cards'
    return (f'You have checked {n} {card} against the issuer’s own terms. A '
            f'rate that was right two years ago is worse than a missing one, '
            f'because the answer comes back confidently wrong.')


def get_acts() -> dict:
    """The acts pointsPal contributes. `{slug: Act}`.

    *** `contribution_accepted` IS ABSENT BY OWNER DECISION, 2026-09-17, AND
    THAT IS NOW SETTLED RATHER THAN PENDING. *** Owner: *"we arent taking
    contribtion code wise but we appreciate users to use pointpal and do
    contribution"*.

    Two reasons it stays out, and the first is a measurement:

    1. §5.1's premise for it is FALSE. The spec says *"the schema already closes
       that loop"* via `PointsProgram.contributor`. Measured: that column holds
       a free-text handle from the dataset JSON (`'palstack-team'` or `NULL`),
       there is **no GitHub handle or any other identifier on `User`**, and the
       submitted payload carries **no user identity at all** — which is D-91's
       privacy fix working exactly as intended. Nothing can connect an accepted
       contribution back to a finPal user, so the act could only ever be a
       predicate that never fires (D-187's shape).
    2. Closing that loop would mean putting an identifier into a PUBLIC issue on
       a feature whose scar is exactly that. **Not worth it for a reward.**

    *** SO CONTRIBUTION IS APPRECIATED IN WORDS, NOT IN CURRENCY. *** The two
    acts below already pay for the work that makes a contribution possible —
    recording what your cards really earn, and checking them against the
    issuer. Sharing that afterwards is thanked on the page and buys nothing,
    which is the only version that cannot be farmed: §5.1's own warning is that
    paying for contributions gets you volume, not accuracy, and a community
    dataset's entire value is accuracy.
    """
    return {
        'card_rewards_recorded': Act(
            'card_rewards_recorded', 'Record what your cards really earn', 800,
            coverage_card_rewards_recorded, payoff_card_rewards_recorded,
            surfaces=('pointspal',)),
        'program_verified': Act(
            'program_verified', 'Check a card against the issuer', 600,
            coverage_program_verified, payoff_program_verified,
            surfaces=('pointspal',)),
    }
