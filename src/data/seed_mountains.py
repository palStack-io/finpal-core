"""Seed the World region set and both band tables.

Condition-keyed and never version-keyed (D-178): a row is inserted only when
its key is absent, so this runs at every boot and CANNOT undo an edit. It
deliberately does not UPDATE an existing row — overwriting an edited fact on
every restart is the same defect as the spending-type backfill reversing a
user's choice, and these rows become adminPal's to edit.

*** APPROVED BY THE OWNER 2026-09-11, AND EVERY FACT WAS CHECKED BEFORE THE
APPROVAL WAS RECORDED. *** Approval and correctness are different things: a fact
in a product is a claim, and approving an unverified one ships it anyway. So each
elevation and each fact was verified and TWO were corrected rather than passed
through:

  - Fuji's summit post office is SEASONAL, open during the climbing season. The
    draft read "there is a post office at the top", which states it as permanent.
  - Aconcagua's draft read "the ordinary route is a walk. No ropes." The Normal
    Route genuinely needs no technical climbing, but calling a 6,961 m peak with
    a real fatality rate "a walk" trivialises it — and the metaphor is supposed
    to respect the work, not minimise it.

Checked and left as written: Table Mountain's "tablecloth" cloud; Ben Nevis's
summit observatory, which ran 1883–1904, twenty-one years, staffed through the
winters; Rainier carrying more glacier ice than any other peak in the lower 48;
Everest's 2020 joint Nepal–China re-measurement at 8,848.86 m, which agrees with
the 8,849 stored here.

Elevations: Table Mountain 1,085 sits inside the 1,084.6–1,086 m range cited for
Maclear's Beacon; Ben Nevis 1,345 matches the 2016 re-survey; Fuji 3,776,
Rainier 4,392, Aconcagua 6,961 and Everest 8,849 all check out.

Spec §21.5. This project has shipped fabricated figures before, which is why the
check happened rather than only the sign-off.
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
     'There is a post office at the summit during the climbing season. You can post a '
     'card from 3,776 metres.',
     'Cleared. Fuji takes most people two days and a night. You did this one over months.'),
    ('mount-rainier', 'Mount Rainier', 4392,
     'It carries more glacier ice than any other mountain in the lower 48 states.',
     "That's done — and Rainier is the one people train for before they go."),
    ('aconcagua', 'Aconcagua', 6961,
     'The highest mountain outside Asia. Its ordinary route needs no technical '
     'climbing — what it asks for is weeks of altitude and not stopping.',
     'Finished. Aconcagua is the highest mountain outside Asia, and its ordinary route '
     'asks for weeks of endurance rather than any special skill. That is the shape of '
     'what you did.'),
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


# *** THE TWO CORRECTED FACTS NEED THIS OR THEY NEVER SHIP. ***
#
# `seed_mountains` inserts only what is MISSING, which is what makes it safe to
# run at every boot -- and is exactly what makes a change to an existing row
# invisible. Every deployment that has already booted holds the OLD text, so
# editing `MOUNTAINS` above corrects nothing anywhere. That is D-178, which cost
# three separate fixes in one day: *a seed change is not shipped until a
# condition-keyed correction exists for the rows the old version wrote.*
#
# Keyed on the OLD VALUE, never on a version marker or on the slug alone, so it
# can only ever replace the specific wrong sentence. A row somebody has since
# edited through adminPal does not match and is left alone -- which is the same
# reason the seeder does not UPDATE in the first place.
FACT_CORRECTIONS = [
    # Fuji's summit post office is SEASONAL; the old text stated it as permanent.
    ('mount-fuji',
     'There is a post office at the top. You can send a postcard from 3,776 metres.',
     'There is a post office at the summit during the climbing season. You can post a '
     'card from 3,776 metres.'),
    # Aconcagua: the Normal Route needs no technical climbing, but calling a
    # 6,961 m peak with a real fatality rate "a walk" trivialises it.
    ('aconcagua',
     'The highest mountain outside Asia — and the ordinary route is a walk. No ropes, '
     'just weeks of not stopping.',
     'The highest mountain outside Asia. Its ordinary route needs no technical '
     'climbing — what it asks for is weeks of altitude and not stopping.'),
]

NOTE_CORRECTIONS = [
    ('aconcagua',
     'Finished. Aconcagua is the highest mountain outside Asia, and the ordinary route '
     'asks for weeks of not stopping rather than any special skill. That is the shape '
     'of what you did.',
     'Finished. Aconcagua is the highest mountain outside Asia, and its ordinary route '
     'asks for weeks of endurance rather than any special skill. That is the shape of '
     'what you did.'),
]


def _apply_corrections():
    """Replace the exact superseded sentences. Returns how many rows changed."""
    changed = 0
    for slug, old, new in FACT_CORRECTIONS:
        changed += (Mountain.query
                    .filter(Mountain.slug == slug, Mountain.fact == old)
                    .update({'fact': new}, synchronize_session=False))
    for slug, old, new in NOTE_CORRECTIONS:
        changed += (Mountain.query
                    .filter(Mountain.slug == slug, Mountain.summit_note == old)
                    .update({'summit_note': new}, synchronize_session=False))
    return changed


def seed_mountains():
    """Insert anything missing. Returns (mountains_created, bands_created)."""
    have = {row[0] for row in db.session.query(Mountain.slug).all()}
    # Corrections run FIRST and unconditionally: a deployment that already has
    # every row would otherwise return early-ish and never reach them.
    corrected = _apply_corrections()
    if corrected:
        logger.info('mountain fact corrections applied to %d row(s)', corrected)
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
