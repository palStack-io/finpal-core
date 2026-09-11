"""Seed the World region set and both band tables.

Condition-keyed and never version-keyed (D-178): a row is inserted only when
its key is absent, so this runs at every boot and CANNOT undo an edit. It
deliberately does not UPDATE an existing row — overwriting an edited fact on
every restart is the same defect as the spending-type backfill reversing a
user's choice, and these rows become adminPal's to edit.

*** THE FACTS AND SUMMIT NOTES ARE DRAFTS AND EVERY FACT NEEDS CHECKING. ***
B6 reserves content to a human, and a fact in a product is a claim. Spec §21.5.
"""

import logging

from src.extensions import db
from src.models.mountain import Mountain, MountainBand

logger = logging.getLogger(__name__)

# slug, name, elevation_m, fact, summit_note
#
# Ascending, and spread across five continents on purpose: finPal is
# self-hosted worldwide, and a ladder of six European alps reads as somebody
# else's mountains to most of the people using this (§17's reasoning, applied
# to a metaphor rather than to law).
MOUNTAINS = [
    ('table-mountain', 'Table Mountain', 1085,
     'The cloud that spills over its flat top has a name of its own: the tablecloth.',
     "That's finished. Small on the map, and it still took doing."),
    ('ben-nevis', 'Ben Nevis', 1345,
     'A weather observatory ran on the summit for twenty-one years, staffed through '
     'every winter. Its readings are still used.',
     'Done. Nobody gets up Ben Nevis by accident either.'),
    ('mount-fuji', 'Mount Fuji', 3776,
     'There is a post office at the top. You can send a postcard from 3,776 metres.',
     'Cleared. Fuji takes most people two days and a night. You did this one over months.'),
    ('mount-rainier', 'Mount Rainier', 4392,
     'It carries more glacier ice than any other mountain in the lower 48 states.',
     "That's done — and Rainier is the one people train for before they go."),
    ('aconcagua', 'Aconcagua', 6961,
     'The highest mountain outside Asia — and the ordinary route is a walk. No ropes, '
     'just weeks of not stopping.',
     'Finished. Aconcagua is the highest mountain outside Asia, and the ordinary route '
     'asks for weeks of not stopping rather than any special skill. That is the shape '
     'of what you did.'),
    ('everest', 'Everest', 8849,
     'Nepal and China re-measured it together in 2020 and agreed, to the centimetre, '
     'on 8,848.86 m.',
     'That is done. Everest is the one everybody has heard of, and the part nobody '
     'photographs is the months of ordinary effort it takes to stand there.'),
]

# *** THE TOP BAND'S FLOOR **IS** THE HEIGHT CEILING IN `mountainGeometry.ts`
# (250 and 40000). *** Two independent numbers would let a peak be named Everest
# while drawn at two-thirds height, which reads as a bug and cannot be explained.
BANDS = {
    'cost':  [(0, 5), (5, 25), (25, 60), (60, 120), (120, 250), (250, None)],
    'build': [(0, 500), (500, 2000), (2000, 6000), (6000, 15000),
              (15000, 40000), (40000, None)],
}


def seed_mountains():
    """Insert anything missing. Returns (mountains_created, bands_created)."""
    have = {row[0] for row in db.session.query(Mountain.slug).all()}
    made_m = 0
    for order, (slug, name, elev, fact, note) in enumerate(MOUNTAINS):
        if slug in have:
            continue
        db.session.add(Mountain(
            slug=slug, name=name, elevation_m=elev, region='world',
            sort_order=order, fact=fact, summit_note=note))
        made_m += 1

    existing = {(b.scale, b.min_amount) for b in MountainBand.query.all()}
    made_b = 0
    for scale, rows in BANDS.items():
        for i, (lo, hi) in enumerate(rows):
            from decimal import Decimal
            if (scale, Decimal(lo)) in existing:
                continue
            db.session.add(MountainBand(
                scale=scale, min_amount=lo, max_amount=hi,
                mountain_slug=MOUNTAINS[i][0]))
            made_b += 1

    if made_m or made_b:
        db.session.commit()
        logger.info('learnPal: seeded %s mountain(s), %s band(s)', made_m, made_b)
    return made_m, made_b
