"""D-188's second half: one boot step must not throw away another's work.

*** THIS IS A GUARD ON THE ORDER OF `src/__init__.py`'s BOOT BLOCK, NOT ON ANY
ONE FUNCTION. *** `seed_mountains()` runs at line ~397 and
`backfill_goal_watermarks()` at ~416, both inside the first-boot lock, and they
share a session. The first applies condition-keyed fact corrections; the second
had an `else: db.session.rollback()` on its nothing-to-do path.

On a steady-state boot -- already seeded, every goal already stamped -- that is
every boot after the first, and the rollback discarded the corrections on
exactly the deployments the corrections exist for. **Neither function was wrong
on its own**, which is why no test of either would have seen it: it is a
composition defect, and the only way to catch one is to compose them.

*** THE ROLLBACK AT THE END IS THE ASSERTION. *** "The session knows" is not
"the row changed", and inside a single test transaction the two are
indistinguishable.
"""

from src.extensions import db as _db
from src.data.seed_mountains import FACT_CORRECTIONS, seed_mountains
from src.models.mountain import Mountain
from src.services.goal.watermark import backfill_goal_watermarks


def test_THE_WATERMARK_BACKFILL_DOES_NOT_DISCARD_THE_MOUNTAIN_CORRECTIONS(
        db, app):
    """The two boot steps, in the order `src/__init__.py` runs them."""
    seed_mountains()
    slug, old, new = FACT_CORRECTIONS[0]
    # A deployment that booted before the correction shipped.
    Mountain.query.filter_by(slug=slug).update({'fact': old})
    _db.session.commit()

    seed_mountains()                  # applies the correction
    stamped = backfill_goal_watermarks()   # nothing to stamp: no goals exist
    assert stamped == 0, 'the fixture did not reproduce the nothing-to-do path'

    _db.session.rollback()
    assert Mountain.query.filter_by(slug=slug).first().fact == new, \
        'a later boot step rolled back an earlier one'
