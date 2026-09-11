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
