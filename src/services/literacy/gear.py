"""Gear: the twenty-one pieces, and what they cost.

*** SEED DATA IN CODE FOR NOW, A TABLE LATER. *** The owner's plan is that
adminPal manages this eventually -- the same path `mountains` took, where a
Python dict of thresholds became two tables precisely so that tuning stopped
being a code change. Kept as a dict until the UI has settled what the numbers
should be, because moving it to a table now would freeze figures nobody has
looked at on a screen yet.

*** THE ART ALREADY EXISTS AND NEEDS NO CHANGE TO BE RE-FINISHED. *** All 21
web SVGs are `fill="currentColor"` and `GearIcon.tsx` renders the mobile PNGs
with `tintColor`, so a "finish" is a colour value on both clients rather than a
new asset.

*** THE PRICES AND THE ACT CEILINGS ARE ONE SYSTEM, NOT TWO. ***
`test_acts_registry.py` asserts that the UNIVERSAL acts alone can afford the
whole kit. Raise a price here without raising a ceiling there and that test is
what tells you.
"""

# slug -> price in coins. Ordered roughly by when a climber would want the piece,
# which is also the order the shop lists them in.
GEAR_PRICES = {
    # *** RAISED ~2.4x ON OWNER INSTRUCTION, 2026-09-17: "lets make it
    # reasonable height". *** 9,650 -> 23,550, alongside a ~2.5x raise of the
    # act ceilings (24,600 universal). Both had to move together: §7.2 caps the
    # kit at the universal total, so prices alone had 150 coins of room.
    #
    # *** RAISING THE CEILINGS REQUIRED FIXING `upsert_award` FIRST, AND THAT
    # IS THE PART WORTH READING. *** Its guard refused a raise when coverage
    # was unchanged, so an existing user at coverage 1.0 was paid NOTHING when
    # a ceiling went up — the kit would have got dearer while their earning
    # ceiling stayed put, for every user who already had one, silently.
    #
    # Cheapest 400, dearest 2,400. Headroom 1,050, which
    # `test_the_universal_acts_alone_can_afford_the_whole_kit` is what keeps
    # honest — change one side without the other and it tells you.
    'map': 400,
    'boots': 500,
    'rope': 600,
    'gloves': 600,
    'compass': 750,
    'headlamp': 850,
    'water-bottle': 850,
    'trekking-poles': 1000,
    'guidebook': 1000,
    'signpost': 1100,
    'ice-axe': 1100,
    'carabiner': 1100,
    'helmet': 1200,
    'slope-gauge': 1200,
    'pack-scale': 1350,
    'thermometer': 1350,
    'alpine-start': 1450,
    'bivvy': 1450,
    'cache': 1600,
    'tent': 1700,
    'oxygen': 2400,
}

# *** THE FINISH SET IS FINITE AND ENUMERABLE — NOT SEASONAL, NOT GENERATED. ***
# That is what keeps the "it can end" property the whole design rests on: a
# contributor works through a set with a last item rather than a treadmill.
# A finish is a rendering treatment, not an asset (see the module docstring).
GEAR_FINISHES = ('standard', 'brass', 'summit')
