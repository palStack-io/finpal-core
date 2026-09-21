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


# *** THE LEGAL SURFACES, SO A TYPO IS A REFUSAL RATHER THAN AN ACT THAT NEVER
# FIRES. *** These are page IDENTITIES shared by both clients, not URLs: mobile's
# routes differ from web's and neither client may own this list.
#
# *** `settings` IS HERE EVEN THOUGH SPEC §5.2 SAYS SETTINGS EARNS NOTHING, AND
# THE TWO DO NOT CONFLICT. *** A surface is WHERE A MUTATION CAN MOVE AN ACT, not
# where an act is advertised. A user connects their bank from
# `SimpleFinSettings.tsx`, so `bank_connected`'s 2,400 coins have to land where
# they did it. Settings still shows no act line and no cairn.
SURFACES = frozenset({
    'accounts', 'transactions', 'categories', 'budgets', 'recurring',
    'rules', 'goals', 'review', 'investments', 'groups', 'settings',
    # pointsPal's own pages. A MODULE surface: the acts that use it live in
    # the module and reach the registry through `get_acts()`.
    'pointspal',
})


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
    # *** REQUIRED, AND DELIBERATELY WITHOUT A DEFAULT. *** A default of `()`
    # would let an act register with nowhere to fire and look perfectly fine.
    # The boundary is the TYPE, not a rule somebody remembers -- the same move
    # as `register_act` refusing a duplicate slug, and as `upsert_award` being
    # ratchet-only.
    surfaces: tuple
    universal: bool = False


# The registry. Mutable on purpose: a module may contribute its own acts through
# `ModuleBase.get_acts()`, exactly as it contributes predicates to `CHECKS`.
ACTS: dict = {}


def register_act(act: Act) -> None:
    """Add an act. Refuses a duplicate slug, an act declaring no surface, and an
    act naming a surface that does not exist.

    *** REFUSES A SLUG ALREADY REGISTERED, RATHER THAN REPLACING IT. *** A
    module quietly changing what an existing act pays would be invisible from
    core -- the same surprise `register_check` refuses.

    *** AND REFUSES AN ACT WITH NOWHERE TO FIRE, BECAUSE THAT FAILURE IS
    SILENT. *** An act absent from every surface never triggers a refresh: the
    award component renders nothing, no error is raised, and the nightly pass
    still pays the coins -- so it looks like it works. That is D-187's shape
    (a reader with no writer) inside the mechanism built to fix D-187.

    *** REFUSES RATHER THAN RAISING, SO ONE BAD MODULE CANNOT STOP BOOT *** --
    the same failure isolation `run_check` and `award_for_user` use.
    """
    if act.slug in ACTS:
        logger.warning(
            'literacy: refusing to re-register act %r — it is already defined',
            act.slug)
        return
    if not act.surfaces:
        logger.warning(
            'literacy: refusing act %r — it declares no surface, so no refresh '
            'would ever fire for it', act.slug)
        return
    unknown = [s for s in act.surfaces if s not in SURFACES]
    if unknown:
        logger.warning(
            'literacy: refusing act %r — unknown surface(s) %r',
            act.slug, unknown)
        return
    ACTS[act.slug] = act


def surface_acts(surface: str) -> list:
    """Every act a mutation on `surface` could move.

    *** DERIVED, NEVER STORED. *** A second map keyed the other way round is a
    second thing to keep in step with this one, and drift is this project's
    recurring failure mode.
    """
    return [a for a in ACTS.values() if surface in a.surfaces]


