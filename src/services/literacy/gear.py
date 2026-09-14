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
    'map': 100,
    'boots': 150,
    'rope': 200,
    'gloves': 200,
    'compass': 250,
    'headlamp': 300,
    'water-bottle': 300,
    'trekking-poles': 350,
    'guidebook': 350,
    'signpost': 400,
    'ice-axe': 450,
    'carabiner': 450,
    'helmet': 500,
    'slope-gauge': 500,
    'pack-scale': 550,
    'thermometer': 550,
    'alpine-start': 600,
    'bivvy': 650,
    'cache': 700,
    'tent': 750,
    'oxygen': 900,
}

# *** THE FINISH SET IS FINITE AND ENUMERABLE — NOT SEASONAL, NOT GENERATED. ***
# That is what keeps the "it can end" property the whole design rests on: a
# contributor works through a set with a last item rather than a treadmill.
# A finish is a rendering treatment, not an asset (see the module docstring).
GEAR_FINISHES = ('standard', 'brass', 'summit')
