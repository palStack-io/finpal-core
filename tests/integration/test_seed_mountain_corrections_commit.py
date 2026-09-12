"""D-188: a correction the seeder does not COMMIT is a correction that did not ship.

*** THE TEST IS A ROLLBACK, BECAUSE "IT IS IN THE SESSION" IS NOT "IT IS IN THE
DATABASE". *** `_apply_corrections` issues bulk UPDATEs and `seed_mountains` used
to commit only `if made_m or made_b` -- which is False on precisely the
deployments a correction is FOR, since one that already holds every mountain has
nothing to create. The UPDATE therefore sat pending and reached disk only
because some later, unrelated boot step committed the transaction.

That is invisible to every ordinary test: inside one test transaction the
corrected value reads back perfectly. Rolling back is what separates "the
session knows" from "the row changed".
"""

from src.extensions import db as _db
from src.data.seed_mountains import (
    FACT_CORRECTIONS, NOTE_CORRECTIONS, seed_mountains,
)
from src.models.mountain import Mountain


def _revert(slug, old_value, column):
    """Put a row back into the superseded state a pre-correction boot holds."""
    Mountain.query.filter_by(slug=slug).update({column: old_value})
    _db.session.commit()


def test_A_FACT_CORRECTION_SURVIVES_A_ROLLBACK_ON_AN_ALREADY_SEEDED_DATABASE(
        db, app):
    seed_mountains()                      # first boot: everything is created
    slug, old, new = FACT_CORRECTIONS[0]
    _revert(slug, old, 'fact')

    made_m, made_b = seed_mountains()     # second boot: nothing to CREATE
    assert (made_m, made_b) == (0, 0), \
        'the fixture did not reproduce an already-seeded instance'

    # *** THE ASSERTION THAT MATTERS. *** Before the fix the row read correctly
    # here and reverted the moment anything rolled back.
    _db.session.rollback()
    assert Mountain.query.filter_by(slug=slug).first().fact == new, \
        'the correction was applied to the session and never committed'


def test_a_summit_note_correction_is_committed_too(db, app):
    """Both correction tables run through one commit, and a test on only the
    first would go blind if the second were ever moved."""
    if not NOTE_CORRECTIONS:
        return
    seed_mountains()
    slug, old, new = NOTE_CORRECTIONS[0]
    _revert(slug, old, 'summit_note')

    seed_mountains()
    _db.session.rollback()
    assert Mountain.query.filter_by(slug=slug).first().summit_note == new


def test_a_boot_with_nothing_to_correct_commits_nothing_and_still_works(db, app):
    """The ordinary steady-state boot: idempotent, and not made chatty by the
    fix. A seeder that committed unconditionally would log a correction count
    of zero at every restart."""
    seed_mountains()
    assert seed_mountains() == (0, 0)
    slug, _old, new = FACT_CORRECTIONS[0]
    _db.session.rollback()
    assert Mountain.query.filter_by(slug=slug).first().fact == new