# ══════════════════════════════════════════════════════════════════════
# The core acts.
#
# *** THE CEILINGS AND THE GEAR PRICES ARE ONE SYSTEM. *** The eight universal
# acts below total 24,600 against a 23,550-coin kit, so a user with no debt, no
# pointsPal and no contributions can still finish it with headroom.
#
# *** RAISED ~2.5x ON OWNER INSTRUCTION, 2026-09-17: "lets make it reasonable
# height". *** Both sides moved together, because the kit cannot exceed the
# universal total (§7.2) — raising prices alone had only 150 coins of room.
#
# *** AND RAISING THEM AT ALL REQUIRED FIXING `upsert_award` FIRST. *** Its
# guard refused a raise when coverage was unchanged, so a user already at
# coverage 1.0 was paid NOTHING when a ceiling went up: the kit would have got
# dearer while their earning ceiling did not, silently, for every existing
# user. See `test_coin_ledger.py`. Change a
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
        Act('bank_connected', 'Connect your bank', 6000,
            coverage.bank_connected, payoff.bank_connected,
            surfaces=('accounts', 'settings'), universal=True),
        Act('transactions_categorised', 'Categorise your spending', 5000,
            coverage.transactions_categorised, payoff.transactions_categorised,
            surfaces=('transactions', 'review'), universal=True),
        Act('categories_classified', 'Sort your categories', 3800,
            coverage.categories_classified, payoff.categories_classified,
            surfaces=('categories', 'review'), universal=True),
        Act('has_a_budget', 'Set a budget', 2500,
            coverage.has_a_budget, payoff.has_a_budget,
            surfaces=('budgets',), universal=True),
        Act('accounts_confirmed', 'Confirm what finPal guessed', 2000,
            coverage.accounts_confirmed, payoff.accounts_confirmed,
            surfaces=('accounts', 'review'), universal=True),
        Act('income_recorded', 'Record what arrives', 2000,
            coverage.income_recorded, payoff.income_recorded,
            surfaces=('recurring',), universal=True),
        Act('taught_a_rule', 'Teach finPal a rule', 1800,
            coverage.taught_a_rule, payoff.taught_a_rule,
            surfaces=('rules',), universal=True),
        Act('has_a_goal', 'Name what you are working toward', 1500,
            coverage.has_a_goal, payoff.has_a_goal,
            surfaces=('goals',), universal=True),
        # ---- conditional: dormant unless the user's circumstances raise them ----
        Act('debt_rates', 'Know what your debt costs', 3000,
            coverage.debt_rates, payoff.debt_rates,
            surfaces=('accounts',)),
        Act('transfers_confirmed', 'Confirm your transfers', 2000,
            coverage.transfers_confirmed, payoff.transfers_confirmed,
            surfaces=('transactions', 'review')),
        Act('debt_limits', 'Know your limits', 1500,
            coverage.debt_limits, payoff.debt_limits,
            surfaces=('accounts',)),
        Act('debt_minimums', 'Know your minimums', 1000,
            coverage.debt_minimums, payoff.debt_minimums,
            surfaces=('accounts',)),
        # ---- added by the 2026-09-17 amendment (spec §14.3) ----
        # *** ALL FOUR ARE CONDITIONAL, AND THAT IS AN INVARIANT NOT A
        # PREFERENCE. *** A user with no investments and no groups must still
        # afford the whole kit, which §7.2 prices against the UNIVERSAL acts
        # alone. Flipping one of these to `universal=True` would quietly make
        # the kit unreachable for them.
        Act('holdings_priced', 'Record what you paid', 2300,
            coverage.holdings_priced, payoff.holdings_priced,
            surfaces=('investments',)),
        Act('splits_confirmed', 'Confirm a split is real', 1500,
            coverage.splits_confirmed, payoff.splits_confirmed,
            surfaces=('groups',)),
        Act('settlement_recorded', 'Record settling up', 1000,
            coverage.settlement_recorded, payoff.settlement_recorded,
            surfaces=('groups',)),
        Act('budget_adjusted', 'Revise a budget that was not working', 1300,
            coverage.budget_adjusted, payoff.budget_adjusted,
            surfaces=('budgets',)),
    ]
    for act in core:
        register_act(act)


_register_core_acts()


