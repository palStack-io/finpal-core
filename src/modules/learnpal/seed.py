"""Seed the milestone ROWS so the engine is demonstrable before the prose lands.

*** THE ROWS ARE C1b; THE PROSE IS C1d. *** A milestone with `body_md = NULL` is
unlockable and simply has nothing to read yet, which is a better state than a
lesson that exists only in a design document. The eight below are the ones the
owner READ AND APPROVED on 2026-09-10
(`docs/superpowers/specs/2026-09-10-learnpal-lesson-drafts.md`); their bodies
are filled in by C1d.

Idempotent and CONDITION-KEYED, never version-keyed (D-178): it inserts a row
only when that slug is absent, so it can run at every boot and cannot undo an
edit. It deliberately does NOT update an existing row -- overwriting an edited
title on every restart is the same defect as the spending-type backfill
reversing a user's choice.
"""

import logging

from src.extensions import db
from src.modules.learnpal.models import LearnMilestone

logger = logging.getLogger(__name__)

# (slug, title, gear, unlock_at_progress, check_type, check_args, direction, surface)
MILESTONES = [
    ('what-a-goal-tracks', 'What a goal tracks', 'map',
     None, None, None, None, 'setup'),
    ('where-your-money-goes', 'Where your money goes', 'boots',
     None, 'categorised_transactions_at_least', {'n': 20}, None, 'mountain'),
    ('a-starter-buffer', 'The rope you tie on first', 'rope',
     '0.10', 'has_active_budget', None, None, 'mountain'),
    # 0.0 on a paydown goal: the FIRST thing on a debt climb, before any
    # progress at all. A watermark of exactly 0 satisfies `>= 0`.
    ('what-your-apr-costs', 'What your APR actually costs', 'headlamp',
     '0.000', None, None, 'paydown', 'mountain'),
    ('why-minimums-barely-move-it', 'Why the minimum barely moves it', 'ice-axe',
     '0.150', None, None, 'paydown', 'mountain'),
    ('utilisation-and-your-score', 'Utilisation, and what it touches', 'gloves',
     None, 'credit_utilisation_below', {'pct': 30}, None, 'mountain'),
    ('avalanche-vs-snowball', 'Avalanche or snowball', 'compass',
     '0.250', None, None, 'paydown', 'mountain'),
    ('fixed-vs-flexible', 'Fixed, flexible, and the ones that are neither',
     'trekking-poles',
     None, 'categories_classified_at_least', {'n': 5}, None, 'setup'),

    # -----------------------------------------------------------------------
    # Lessons 9-19. *** APPROVED BY THE OWNER 2026-09-11 AND IN NO DATABASE
    # UNTIL NOW *** -- they had existed only in
    # `docs/superpowers/specs/2026-09-10-learnpal-lesson-drafts-2.md`, and
    # nothing has a lesson until a `MILESTONES` row exists.
    #
    # *** ADDING A SLUG WORKS AT THE NEXT BOOT; CHANGING ONE DOES NOT. *** This
    # block is all NEW slugs, so `seed_milestones`'s insert-what-is-missing
    # rule delivers them and no condition-keyed correction is needed. **Editing
    # any row above would need one** (D-178, and `FACT_CORRECTIONS` in
    # `src/data/seed_mountains.py` is the worked example).
    #
    # *** AND SEEDING IS NOT DELIVERING. *** Until D-187 the only evaluator was
    # the 04:15 cron, so these eleven would have appeared in the table and
    # unlocked for nobody on a stack with no scheduler. learnPal's `on_startup`
    # catch-up is what actually hands them out.
    #
    # `body_md` is not in this tuple and is NULL for every row here AND for the
    # eight above -- the prose lives in the draft docs and reaching the database
    # is C1d. `has_body: false` is a real state the clients render as "no
    # write-up yet" rather than offering a reader onto blank space.
    #
    # The eight new `check_type`s are defined in `checks.py`; each names a rule
    # the draft did NOT specify, so each carries the decision in its docstring.
    ('income-vs-what-lands', 'Income vs what lands', 'pack-scale',
     None, 'has_two_months_of_income', None, None, 'mountain'),
    ('debt-to-income', 'Debt to income', 'slope-gauge',
     None, 'has_debt_account_and_income', None, None, 'mountain'),
    ('when-consolidating-helps-and-when-it-doesnt',
     "When consolidating helps, and when it doesn't", 'carabiner',
     None, 'has_two_or_more_debt_accounts', None, None, 'mountain'),
    ('why-a-buffer-comes-first', 'Why a buffer comes first', 'bivvy',
     None, 'has_debt_and_no_savings_goal', None, None, 'mountain'),
    # *** THE THREE ALTITUDE-GATED ONES CARRY `applies_to_direction` AND THE
    # DRAFT'S "on a savings goal" IS WHAT MAKES THAT NECESSARY. *** Without it,
    # "how much is enough" opens at 50% of paying off a credit card, which is
    # the wrong question entirely.
    ('how-much-is-enough', 'How much is enough', 'water-bottle',
     '0.500', None, None, 'accumulate', 'mountain'),
    ('sinking-funds', 'Sinking funds', 'cache',
     None, 'has_non_monthly_spending', None, None, 'mountain'),
    ('paying-yourself-first', 'Paying yourself first', 'alpine-start',
     None, 'has_recurring_income', None, None, 'mountain'),
    ('what-inflation-does-to-cash', 'What inflation does to cash', 'thermometer',
     '0.750', None, None, 'accumulate', 'mountain'),
    ('when-to-stop-saving-and-start-paying-down',
     'When to stop saving and start paying down', 'signpost',
     None, 'has_buffer_and_debt', None, None, 'mountain'),
    # "on ANY goal" in the draft, so no direction filter -- reaching 90% of
    # anything is the moment insurance is worth reading about.
    ('insurance-as-risk-transfer', 'Insurance as risk transfer', 'helmet',
     '0.900', None, None, None, 'mountain'),
    ('what-finpal-cannot-tell-you', 'What finPal cannot tell you', 'guidebook',
     None, 'has_completed_three_lessons', {'n': 3}, None, 'mountain'),
]


def seed_milestones():
    """Insert any missing milestone. Returns how many were created."""
    existing = {row[0] for row in db.session.query(LearnMilestone.slug).all()}
    created = 0
    for order, (slug, title, gear, at, check, args, direction, surface) in \
            enumerate(MILESTONES):
        if slug in existing:
            continue
        db.session.add(LearnMilestone(
            slug=slug, title=title, gear_slug=gear,
            unlock_at_progress=at, check_type=check, check_args=args,
            applies_to_direction=direction, surface=surface,
            sort_order=order,
        ))
        created += 1
    if created:
        db.session.commit()
        logger.info('learnPal: seeded %s milestone(s)', created)
    return created
