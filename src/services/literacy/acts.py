"""ACTS: what earns coins, as distinct from what opens a lesson.

*** `CHECKS` AND `ACTS` ARE TWO LISTS OVER ONE IDEA, AND KEEPING THEM APART IS
THE POINT OF THIS FILE. *** `CHECKS` answers *should this lesson open for you*.
`ACTS` answers *should this pay*. They overlap but are not the same list,
because about half of `CHECKS` describes a user's SITUATION rather than
something they did:

    has_two_or_more_debt_accounts  -> paying for it rewards a second loan
    has_debt_and_no_savings_goal   -> paying for it rewards not having one
    credit_utilisation_below       -> an outcome, not an act

Voice rule 11 is the line those cross: *name the conditions, then name what is
still yours*. A condition is not an achievement. Making it structurally
impossible to pay for one is the same move as `raise_watermark` being
ratchet-only -- the protection is a boundary, not a rule to remember.

*** THE TRUTH TEST, WHICH IS HOW A NEW ACT IS JUDGED: *** an act earns only if
doing it makes a figure finPal shows TRUER, or makes a figure it cannot
currently compute COMPUTABLE. That rejects, by construction, opening the app
(attendance), reading (that is a badge), and spending less (an outcome).

*** COVERAGE RETURNS `None` FOR A DORMANT ACT, NEVER `Decimal(0)`. *** A user
with no credit card has no APR to record. Scoring that zero would tell them they
are failing at something that does not apply to them, which is the report-card
voice decision 5 exists to forbid. Dormant means ABSENT: it pays nothing and is
not shown.
"""

import logging
from dataclasses import dataclass
from decimal import Decimal
from typing import Callable, Optional

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class Act:
    """One earnable act.

    `coverage(user_id)` returns a `Decimal` in `[0, 1]`, or `None` when the act
    is dormant for this user.

    `payoff(user_id)` returns the one sentence the award carries, built from the
    user's own figures -- or `None` when finPal cannot compute the consequence.
    *** NO COMPUTABLE CONSEQUENCE, NO SENTENCE. *** Same fail-closed rule
    `check_reason` follows.

    `universal` marks an act every user with any data at all can complete. The
    kit's affordability is checked against these alone, because the conditional
    ones depend on circumstances a user may never have.
    """

    slug: str
    title: str
    ceiling: int
    coverage: Callable[[str], Optional[Decimal]]
    payoff: Callable[[str], Optional[str]]
    universal: bool = False


# The registry. Mutable on purpose: a module may contribute its own acts through
# `ModuleBase.get_acts()`, exactly as it contributes predicates to `CHECKS`.
ACTS: dict = {}


def register_act(act: Act) -> None:
    """Add an act. *** REFUSES A SLUG ALREADY REGISTERED, RATHER THAN REPLACING
    IT. *** A module quietly changing what an existing act pays would be
    invisible from core -- the same surprise `register_check` refuses.
    """
    if act.slug in ACTS:
        logger.warning(
            'literacy: refusing to re-register act %r — it is already defined',
            act.slug)
        return
    ACTS[act.slug] = act


# ══════════════════════════════════════════════════════════════════════
# The core acts.
#
# *** THE CEILINGS AND THE GEAR PRICES ARE ONE SYSTEM. *** The eight universal
# acts below total 9,800 against a 9,200-coin kit, so a user with no debt, no
# pointsPal and no contributions can still finish it with headroom. Change a
# ceiling here or a price in `gear.py` and
# `test_acts_registry.py::test_the_universal_acts_alone_can_afford_the_whole_kit`
# is what tells you.
#
# *** THEY ARE TUNING, NOT ARCHITECTURE. *** Spec §13 leaves the exact numbers
# open until the UI exists to look at them.
# ══════════════════════════════════════════════════════════════════════

def _register_core_acts():
    """Registered on import, once. Idempotent: `register_act` refuses a duplicate."""
    from src.services.literacy import coverage, payoff

    core = [
        # ---- universal: anyone with any data at all can finish these ----
        Act('bank_connected', 'Connect your bank', 2400,
            coverage.bank_connected, payoff.bank_connected, universal=True),
        Act('transactions_categorised', 'Categorise your spending', 2000,
            coverage.transactions_categorised, payoff.transactions_categorised,
            universal=True),
        Act('categories_classified', 'Sort your categories', 1500,
            coverage.categories_classified, payoff.categories_classified,
            universal=True),
        Act('has_a_budget', 'Set a budget', 1000,
            coverage.has_a_budget, payoff.has_a_budget, universal=True),
        Act('accounts_confirmed', 'Confirm what finPal guessed', 800,
            coverage.accounts_confirmed, payoff.accounts_confirmed, universal=True),
        Act('income_recorded', 'Record what arrives', 800,
            coverage.income_recorded, payoff.income_recorded, universal=True),
        Act('taught_a_rule', 'Teach finPal a rule', 700,
            coverage.taught_a_rule, payoff.taught_a_rule, universal=True),
        Act('has_a_goal', 'Name what you are working toward', 600,
            coverage.has_a_goal, payoff.has_a_goal, universal=True),
        # ---- conditional: dormant unless the user's circumstances raise them ----
        Act('debt_rates', 'Know what your debt costs', 1200,
            coverage.debt_rates, payoff.debt_rates),
        Act('transfers_confirmed', 'Confirm your transfers', 800,
            coverage.transfers_confirmed, payoff.transfers_confirmed),
        Act('debt_limits', 'Know your limits', 600,
            coverage.debt_limits, payoff.debt_limits),
        Act('debt_minimums', 'Know your minimums', 400,
            coverage.debt_minimums, payoff.debt_minimums),
    ]
    for act in core:
        register_act(act)


_register_core_acts()