def _award_acts(user_id, acts) -> list:
    """Award each act in `acts` this user has newly covered. `[(slug, coins)]`.

    *** THE SHARED BODY, EXTRACTED RATHER THAN COPIED. *** `award_for_user` and
    `award_for_surface` differ only in which acts they are handed. Two copies of
    this loop would eventually drift on the dormant skip or on the per-act
    isolation, and both of those are load-bearing.

    *** DOES NOT COMMIT. *** The caller owns the transaction, so a night's awards
    land together or not at all -- the same convention `raise_watermark` follows.

    *** A DORMANT ACT IS SKIPPED, NOT AWARDED ZERO. *** `coverage` returning
    `None` means the user has nothing this act could be about, and writing a
    zero row would turn an absence into a score.

    *** THE RATCHET LIVES IN THE REPOSITORY, NOT HERE. *** This computes what the
    act is worth at today's coverage; `upsert_award` decides whether that is an
    increase. One writer, one rule -- a caller that worked the delta out itself
    would get it wrong in one place and right in four others.
    """
    from src.repositories.coins import CoinRepository

    repo = CoinRepository()
    earned = []
    for act in acts:
        try:
            covered = act.coverage(user_id)
        except Exception:
            # *** ONE BROKEN ACT MUST NOT COST A USER THE OTHERS. ***
            # Same failure isolation as `run_check`, and the same reason: a
            # predicate that raises is a bug, not a verdict.
            logger.exception('literacy: coverage for %r raised — skipped',
                             act.slug)
            continue
        if covered is None:
            continue
        coins = int(Decimal(str(act.ceiling)) * Decimal(str(covered)))
        delta = repo.upsert_award(user_id, act.slug, covered, coins)
        if delta:
            earned.append((act.slug, delta))
    return earned


def award_for_user(user_id) -> list:
    """Award every act this user has newly covered. Returns `[(slug, coins)]`.

    The nightly pass and the demo seeder use this. Does not commit.
    """
    return _award_acts(user_id, list(ACTS.values()))


def award_for_surface(user_id, surface) -> list:
    """The same, restricted to the acts a mutation on `surface` could move.

    *** THIS IS WHAT GIVES A COIN ITS MOMENT. *** Before it, `award_for_user`
    had one production caller -- a cron at 04:30 -- so coins for work done at
    breakfast appeared overnight on a page nobody was looking at.

    *** IDEMPOTENT, BECAUSE `upsert_award` IS A RATCHET. *** Calling it twice
    awards nothing twice, which is what keeps correctness independent of the
    client: one that forgets to call it loses the MOMENT, never the COINS.

    *** AN UNKNOWN SURFACE AWARDS NOTHING AND DOES NOT RAISE. *** A client
    naming a surface this build does not know is a client one release ahead,
    not an error worth a 500 -- and the nightly pass collects the coins anyway.
    """
    return _award_acts(user_id, surface_acts(surface))


def award_all_users(app) -> int:
    """The nightly pass. Commits per user. Returns the total coins awarded.

    *** IT RUNS FOR EVERY USER, NOT EVERY USER WITH A GOAL — D-205, WHICH MUST
    NOT BE RE-MADE ONE SERVICE OVER. *** That row exists because the unlock pass
    looped over `Goal.user_id`, so the population base camp is designed for never
    earned anything. Almost every act here is goal-independent, so the same
    filter would be the same defect with a different name.

    Per-user commit, so one user's failure cannot roll back everybody else's
    coins (D-61's lesson, where a shared session silently rolled writes back).
    """
    from src.extensions import db
    from src.models.user import User

    total = 0
    user_ids = [row[0] for row in db.session.query(User.id).all()]
    for user_id in user_ids:
        try:
            awarded = award_for_user(user_id)
            db.session.commit()
            total += sum(coins for _, coins in awarded)
        except Exception:
            db.session.rollback()
            logger.exception('literacy: award pass failed for %s', user_id)
    if total:
        app.logger.info('literacy: %s coin(s) awarded', total)
    return total
